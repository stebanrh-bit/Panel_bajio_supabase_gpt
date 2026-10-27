import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import * as domain from "../../supabase/functions/panel-gmail/domain.js";
import { vault, digest } from "../../supabase/functions/panel-gmail/crypto.js";

/** Ejecuta el handler real de Edge con Auth, almacenamiento y Google en memoria. */
async function fixture() {
  const key = Buffer.alloc(32, 4).toString("base64"),
    store = await vault(key);
  const user = "usuario-simulado",
    email = "operador@example.com";
  const tables = {
    profiles: [{ id: user, active: true, role: "csr" }],
    gmail_connections: [
      {
        user_id: user,
        email,
        refresh_encrypted: await store.encrypt("REFRESH_SIMULADO"),
      },
    ],
    gmail_oauth_states: [],
    load_gmail_outbox: [],
  };
  const calls = [];
  let handler,
    authorized = true;
  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.operation = "select";
    }
    select() {
      return this;
    }
    eq(k, v) {
      this.filters.push((r) => r[k] === v);
      return this;
    }
    gt(k, v) {
      this.filters.push((r) => r[k] > v);
      return this;
    }
    in(k, v) {
      this.filters.push((r) => v.includes(r[k]));
      return this;
    }
    delete() {
      this.operation = "delete";
      return this;
    }
    insert(values) {
      this.operation = "insert";
      this.values = values;
      return this;
    }
    upsert(values) {
      this.operation = "upsert";
      this.values = values;
      return this;
    }
    update(values) {
      this.operation = "update";
      this.values = values;
      return this;
    }
    maybeSingle() {
      this.singleRow = true;
      return this;
    }
    single() {
      this.singleRow = true;
      return this;
    }
    then(resolve, reject) {
      try {
        let rows = tables[this.table].filter((r) =>
          this.filters.every((f) => f(r)),
        );
        if (this.operation === "delete")
          tables[this.table] = tables[this.table].filter(
            (r) => !rows.includes(r),
          );
        if (this.operation === "insert") {
          tables[this.table].push(this.values);
          rows = [this.values];
        }
        if (this.operation === "upsert") {
          const old = tables[this.table].find(
            (r) => r.user_id === this.values.user_id,
          );
          if (old) Object.assign(old, this.values);
          else tables[this.table].push(this.values);
          rows = [this.values];
        }
        if (this.operation === "update")
          rows.forEach((r) => Object.assign(r, this.values));
        return Promise.resolve({
          data: structuredClone(this.singleRow ? rows[0] || null : rows),
          error: null,
        }).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    }
  }
  const client = {
    from: (table) => new Query(table),
    auth: {
      getUser: async () => ({
        data: { user: authorized ? { id: user } : null },
        error: null,
      }),
    },
    rpc: async (name, args) => {
      if (name === "ops_gmail_context")
        return { data: { thread: { thread_id: "abc123" }, items: [] } };
      if (name === "ops_gmail_claim") {
        const item = tables.load_gmail_outbox.find((r) => r.id === args.p_id);
        const claimed = item.state === "prepared";
        if (claimed) item.state = "sending";
        return { data: { claimed, item: structuredClone(item) } };
      }
      throw Error("RPC no simulado: " + name);
    },
  };
  const google = {
    token: async () => ({
      access_token: "ACCESS_SIMULADO",
      refresh_token: "REFRESH_SIMULADO",
      scope:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
    }),
    gmail: async (_, path, body) => {
      calls.push({ path, body });
      if (path === "profile") return { emailAddress: email };
      if (path === "messages/send")
        return { id: "recibo-google", threadId: "abc123" };
      throw Error("Google no simulado: " + path);
    },
  };
  const source = await readFile(
    new URL("../../supabase/functions/panel-gmail/index.ts", import.meta.url),
    "utf8",
  );
  const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ""));
  new Function(
    "createClient",
    "prepareReply",
    "rawReply",
    "deliver",
    "googleApi",
    "digest",
    "vault",
    "Deno",
    code,
  )(
    () => client,
    domain.prepareReply,
    domain.rawReply,
    domain.deliver,
    () => google,
    digest,
    vault,
    {
      env: {
        get: (name) =>
          ({
            GMAIL_TOKEN_KEY: key,
            SUPABASE_URL: "https://simulado.invalid",
            GMAIL_CLIENT_ID: "id-simulado",
            GMAIL_CLIENT_SECRET: "secreto-simulado",
          })[name],
      },
      serve: (value) => {
        handler = value;
      },
    },
  );
  const post = (body) =>
    handler(
      new Request("https://simulado.invalid/functions/v1/panel-gmail", {
        method: "POST",
        headers: {
          Authorization: "Bearer JWT_SIMULADO",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  return {
    tables,
    calls,
    google,
    post,
    get: (url) => handler(new Request(url)),
    unauthorize: () => {
      authorized = false;
    },
    user,
  };
}
test("Edge Gmail: JWT obligatorio, CSR activo y confirmación expresa; recibo persistente y concurrencia", async () => {
  const f = await fixture();
  const preview = {
    from: "operador@example.com",
    to: ["cliente@example.com"],
    cc: [],
    subject: "Re: Simulado",
    body: "Hola",
    threadId: "abc123",
    inReplyTo: "<original@example.com>",
    references: "<original@example.com>",
  };
  f.tables.load_gmail_outbox.push({
    id: "id-simulado",
    user_id: f.user,
    load: "123",
    state: "prepared",
    preview,
  });
  const body = { action: "send", load: "123", id: "id-simulado" };
  assert.equal((await f.post(body)).status, 400);
  assert.equal(f.calls.filter((c) => c.path === "messages/send").length, 0);
  const responses = await Promise.all([
    f.post({ ...body, confirm: true }),
    f.post({ ...body, confirm: true }),
  ]);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(f.calls.filter((c) => c.path === "messages/send").length, 1);
  assert.equal(f.tables.load_gmail_outbox[0].state, "sent");
  assert.equal(f.tables.load_gmail_outbox[0].message_id, "recibo-google");
  f.tables.profiles[0].active = false;
  assert.equal((await f.post({ action: "status", load: "123" })).status, 403);
  f.unauthorize();
  assert.equal((await f.post({ action: "status", load: "123" })).status, 401);
});
test("Edge Gmail: OAuth con PKCE, callback de un solo uso y token cifrado; estado ajeno rechazado", async () => {
  const f = await fixture();
  const response = await f.post({ action: "connect" }),
    result = await response.json();
  const consent = new URL(result.url);
  assert.equal(consent.origin, "https://accounts.google.com");
  assert.equal(consent.searchParams.get("code_challenge_method"), "S256");
  assert.ok(consent.searchParams.get("prompt").includes("select_account"));
  const state = consent.searchParams.get("state");
  assert.notEqual(f.tables.gmail_oauth_states[0].state_hash, state);
  const callback =
    "https://simulado.invalid/functions/v1/panel-gmail/callback?state=" +
    state +
    "&code=CODIGO_SIMULADO";
  assert.equal((await f.get(callback)).status, 200);
  assert.notEqual(
    f.tables.gmail_connections[0].refresh_encrypted,
    "REFRESH_SIMULADO",
  );
  assert.equal(f.tables.gmail_oauth_states.length, 0);
  assert.equal((await f.get(callback)).status, 400);
  assert.equal(
    (await f.get(callback.replace(state, "estado-ajeno"))).status,
    400,
  );
  assert.equal(f.calls.filter((c) => c.path === "messages/send").length, 0);
});

test("Edge Gmail: timeout bloqueado y reconciliación en Enviados sin reenviar", async () => {
  const f = await fixture();
  const preview = {
    from: "operador@example.com",
    to: ["cliente@example.com"],
    cc: [],
    subject: "Re: Simulado",
    body: "Hola",
    threadId: "abc123",
    inReplyTo: "<original@example.com>",
    references: "<original@example.com>",
  };
  f.tables.load_gmail_outbox.push({
    id: "incierto",
    user_id: f.user,
    load: "123",
    state: "prepared",
    preview,
  });
  let sends = 0;
  f.google.gmail = async (_, path) => {
    if (path === "profile") return { emailAddress: preview.from };
    if (path === "messages/send") {
      sends++;
      throw Error("Timeout simulado después de aceptar");
    }
    if (path.startsWith("messages?"))
      return { messages: [{ id: "recuperado" }] };
    if (path.startsWith("messages/recuperado"))
      return { id: "recuperado", threadId: "abc123", labelIds: ["SENT"] };
    throw Error("Ruta no simulada");
  };
  const body = { load: "123", id: "incierto", confirm: true };
  assert.equal((await f.post({ ...body, action: "send" })).status, 400);
  assert.equal(f.tables.load_gmail_outbox[0].state, "uncertain");
  await f.post({ ...body, action: "send" });
  assert.equal(sends, 1);
  const response = await f.post({ ...body, action: "verify" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).item.message_id, "recuperado");
  assert.equal(f.tables.load_gmail_outbox[0].state, "sent");
  assert.equal(sends, 1);
});
