import { fetchAll, unwrap } from "../../data/supabase.js";

/** Las notas de turno se guardan junto con historial y comentarios en una transacción. */
export function createShiftsService(client) {
  const rpc = (name, values) => unwrap(client.rpc(name, values), "SQL 005");
  return {
    list: () =>
      fetchAll(
        () =>
          client
            .from("shift_tasks")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id"),
        "SQL 005",
      ),
    get: (id) =>
      unwrap(
        client.from("shift_tasks").select("*").eq("id", id).single(),
        "SQL 005",
      ),
    history: (id) =>
      fetchAll(
        () =>
          client
            .from("shift_task_history")
            .select("*")
            .eq("task_id", id)
            .order("changed_at", { ascending: false })
            .order("id"),
        "SQL 005",
      ),
    closures: () =>
      fetchAll(
        () =>
          client
            .from("shift_closures")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id"),
        "SQL 005",
      ),
    save: (values, previous = null) =>
      rpc("ops_save_tasks", {
        p_values: values,
        p_id: previous?.id || null,
        p_version: previous?.updated_at || null,
      }),
    setState: (record, state) =>
      rpc("ops_set_task_state", {
        p_id: record.id,
        p_version: record.updated_at,
        p_state: state,
      }),
    saveClosure: (body) => rpc("ops_save_closure", { p_body: body }),
  };
}
