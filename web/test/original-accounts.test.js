import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

/** Ejecuta el handler real con Auth/REST interceptados. Ninguna petición sale a Internet. */
async function fixture() {
  const profiles = [
    {
      id: "admin",
      display_name: "Esteban",
      role: "admin",
      active: true,
      contact_email: "",
      login_name: null,
    },
    {
      id: "csr",
      display_name: "Ana",
      role: "csr",
      active: true,
      contact_email: "",
      login_name: "Ana",
    },
    { id: "inactive", display_name: "Baja", role: "admin", active: false },
    {
      id: "client",
      display_name: "Cliente",
      role: "client",
      active: true,
      login_name: "acme",
    },
  ];
  const ids = {};
  profiles.forEach((row, index) => {
    row.alias = row.id;
    row.id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    ids[row.alias] = row.id;
  });
  const access = [{ user_id: ids.client, customer: "ACME", active: true }],
    attempts = [],
    events = [],
    writes = [];
  const response = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetch = async (target, options = {}) => {
    const url = new URL(String(target)),
      path = url.pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    const method = options.method || "GET";
    const headers = new Headers(options.headers);
    if (path === "/auth/v1/user") {
      const id = headers.get("authorization")?.replace("Bearer ", "");
      return profiles.some((row) => row.id === id)
        ? response({ id, email: id + "@example.test" })
        : response({ msg: "Invalid JWT" }, 401);
    }
    if (path === "/auth/v1/token") {
      assert.equal(
        headers.get("apikey"),
        "public-test-key",
        "Auth password login usa la clave pública",
      );
      if (body.password !== "Solo-prueba-123")
        return response({ msg: "Wrong password" }, 400);
      const id = body.email.split("@")[0];
      return response({
        access_token: "test-token",
        refresh_token: "test-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id, email: body.email },
      });
    }
    if (path.startsWith("/auth/v1/admin/users/")) {
      const id = path.split("/").at(-1);
      if (method === "PUT") writes.push({ method, path, body });
      return response({ id, email: id + "@example.test" });
    }
    const table = path.split("/").at(-1);
    if (table === "ops_record_login_failure") {
      let row = attempts.find((item) => item.account_key === body.p_key);
      if (!row) {
        row = { account_key: body.p_key, failures: 0 };
        attempts.push(row);
      }
      row.failures += 1;
      if (row.failures >= 5)
        row.blocked_until = new Date(Date.now() + 900000).toISOString();
      return response(null);
    }
    const records = {
      profiles,
      portal_access: access,
      original_login_attempts: attempts,
      admin_events: events,
    }[table];
    if (!records) throw Error(`Petición sin fixture: ${method} ${path}`);
    const idField = url.searchParams.has("id")
      ? "id"
      : url.searchParams.has("user_id")
        ? "user_id"
        : "account_key";
    const selected = url.searchParams.get(idField)?.slice(3);
    const filtered = records.filter(
      (row) => !selected || row[idField] === selected,
    );
    if (method === "PATCH") {
      filtered.forEach((row) => Object.assign(row, body));
      writes.push({ method, table, body });
      return response(null);
    }
    if (method === "POST") {
      records.push(body);
      return response(null, 201);
    }
    if (method === "DELETE") {
      filtered.forEach((row) => records.splice(records.indexOf(row), 1));
      return response(null);
    }
    const one = headers.get("accept")?.includes("object");
    return response(one ? filtered[0] || null : filtered);
  };
  let handler;
  const context = vm.createContext({
    Response,
    Request,
    Headers,
    Date,
    JSON,
    Error,
    Number,
    String,
    Array,
    crypto,
    Deno: {
      env: {
        get: (key) =>
          ({
            SUPABASE_URL: "https://accounts.local.test",
            SUPABASE_SERVICE_ROLE_KEY: "private-server-test-key",
            SUPABASE_ANON_KEY: "public-test-key",
          })[key],
      },
      serve: (fn) => {
        handler = fn;
      },
    },
    createClient: (url, key, options) =>
      createClient(url, key, { ...options, global: { fetch } }),
  });
  const source = await readFile(
    new URL(
      "../../supabase/functions/panel-accounts/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  vm.runInContext(
    stripTypeScriptTypes(source.replace(/^import.*;\s*$/m, ""), {
      mode: "strip",
    }),
    context,
  );
  async function call(action, args = [], identity = "") {
    const result = await handler(
      new Request("https://accounts.local.test/functions/v1/panel-accounts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + (ids[identity] || identity),
        },
        body: JSON.stringify({ action, args }),
      }),
    );
    return { status: result.status, data: await result.json() };
  }
  return { call, profiles, access, attempts, events, writes, ids };
}

test("cuentas originales: nombre de acceso conserva privacidad y autentica con Supabase Auth", async () => {
  const { call } = await fixture();
  const directory = await call("directory");
  assert.equal(directory.status, 200);
  assert.deepEqual(
    directory.data.items.map((row) => row.nombre),
    ["Esteban", "Ana"],
  );
  assert.doesNotMatch(
    JSON.stringify(directory.data),
    /@|service_role|password"|refresh_token/,
  );
  const login = await call("login", ["Esteban", "Solo-prueba-123", "internal"]);
  assert.equal(login.data.ok, true);
  assert.deepEqual(login.data.session, {
    access_token: "test-token",
    refresh_token: "test-refresh",
  });
  assert.equal(
    (await call("login", ["Baja", "Solo-prueba-123", "internal"])).data.ok,
    false,
  );
  assert.equal(
    (await call("login", ["acme", "Solo-prueba-123", "internal"])).data.ok,
    false,
  );
  assert.equal(
    (await call("login", ["acme", "Solo-prueba-123", "client"])).data.customer,
    "ACME",
  );
});

test("cuentas: rol verificado en el servidor, claves correctas y auditoría sin contraseñas", async () => {
  const { call, writes, events, ids } = await fixture();
  for (const identity of ["", "csr", "client", "inactive"]) {
    const result = await call(
      "resetPassword",
      ["Ana", "Nueva-clave-123"],
      identity,
    );
    assert.equal(result.data.ok, false);
    assert.ok([401, 403].includes(result.status));
  }
  assert.equal(writes.length, 0);
  assert.equal((await call("verifyAdmin", ["Error"], "admin")).data.ok, false);
  assert.equal(
    (await call("verifyAdmin", ["Solo-prueba-123"], "admin")).data.ok,
    true,
  );
  assert.equal(
    (await call("resetPassword", ["Ana", "Nueva-clave-123"], "admin")).data.ok,
    true,
  );
  assert.equal(writes.filter((row) => row.path).length, 1);
  assert.equal(writes.filter((row) => row.table === "profiles").length, 1);
  assert.equal(events[0].actor, ids.admin);
  assert.doesNotMatch(
    JSON.stringify(events),
    /Nueva-clave|password"|refresh_token/,
  );
});

test("cliente: editar conserva contraseña vacía; desactivar y eliminar tienen efectos distintos", async () => {
  const { call, profiles, access, writes } = await fixture();
  assert.equal(
    (
      await call(
        "createClient",
        ["Cliente actualizado", "OTRO", "acme", ""],
        "admin",
      )
    ).data.updated,
    true,
  );
  assert.equal(access[0].customer, "OTRO");
  assert.equal(
    profiles.find((row) => row.alias === "client").display_name,
    "Cliente actualizado",
  );
  assert.equal(
    writes.filter((row) => row.path).length,
    0,
    "contraseña vacía no llama a Auth Admin",
  );
  assert.equal(
    (await call("setClientActive", ["acme", false], "admin")).data.ok,
    true,
  );
  assert.equal((await call("clients", [], "admin")).data.items.length, 1);
  assert.equal(
    (await call("login", ["acme", "Solo-prueba-123", "client"])).data.ok,
    false,
  );
  assert.equal((await call("disableClient", ["acme"], "admin")).data.ok, true);
  assert.equal((await call("clients", [], "admin")).data.items.length, 0);
});

test("bloqueo: quinto fallo bloquea y solo administración puede desbloquear", async () => {
  const { call, attempts } = await fixture();
  for (let attempt = 0; attempt < 5; attempt++)
    assert.equal(
      (await call("login", ["Ana", "Error", "internal"])).data.ok,
      false,
    );
  assert.equal(attempts[0].failures, 5);
  assert.match(
    (await call("login", ["Ana", "Solo-prueba-123", "internal"])).data.error,
    /bloqueada/,
  );
  assert.equal((await call("unlock", ["p:ana"], "csr")).status, 403);
  assert.equal((await call("unlock", ["p:ana"], "admin")).data.ok, true);
  assert.equal(
    (await call("login", ["Ana", "Solo-prueba-123", "internal"])).data.ok,
    true,
  );
});
