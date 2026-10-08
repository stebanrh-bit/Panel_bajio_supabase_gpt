/** Consultas del módulo; la sesión y los permisos pertenecen al cliente Supabase existente. */
export function createReservedLoadsService(supabase) {
  async function unwrap(query) {
    const { data, error } = await query;
    if (error) {
      if (['PGRST205', 'PGRST202', '42P01'].includes(error.code)) {
        throw new Error('Falta instalar Apartados en Supabase. Aplica la actualización SQL 004.');
      }
      throw new Error(error.message);
    }
    return data;
  }

  /** La paginación conserva todos los registros que permiten consultar las reglas RLS. */
  async function fetchAll(buildQuery) {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const page = await unwrap(buildQuery().range(offset, offset + 499));
      result.push(...page);
      if (page.length < 500) return result;
    }
  }

  function list() {
    return fetchAll(() => supabase.from('reserved_loads').select('*').order('updated_at', { ascending: false }).order('id'));
  }
  function get(id) {
    return unwrap(supabase.from('reserved_loads').select('*').eq('id', id).single());
  }
  function history(id) {
    return fetchAll(() => supabase.from('reserved_load_history').select('*').eq('reserved_id', id)
      .order('changed_at', { ascending: false }).order('id'));
  }
  function save(values, previous = null) {
    return unwrap(supabase.rpc('save_reserved_load', {
      p_values: values, p_id: previous?.id || null, p_version: previous?.updated_at || null,
    }));
  }
  function changeState(record, state, note) {
    return unwrap(supabase.rpc('change_reserved_load_state', {
      p_id: record.id, p_version: record.updated_at, p_state: state, p_note: note,
    }));
  }
  function review(record, note) {
    return unwrap(supabase.rpc('review_reserved_load', {
      p_id: record.id, p_version: record.updated_at, p_note: note,
    }));
  }
  return { list, get, history, save, changeState, review };
}
