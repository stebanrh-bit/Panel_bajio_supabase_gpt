/** EXPLAIN reproducible con datos sintéticos; nunca conecta a Supabase. */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createTestDatabase } from "../web/test/helpers/database.js";
const root = new URL("../", import.meta.url),
  files = (await readdir(new URL("supabase/migrations/", root)))
    .filter((n) => /^\d.*sql$/.test(n))
    .sort();
const { db, people } = await createTestDatabase(
  files.filter((n) => Number(n.slice(0, 3)) <= 10),
  { Admin: "admin" },
);
try {
  await db.query(
    "insert into loads(load,customer) select 'SYN-'||n,'Cliente sintético' from generate_series(1,100) n",
  );
  await db.query(
    "insert into load_history(load,actor,before_data,after_data,changed_at) select 'SYN-'||l,$1,'{}','{}',now()-make_interval(secs=>n) from generate_series(1,100) l cross join generate_series(1,500) n",
    [people.Admin],
  );
  await db.query(
    "insert into original_routes(route_key,origin_key,destination_key,miles,hours,created_by) select 'origin-'||o||'>destination-'||d,'origin-'||o,'destination-'||d,100,2,$1 from generate_series(1,100) o cross join generate_series(1,100) d",
    [people.Admin],
  );
  await db.exec("analyze load_history;analyze original_routes;");
  const queries = {
    history:
      "select id,load,actor,changed_at,before_data,after_data from load_history where load='SYN-50' order by changed_at desc,id desc limit 50",
    routes:
      "select route_key,miles,hours from original_routes where origin_key='origin-50' order by route_key",
  };
  const explain = async () =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(queries).map(async ([name, sql]) => {
          const result = (
            await db.query("explain (analyze,buffers,format json) " + sql)
          ).rows[0]["QUERY PLAN"][0];
          return [name, { sql, ...result }];
        }),
      ),
    );
  const before = await explain();
  await db.exec(
    await readFile(
      new URL("supabase/migrations/011_queries_and_revisions.sql", root),
      "utf8",
    ),
  );
  await db.exec("analyze load_history;analyze original_routes;");
  const after = await explain();
  const report = {
    environment: "PGlite / PostgreSQL local. No es una medición de producción.",
    sample: { loads: 100, history: 50100, routes: 10000 },
    before,
    after,
  };
  await writeFile(
    new URL("docs/evidencia-consultas-49.json", root),
    JSON.stringify(report, null, 2) + "\n",
  );
  process.stdout.write(
    JSON.stringify(
      Object.fromEntries(
        Object.keys(queries).map((k) => [
          k,
          {
            before: before[k].Plan["Node Type"],
            after: after[k].Plan["Node Type"],
            beforeCost: before[k].Plan["Total Cost"],
            afterCost: after[k].Plan["Total Cost"],
          },
        ]),
      ),
    ),
  );
} finally {
  await db.close();
}
