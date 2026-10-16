#!/usr/bin/env node
/** Ensayo sin red: restaura datos en PostgreSQL embebido efímero y comprueba las relaciones. */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createTestDatabase } from "../web/test/helpers/database.js";
const root = new URL("../", import.meta.url),
  quote = (name) => '"' + name.replaceAll('"', '""') + '"';
export async function rehearseBackup(backup) {
  if (backup.format !== "panel-bajio-backup-v2" || !backup.tables)
    throw Error("Se requiere un respaldo completo v2.");
  const files = (await readdir(new URL("supabase/migrations/", root)))
    .filter((n) => /^\d.*sql$/.test(n))
    .sort();
  const { db } = await createTestDatabase(files, {});
  try {
    const allowed = (await db.query("select ops_backup_tables() as names"))
      .rows[0].names;
    if (
      allowed.some((t) => !Array.isArray(backup.tables[t])) ||
      Object.keys(backup.tables).some((t) => !allowed.includes(t))
    )
      throw Error("El respaldo tiene tablas faltantes o no permitidas.");
    for (const table of allowed)
      if (backup.counts?.[table] !== backup.tables[table].length)
        throw Error("Conteo distinto en " + table);
    await db.exec("begin");
    for (const table of allowed)
      await db.exec(
        "alter table public." + quote(table) + " disable trigger user",
      );
    // Las identidades se simulan únicamente en el ensayo; no se inventan contraseñas ni sesiones.
    for (const profile of backup.tables.profiles)
      await db.query("insert into auth.users values($1,'{}')", [profile.id]);
    const counts = {};
    for (const table of allowed) {
      const columns = (
        await db.query(
          "select column_name from information_schema.columns where table_schema='public' and table_name=$1 and is_generated='NEVER' order by ordinal_position",
          [table],
        )
      ).rows.map((r) => r.column_name);
      const pk = (
        await db.query(
          "select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=('public.'||$1)::regclass and i.indisprimary order by a.attnum",
          [table],
        )
      ).rows.map((r) => r.attname);
      for (const record of backup.tables[table]) {
        if (
          Object.keys(record).some(
            (key) => !columns.includes(key) && !["customer_key"].includes(key),
          )
        )
          throw Error("Columna no válida en " + table);
        const keys = columns.filter((key) => Object.hasOwn(record, key)),
          mutable = keys.filter((k) => !pk.includes(k));
        const sql =
          "insert into public." +
          quote(table) +
          "(" +
          keys.map(quote).join(",") +
          ") values(" +
          keys.map((_, i) => "$" + (i + 1)).join(",") +
          ") on conflict(" +
          pk.map(quote).join(",") +
          ") " +
          (mutable.length
            ? "do update set " +
              mutable.map((k) => quote(k) + "=excluded." + quote(k)).join(",")
            : "do nothing");
        await db.query(
          sql,
          keys.map((k) => record[k]),
        );
      }
      counts[table] = (
        await db.query("select count(*)::int as n from public." + quote(table))
      ).rows[0].n;
      if (counts[table] !== backup.tables[table].length)
        throw Error("La restauración tiene un conteo distinto: " + table);
    }
    for (const table of allowed)
      await db.exec(
        "alter table public." + quote(table) + " enable trigger user",
      );
    await db.exec("commit");
    return {
      ok: true,
      environment: "PostgreSQL local efímero",
      tables: counts,
      auth: "Identidades simuladas; no restaura credenciales de Supabase Auth.",
    };
  } finally {
    await db.close();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2])
    throw Error("Uso: node scripts/rehearse_backup.mjs respaldo.json");
  const result = await rehearseBackup(
    JSON.parse(await readFile(process.argv[2], "utf8")),
  );
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
