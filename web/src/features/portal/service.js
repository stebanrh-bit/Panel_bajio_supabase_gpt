import { unwrap } from "../../data/supabase.js";

/** El portal recibe únicamente los campos públicos de las cargas autorizadas para la cuenta. */
export function createPortalService(client) {
  async function list() {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const page = await unwrap(
        client.rpc("ops_portal_loads", { p_offset: offset, p_limit: 500 }),
        "SQL 005",
      );
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  const get = (load) =>
    unwrap(client.rpc("ops_portal_detail", { p_load: load }), "SQL 005");
  return { list, get };
}
