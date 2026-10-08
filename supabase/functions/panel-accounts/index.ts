/**
 * Cuentas de Panel Bajío. Supabase Auth guarda y verifica las contraseñas.
 * La interfaz conserva los nombres de acceso del original; nunca recibe correos ajenos
 * ni la clave service_role. Desplegar con verify_jwt=false porque el login es público.
 * Cada acción privada verifica explícitamente el JWT y el rol actual.
 */
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};
const service = createClient(url, serviceKey, { auth: authOptions });
const roleLabels: Record<string, string> = {
  admin: "Supervisor",
  csr: "CSR",
  manager: "Seguimiento",
};

/** No enviar errores internos de Auth ni imprimir solicitudes que contienen contraseñas. */
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers });
}
function check<T extends { data: unknown; error: unknown }>(
  response: T,
): T["data"] {
  if (response.error) throw Error("No se pudo guardar el cambio en Supabase.");
  return response.data;
}
function text(value: unknown, limit: number, required = true) {
  const result = String(value ?? "").trim();
  if ((required && !result) || result.length > limit)
    throw Error("Revisa los datos del formulario.");
  return result;
}
function password(value: unknown) {
  const result = String(value ?? "");
  if (result.length < 8 || result.length > 128)
    throw Error("La contraseña debe tener de 8 a 128 caracteres.");
  return result;
}
async function profiles() {
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const page =
      check(
        await service
          .from("profiles")
          .select("*")
          .order("id")
          .range(offset, offset + 499),
      ) || [];
    result.push(...page);
    if (page.length < 500) return result;
  }
}
async function findAccount(identifier: string, clientMode = false) {
  const normalized = identifier.trim().toLowerCase();
  const matches = (await profiles()).filter(
    (row) =>
      (clientMode ? row.role === "client" : row.role !== "client") &&
      [row.login_name, row.display_name].some(
        (value) =>
          String(value || "")
            .trim()
            .toLowerCase() === normalized,
      ),
  );
  if (matches.length !== 1) throw Error("Usuario o contraseña incorrectos.");
  return matches[0];
}
async function accountEmail(id: string) {
  const result = await service.auth.admin.getUserById(id);
  if (result.error || !result.data.user?.email)
    throw Error("Usuario o contraseña incorrectos.");
  return result.data.user.email;
}
async function audit(
  actor: string,
  action: string,
  details: Record<string, unknown>,
) {
  // Lista de detalles explícita: jamás incluir passwords, sesiones o datos completos de Auth.
  check(await service.from("admin_events").insert({ actor, action, details }));
}
async function signIn(email: string, secret: string) {
  const temporary = createClient(url, publicKey, { auth: authOptions });
  const result = await temporary.auth.signInWithPassword({
    email,
    password: secret,
  });
  if (result.error || !result.data.session)
    throw Error("Usuario o contraseña incorrectos.");
  return result.data.session;
}
async function createAccount(
  actor: string,
  values: {
    name: string;
    role: string;
    username?: string;
    email?: string;
    password?: string;
    customer?: string;
  },
) {
  const current = await profiles();
  if (
    current.some(
      (row) =>
        row.display_name.trim().toLowerCase() === values.name.toLowerCase() ||
        (values.username &&
          row.login_name?.toLowerCase() === values.username.toLowerCase()),
    )
  )
    throw Error("Ese nombre de acceso ya existe.");
  // Sin correo, Auth admite una dirección interna. La recuperación la hace administración.
  const email =
    values.email || `panel-${crypto.randomUUID()}@panel-bajio.invalid`;
  const secret = values.password || crypto.randomUUID() + crypto.randomUUID();
  const created = await service.auth.admin.createUser({
    email,
    password: secret,
    email_confirm: true,
    user_metadata: { display_name: values.name },
  });
  if (created.error || !created.data.user)
    throw Error(
      "No se pudo crear la cuenta. Revisa si el correo ya está registrado.",
    );
  const id = created.data.user.id;
  try {
    check(
      await service
        .from("profiles")
        .update({
          role: values.role,
          active: true,
          contact_email: values.email || "",
          password_ready: Boolean(values.password),
          login_name: values.username || values.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id),
    );
    if (values.role === "client")
      check(
        await service
          .from("portal_access")
          .insert({ user_id: id, customer: values.customer, active: true }),
      );
    await audit(actor, "account_created", {
      user: id,
      role: values.role,
      name: values.name,
    });
    return id;
  } catch (error) {
    // Desactivar una alta incompleta conserva referencias de auditoría y no habilita acceso.
    await service
      .from("profiles")
      .update({ active: false, role: "pending" })
      .eq("id", id);
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST")
    return respond({ ok: false, error: "Método no permitido." }, 405);
  try {
    if (Number(request.headers.get("content-length")) > 20000)
      throw Error("Solicitud demasiado grande.");
    const body = await request.text();
    if (body.length > 20000) throw Error("Solicitud demasiado grande.");
    const { action, args = [] } = JSON.parse(body);
    if (!Array.isArray(args) || args.length > 8)
      throw Error("Solicitud no válida.");
    if (action === "directory") {
      const items = (await profiles())
        .filter(
          (row) =>
            row.active &&
            ["admin", "csr", "manager"].includes(row.role) &&
            row.login_name !== "vista-gerencia",
        )
        .map((row) => ({
          nombre: row.display_name,
          rol: roleLabels[row.role],
          correo: "",
          passwordSet: row.password_ready !== false,
          sigueA: [],
        }));
      return respond({ ok: true, items });
    }
    if (action === "login") {
      const identifier = text(args[0], 200),
        secret = String(args[1] || "");
      const mode = args[2];
      if (
        !secret ||
        secret.length > 128 ||
        !["internal", "client", "manager"].includes(mode)
      )
        throw Error("Usuario o contraseña incorrectos.");
      const key =
        mode === "manager"
          ? "vista"
          : `${mode === "client" ? "c:" : "p:"}${identifier.toLowerCase()}`;
      const blocked = check(
        await service
          .from("original_login_attempts")
          .select("blocked_until")
          .eq("account_key", key)
          .maybeSingle(),
      );
      if (
        blocked?.blocked_until &&
        Date.parse(blocked.blocked_until) > Date.now()
      )
        throw Error(
          "Cuenta bloqueada por intentos fallidos. Espera 15 minutos o pide a administración que la desbloquee.",
        );
      let session, profile, access;
      try {
        profile = await findAccount(identifier, mode === "client");
        if (
          !profile.active ||
          profile.role === "pending" ||
          (mode === "manager" && profile.role !== "manager")
        )
          throw Error("Sin acceso");
        if (mode === "client") {
          access = check(
            await service
              .from("portal_access")
              .select("*")
              .eq("user_id", profile.id)
              .maybeSingle(),
          );
          if (!access?.active) throw Error("Sin acceso");
        }
        session = await signIn(await accountEmail(profile.id), secret);
      } catch {
        check(await service.rpc("ops_record_login_failure", { p_key: key }));
        return respond(
          { ok: false, error: "Usuario o contraseña incorrectos." },
          401,
        );
      }
      check(
        await service
          .from("original_login_attempts")
          .delete()
          .eq("account_key", key),
      );
      return respond({
        ok: true,
        nombre: profile.display_name,
        customer: access?.customer || "",
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        },
      });
    }

    // Acciones privadas: verificar Auth y perfil vigente en cada petición.
    const token =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const userResult = await service.auth.getUser(token);
    const user = userResult.data.user;
    if (userResult.error || !user)
      return respond(
        { ok: false, error: "Inicia sesión para continuar." },
        401,
      );
    const actor = check(
      await service.from("profiles").select("*").eq("id", user.id).single(),
    );
    if (!actor.active || !["admin", "csr", "manager"].includes(actor.role))
      return respond({ ok: false, error: "Cuenta sin acceso." }, 403);
    if (action === "changeOwnPassword") {
      await signIn(await accountEmail(user.id), String(args[0] || ""));
      const result = await service.auth.admin.updateUserById(user.id, {
        password: password(args[1]),
      });
      if (result.error) throw Error("Supabase rechazó la nueva contraseña.");
      await audit(user.id, "own_password_changed", { user: user.id });
      return respond({ ok: true, token: "supabase-session" });
    }
    if (actor.role !== "admin")
      return respond(
        { ok: false, error: "Solo administración puede realizar esta acción." },
        403,
      );
    if (action === "verifyAdmin") {
      await signIn(await accountEmail(user.id), String(args[0] || ""));
      return respond({ ok: true });
    }
    if (action === "createStaff") {
      const name = text(args[0], 200),
        role = args[1],
        email = text(args[2], 254, false);
      if (!["admin", "csr", "manager"].includes(role))
        throw Error("Rol no válido.");
      await createAccount(user.id, { name, role, email });
    } else if (action === "resetPassword") {
      const target = await findAccount(text(args[0], 200));
      check(
        await service.auth.admin.updateUserById(target.id, {
          password: password(args[1]),
        }),
      );
      check(
        await service
          .from("profiles")
          .update({
            password_ready: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", target.id),
      );
      await audit(user.id, "password_reset", { user: target.id });
    } else if (action === "createClient") {
      const name = text(args[0], 200),
        customer = text(args[1], 500),
        username = text(args[2], 200);
      const account = (await profiles()).find(
        (row) =>
          row.role === "client" &&
          row.login_name?.toLowerCase() === username.toLowerCase(),
      );
      if (account) {
        // Editar la cuenta conserva su contraseña cuando el formulario la deja vacía.
        if (args[3])
          check(
            await service.auth.admin.updateUserById(account.id, {
              password: password(args[3]),
            }),
          );
        check(
          await service
            .from("profiles")
            .update({
              display_name: name,
              updated_at: new Date().toISOString(),
            })
            .eq("id", account.id),
        );
        check(
          await service
            .from("portal_access")
            .update({ customer, updated_at: new Date().toISOString() })
            .eq("user_id", account.id),
        );
        await audit(user.id, "client_account_edited", {
          user: account.id,
          customer,
        });
        return respond({ ok: true, updated: true });
      }
      await createAccount(user.id, {
        name,
        role: "client",
        customer,
        username,
        password: password(args[3]),
      });
    } else if (["disableClient", "setClientActive"].includes(action)) {
      const target = await findAccount(text(args[0], 200), true);
      const active = action === "setClientActive" && args[1] === true;
      check(
        await service
          .from("portal_access")
          .update({ active, updated_at: new Date().toISOString() })
          .eq("user_id", target.id),
      );
      check(
        await service
          .from("profiles")
          .update({
            active,
            original_removed: action === "disableClient",
            updated_at: new Date().toISOString(),
          })
          .eq("id", target.id),
      );
      await audit(user.id, "client_access_changed", {
        user: target.id,
        active,
      });
    } else if (action === "clients") {
      const access =
        check(await service.from("portal_access").select("*")) || [];
      const accounts = await profiles();
      const attempts =
        check(
          await service
            .from("original_login_attempts")
            .select("*")
            .gt("blocked_until", new Date().toISOString()),
        ) || [];
      return respond({
        ok: true,
        items: access
          .filter(
            (item) =>
              !accounts.find((row) => row.id === item.user_id)
                ?.original_removed,
          )
          .map((item) => {
            const account = accounts.find((row) => row.id === item.user_id);
            return {
              nombre: account?.display_name || "",
              cliente: item.customer,
              usuario: account?.login_name || "",
              activo: item.active && account?.active,
              bloqueado: attempts.some(
                (row) =>
                  row.account_key === "c:" + account?.login_name?.toLowerCase(),
              ),
            };
          }),
      });
    } else if (action === "setManagerPassword") {
      const secret = password(args[0]);
      const account = (await profiles()).find(
        (row) => row.login_name === "vista-gerencia",
      );
      if (account) {
        if (account.role !== "manager")
          throw Error("El usuario de gerencia tiene un rol incorrecto.");
        check(
          await service.auth.admin.updateUserById(account.id, {
            password: secret,
          }),
        );
        await audit(user.id, "manager_password_changed", { user: account.id });
      } else
        await createAccount(user.id, {
          name: "Vista Gerencia",
          role: "manager",
          username: "vista-gerencia",
          password: secret,
        });
    } else if (action === "lockouts") {
      const blocked =
        check(
          await service
            .from("original_login_attempts")
            .select("*")
            .gt("blocked_until", new Date().toISOString()),
        ) || [];
      return respond({
        ok: true,
        items: blocked.map((row) => ({
          clave: row.account_key,
          etiqueta:
            row.account_key === "vista"
              ? "Vista Gerencia"
              : row.account_key.slice(2),
        })),
      });
    } else if (action === "unlock") {
      const key = text(args[0], 250);
      if (!/^(?:p:|c:).+|^vista$/.test(key)) throw Error("Cuenta no válida.");
      check(
        await service
          .from("original_login_attempts")
          .delete()
          .eq("account_key", key),
      );
      await audit(user.id, "account_unlocked", { account: key });
    } else return respond({ ok: false, error: "Acción desconocida." }, 400);
    return respond({ ok: true });
  } catch (error) {
    return respond(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar la acción.",
      },
      400,
    );
  }
});
