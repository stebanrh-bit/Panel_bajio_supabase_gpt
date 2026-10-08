import { fetchAll, unwrap } from "../../data/supabase.js";

/** Equipo y preferencias: la autorización real se aplica en los RPC de SQL 005. */
export function createTeamService(client) {
  const rpc = (name, values) => unwrap(client.rpc(name, values), "SQL 005");
  const sortKeys = {
    customer_assignments: ["customer_key"],
    user_following: ["user_id", "followed_user"],
    portal_access: ["user_id"],
  };
  const table = (name) =>
    fetchAll(() => {
      let query = client.from(name).select("*");
      for (const key of sortKeys[name] || ["id"]) query = query.order(key);
      return query;
    }, "SQL 005");
  return {
    people: () => table("profiles"),
    assignments: () => table("customer_assignments"),
    portalAccess: () => table("portal_access"),
    following: () => table("user_following"),
    templates: () => table("message_templates"),
    events: () =>
      fetchAll(
        () =>
          client
            .from("admin_events")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id"),
        "SQL 005",
      ),
    saveProfile: (previous, values) =>
      rpc("ops_save_profile", {
        p_id: previous.id,
        p_version: previous.updated_at,
        p_name: values.display_name,
        p_role: values.role,
        p_active: values.active,
        p_email: values.contact_email,
      }),
    assign: (customer, owner, previous = null) =>
      rpc("ops_assign_customer", {
        p_customer: customer,
        p_owner: owner || null,
        p_version: previous?.updated_at || null,
      }),
    setPortal: (user, customer, active) =>
      rpc("ops_set_portal_access", {
        p_user: user,
        p_customer: customer,
        p_active: active,
      }),
    setFollowing: (users) => rpc("ops_set_following", { p_users: users }),
    saveTemplate: (title, body, previous = null) =>
      rpc("ops_save_template", {
        p_title: title,
        p_body: body,
        p_id: previous?.id || null,
        p_version: previous?.updated_at || null,
      }),
    deleteTemplate: (record) =>
      rpc("ops_delete_template", {
        p_id: record.id,
        p_version: record.updated_at,
      }),
  };
}
