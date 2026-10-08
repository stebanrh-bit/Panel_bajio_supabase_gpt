/**
 * Acceso a datos de solicitudes pendientes.
 * Esta capa conoce Supabase, pero no manipula HTML ni decide los permisos del usuario.
 */
export function createPendingLoadsService(supabase) {
  async function unwrap(query) {
    const { data, error } = await query;
    if (error) {
      if (['PGRST205', 'PGRST202', '42P01'].includes(error.code)) {
        throw new Error('Falta instalar el módulo de pendientes en Supabase. Aplica la actualización SQL 003.');
      }
      throw new Error(error.message);
    }
    return data;
  }

  /** Lee por páginas para no perder filas por el límite de respuesta del servidor. */
  async function fetchAll(buildQuery) {
    const pageSize = 500;
    const records = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await unwrap(buildQuery().range(offset, offset + pageSize - 1));
      records.push(...page);
      if (page.length < pageSize) return records;
    }
  }

  async function list(state) {
    return fetchAll(() => supabase.from('pending_loads')
      .select('*')
      .eq('state', state)
      .order('created_at', { ascending: false })
      .order('id'));
  }

  async function get(id) {
    return unwrap(supabase.from('pending_loads').select('*').eq('id', id).single());
  }

  async function create(values) {
    return unwrap(supabase.from('pending_loads').insert(values).select('*').single());
  }

  async function update(record, values) {
    const updated = await unwrap(supabase.from('pending_loads')
      .update(values).eq('id', record.id).eq('updated_at', record.updated_at).select('*'));
    if (updated.length !== 1) {
      throw new Error('La solicitud cambió o ya no puedes editarla. Actualiza antes de guardar.');
    }
    return updated[0];
  }

  async function cancel(record) {
    return unwrap(supabase.rpc('cancel_pending_load', {
      p_id: record.id,
      p_version: record.updated_at,
    }));
  }

  async function link(record, loadNumber) {
    return unwrap(supabase.rpc('link_pending_load', {
      p_id: record.id,
      p_load: loadNumber,
      p_version: record.updated_at,
    }));
  }

  async function comments(id) {
    return fetchAll(() => supabase.from('pending_load_comments').select('*')
      .eq('pending_id', id).order('created_at').order('id'));
  }

  async function addComment(id, body) {
    // El autor se obtiene de auth.uid() en la base: no se acepta un nombre desde el formulario.
    return unwrap(supabase.from('pending_load_comments').insert({ pending_id: id, body }));
  }

  return { list, get, create, update, cancel, link, comments, addComment };
}
