/** Traduce las respuestas de Supabase sin convertir errores en éxitos ficticios. */
export async function unwrap(query, migration = "la actualización del sitio") {
  const { data, error } = await query;
  if (error) {
    if (["PGRST205", "PGRST202", "42P01", "42703"].includes(error.code)) {
      throw new Error(
        `Este módulo requiere instalar ${migration} en Supabase.`,
      );
    }
    throw new Error(error.message);
  }
  return data;
}

/** Lee todas las páginas con orden estable; evita omitir filas por el límite de respuesta. */
export async function fetchAll(buildQuery, migration) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await unwrap(
      buildQuery().range(offset, offset + 499),
      migration,
    );
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
