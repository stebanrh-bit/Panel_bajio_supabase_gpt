import { fetchAll, unwrap } from "../../data/supabase.js";

/** Contexto por sesión. Nunca usa el nombre enviado por el formulario como autorización. */
export function createContext(client) {
  const caches = new Map();
  const queues = new Map();
  let profile = null;
  let epoch = 0;
  async function safe(promise) {
    const stamp = epoch;
    const result = await promise;
    if (stamp !== epoch) throw Error("La sesión cambió.");
    return result;
  }
  const rpc = (name, args = {}) =>
    safe(unwrap(client.rpc(name, args), "SQL 009"));
  const rows = (table, filter = (query) => query, order = "id") =>
    safe(
      fetchAll(() => {
        let query = filter(client.from(table).select("*")).order(order);
        const keys = {
          loads: ["load"],
          load_followers: ["load", "user_id"],
          user_following: ["user_id", "followed_user"],
          customer_assignments: ["customer_key"],
          portal_access: ["user_id"],
          original_preferences: ["user_id"],
          original_places: ["place_key"],
          original_routes: ["route_key"],
          original_radar: ["singleton"],
        }[table] || ["id"];
        for (const key of keys) if (key !== order) query = query.order(key);
        return query;
      }, "SQL 009"),
    );
  function remember(table, records, key = "id") {
    const map = new Map(
      records.map((row) => [String(row[key]), structuredClone(row)]),
    );
    caches.set(table, map);
    return records;
  }
  function previous(table, id) {
    const row = caches.get(table)?.get(String(id));
    if (!row)
      throw Error("Actualiza la página antes de modificar este registro.");
    return structuredClone(row);
  }
  function saved(table, row, key = "id") {
    if (!caches.has(table)) caches.set(table, new Map());
    caches.get(table).set(String(row[key]), structuredClone(row));
    return row;
  }
  /** Serializa las escrituras de una carga, sin renovar la versión antes de guardar. */
  function serial(key, operation) {
    const stamp = epoch;
    const promise = (queues.get(key) || Promise.resolve())
      .catch(() => {})
      .then(() => {
        if (stamp !== epoch) throw Error("La sesión cambió.");
        return operation();
      });
    queues.set(key, promise);
    promise
      .finally(() => {
        if (queues.get(key) === promise) queues.delete(key);
      })
      .catch(() => {});
    return promise;
  }
  async function restore() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) return null;
    profile = await unwrap(
      client
        .from("profiles")
        .select("*")
        .eq("id", data.session.user.id)
        .single(),
    );
    if (!profile.active || profile.role === "pending") {
      await logout();
      throw Error("Tu cuenta necesita acceso autorizado al panel.");
    }
    return profile;
  }
  function staff(write = false) {
    const roles = write ? ["admin", "csr"] : ["admin", "csr", "manager"];
    if (!profile?.active || !roles.includes(profile.role))
      throw Error("Inicia sesión con una cuenta del equipo.");
  }
  async function account(action, args = []) {
    // La función del servidor verifica JWT y rol; la clave privilegiada nunca llega al navegador.
    const { data, error } = await client.functions.invoke("panel-accounts", {
      body: { action, args },
    });
    if (error) {
      let message =
        "No se pudo acceder a las cuentas. Revisa la instalación de panel-accounts.";
      try {
        message = (await error.context.json()).error || message;
      } catch {}
      throw Error(message);
    }
    if (!data?.ok)
      throw Error(
        data?.error || "No se pudo completar la operación de cuentas.",
      );
    return data;
  }
  async function login(name, password, mode = "internal") {
    if (password === "supabase-session") {
      const active = await restore();
      if (!active || active.display_name !== name)
        throw Error("La sesión venció. Vuelve a entrar.");
      return { ok: true, token: "supabase-session" };
    }
    const result = await account("login", [name, password, mode]);
    epoch += 1;
    caches.clear();
    const { error } = await client.auth.setSession(result.session);
    if (error) throw error;
    await restore();
    return {
      ok: true,
      token: mode === "manager" ? "vg_supabase-session" : "supabase-session",
      nombre: profile.display_name,
      cliente: result.customer || "",
    };
  }
  async function logout() {
    epoch += 1;
    profile = null;
    caches.clear();
    queues.clear();
    await client.auth.signOut();
  }
  const personName = (id) =>
    caches.get("profiles")?.get(String(id))?.display_name ||
    (id === profile?.id ? profile.display_name : id || "");
  function personId(name) {
    if (!name) return null;
    const matches = [...(caches.get("profiles")?.values() || [])].filter(
      (row) =>
        row.active &&
        row.display_name.trim().toLowerCase() ===
          String(name).trim().toLowerCase(),
    );
    if (matches.length !== 1)
      throw Error(
        "La persona no existe o su nombre está repetido. Actualiza el equipo.",
      );
    return matches[0].id;
  }
  return {
    client,
    rpc,
    rows,
    safe,
    remember,
    previous,
    saved,
    serial,
    restore,
    staff,
    account,
    login,
    logout,
    personName,
    personId,
    get profile() {
      return profile;
    },
    get epoch() {
      return epoch;
    },
  };
}
