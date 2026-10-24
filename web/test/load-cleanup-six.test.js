import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";

// Lista independiente del SQL, transcrita de la petición del usuario.
const keep = ["846071", "846072", "846069", "845562", "845112", "846079"];
const removed = ["999999", "8460710", "0846071"];
const sql = await readFile(
  new URL(
    "../../supabase/maintenance/03_eliminar_excepto_6_2026-10-19.sql",
    import.meta.url,
  ),
  "utf8",
);
const migrations = (
  await readdir(new URL("../../supabase/migrations/", import.meta.url))
)
  .filter((name) => /^\d{3}_.*\.sql$/.test(name))
  .sort();

async function snapshot(db) {
  const { rows } = await db.query(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  );
  const result = {};
  for (const { tablename } of rows) {
    result[tablename] = (
      await db.query(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as data from public."${tablename}" t`,
      )
    ).rows[0].data;
  }
  return result;
}

test("limpieza de seis cargas: SQL autónomo, relaciones actuales y conservación íntegra", async (context) => {
  const { db, people } = await createTestDatabase(migrations, {
    admin: "admin",
    csr: "csr",
  });
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      people.admin,
    ]);
    const tasks = {},
      schedules = {};
    for (const load of [...keep, ...removed]) {
      await db.query(
        "insert into loads(load,customer,trailer,status,archived) values($1,'Cliente','T0132','DELIVERED',$2)",
        [load, load === keep[1]],
      );
      await db.query(
        "insert into comments(load,body) values($1,'Conservar íntegro: áéíóú')",
        [load],
      );
      await db.query(
        "insert into incidents(load,category,severity,description) values($1,'Demora','alta','Incidencia')",
        [load],
      );
      await db.query(
        "insert into communications(load,event_type,reason,actor) values($1,'NOTIFICADO','Aviso',$2)",
        [load, people.admin],
      );
      await db.query("insert into load_followers(load,user_id) values($1,$2)", [
        load,
        people.csr,
      ]);
      schedules[load] = (
        await db.query(
          "insert into task_schedules(load,note,assigned_to,cadence,local_time,next_run_at,created_by) values($1,'Recurrencia',$2,'daily','09:00',now(),$2) returning id",
          [load, people.admin],
        )
      ).rows[0].id;
      tasks[load] = (
        await db.query(
          "insert into shift_tasks(load,note,assigned_to,shift,created_by,schedule_id) values($1,'Tarea',$2,'Turno',$2,$3) returning id",
          [load, people.admin, schedules[load]],
        )
      ).rows[0].id;
      await db.query(
        "insert into task_checklist_items(task_id,label,position) values($1,'Paso 1',1)",
        [tasks[load]],
      );
      await db.query(
        "insert into shift_task_history(task_id,event,actor,after_data) values($1,'created',$2,'{}')",
        [tasks[load], people.admin],
      );
      await db.query(
        "insert into operational_alerts(recipient,task_id,load,kind,message,dedupe_key) values($1,$2,$3,'task_due','Pendiente',$3)",
        [people.admin, tasks[load], load],
      );
      const pending = (
        await db.query(
          "insert into pending_loads(customer,created_by) values('Cliente',$1) returning id",
          [people.admin],
        )
      ).rows[0].id;
      await db.query(
        "insert into pending_load_comments(pending_id,body) values($1,'Comentario')",
        [pending],
      );
      await db.query(
        "update pending_loads set state='linked',linked_load=$1,linked_at=now(),linked_by=$2 where id=$3",
        [load, people.admin, pending],
      );
      const reserved = (
        await db.query(
          "insert into reserved_loads(load,related_load,next_review_at,created_by,updated_by) values('VG-'||$1,$1,now(),$2,$2) returning id",
          [load, people.admin],
        )
      ).rows[0].id;
      await db.query(
        "insert into reserved_load_history(reserved_id,event,actor,after_data) values($1,'created',$2,'{}')",
        [reserved, people.admin],
      );
      const batch = (
        await db.query(
          "insert into import_batches(file_name,created_by) values($1,$2) returning id",
          [load, people.admin],
        )
      ).rows[0].id;
      await db.query(
        "insert into import_rows(batch_id,load,before_data,after_data) values($1,$2,'{}','{}')",
        [batch, load],
      );
      await db.query(
        "insert into admin_events(action,details) values('import_applied',jsonb_build_object('load',$1::text,'batch',$2::text))",
        [load, batch],
      );
    }
    const general = (
      await db.query(
        "insert into shift_tasks(note,assigned_to,shift,created_by) values('General',$1,'Turno',$1) returning id",
        [people.admin],
      )
    ).rows[0].id;
    await db.query(
      "insert into task_checklist_items(task_id,label,position) values($1,'General',1)",
      [general],
    );
    await db.query(
      "insert into pending_loads(customer,created_by) values('Sin carga',$1)",
      [people.admin],
    );
    await db.query(
      "insert into task_dependencies values($1,$2),($3,$4),($1,$4)",
      [tasks[keep[0]], tasks[keep[1]], general, tasks[removed[0]]],
    );
    await db.query(
      "insert into operational_alerts(recipient,kind,message,dedupe_key) values($1,'task_due','General','general')",
      [people.admin],
    );
    const radar = [...keep, ...removed, "VG-EXTERNO"].map((load) => ({
      load,
      note: "Texto íntegro",
    }));
    await db.query(
      "insert into radar_sources(file_name,records,created_by) values('Radar',$1,$2)",
      [JSON.stringify(radar), people.admin],
    );
    await db.query(
      "insert into original_radar(file_name,records,updated_by) values('Radar',$1,$2)",
      [JSON.stringify(radar), people.admin],
    );
    await db.query(
      "insert into customer_assignments(customer,owner_id,updated_by) values('Cliente',$1,$1) on conflict(customer_key) do nothing",
      [people.admin],
    );
    const before = await snapshot(db);

    async function failsWithoutChanges(command, expected) {
      const original = await snapshot(db);
      await assert.rejects(db.exec(command), expected);
      await db.exec("rollback");
      assert.deepEqual(await snapshot(db), original);
    }

    await context.test("si falta una carga no se borra nada", async () => {
      await failsWithoutChanges(
        sql.replace("('846072')", "('FALTANTE')"),
        /FALTANTE/,
      );
    });
    await context.test(
      "una relación desconocida revierte incluso los hijos borrados",
      async () => {
        await db.exec(
          "create table test_guard(load text references loads(load)); insert into test_guard values('999999')",
        );
        await failsWithoutChanges(sql, /foreign key|violates|referenc/i);
        await db.exec("drop table test_guard");
      },
    );
    await context.test(
      "si una recurrencia descartada tiene una tarea protegida, se detiene",
      async () => {
        await db.query("update shift_tasks set schedule_id=$1 where id=$2", [
          schedules[removed[0]],
          tasks[keep[0]],
        ]);
        await failsWithoutChanges(sql, /relaciones compartidas/);
        await db.query("update shift_tasks set schedule_id=$1 where id=$2", [
          schedules[keep[0]],
          tasks[keep[0]],
        ]);
      },
    );
    await context.test(
      "si un apartado protegido tiene una referencia incompatible, se detiene",
      async () => {
        await db.query(
          "update reserved_loads set own_load=$1 where related_load=$2",
          [keep[0], removed[0]],
        );
        await failsWithoutChanges(sql, /relaciones compartidas/);
        await db.query(
          "update reserved_loads set own_load='' where related_load=$1",
          [removed[0]],
        );
      },
    );
    await context.test(
      "elimina datos relacionados y mantiene exactos los datos de las seis y los independientes",
      async () => {
        const result = await db.exec(sql);
        assert.equal(Number(result.at(-1).rows[0].cargas_conservadas), 6);
        const after = await snapshot(db);
        const keptTasks = new Set([...keep.map((id) => tasks[id]), general]);
        const keptPending = new Set(
          before.pending_loads
            .filter((row) => !removed.includes(row.linked_load))
            .map((row) => row.id),
        );
        const keptReserved = new Set(
          before.reserved_loads
            .filter((row) => !removed.includes(row.related_load))
            .map((row) => row.id),
        );
        const expectedFilters = {
          loads: (row) => keep.includes(row.load),
          comments: (row) => keep.includes(row.load),
          incidents: (row) => keep.includes(row.load),
          load_history: (row) => keep.includes(row.load),
          communications: (row) => keep.includes(row.load),
          load_followers: (row) => keep.includes(row.load),
          panel_load_versions: (row) => keep.includes(row.load),
          import_rows: (row) => keep.includes(row.load),
          import_batches: (row) => keep.includes(row.file_name),
          admin_events: (row) => !removed.includes(row.details.load),
          shift_tasks: (row) => keptTasks.has(row.id),
          shift_task_history: (row) => keptTasks.has(row.task_id),
          task_schedules: (row) => keep.includes(row.load),
          task_checklist_items: (row) => keptTasks.has(row.task_id),
          task_dependencies: (row) =>
            keptTasks.has(row.task_id) && keptTasks.has(row.depends_on),
          operational_alerts: (row) => !removed.includes(row.load),
          pending_loads: (row) => keptPending.has(row.id),
          pending_load_comments: (row) => keptPending.has(row.pending_id),
          pending_load_history: (row) => keptPending.has(row.pending_id),
          reserved_loads: (row) => keptReserved.has(row.id),
          reserved_load_history: (row) => keptReserved.has(row.reserved_id),
        };
        for (const [table, filter] of Object.entries(expectedFilters))
          assert.deepEqual(after[table], before[table].filter(filter), table);
        for (const table of ["radar_sources", "original_radar"]) {
          assert.deepEqual(
            after[table],
            before[table].map((row) => ({
              ...row,
              records: row.records.filter(
                (item) => !removed.includes(item.load),
              ),
            })),
            table,
          );
        }
        for (const table of Object.keys(before)) {
          if (
            !(table in expectedFilters) &&
            !["radar_sources", "original_radar", "panel_revisions"].includes(
              table,
            )
          )
            assert.deepEqual(after[table], before[table], table);
        }
        assert.deepEqual(
          after.loads.map((row) => row.load).sort(),
          [...keep].sort(),
        );
      },
    );
    await context.test(
      "no depende de la sesión del editor y se puede repetir",
      async () => {
        const clean = await snapshot(db);
        const block = sql.match(/do \$limpieza\$[\s\S]*?\$limpieza\$;/)[0];
        await db.query(block);
        assert.equal(
          (await db.query("select to_regclass('pg_temp.pb_conservar') as name"))
            .rows[0].name,
          null,
        );
        const after = await snapshot(db);
        delete clean.panel_revisions;
        delete after.panel_revisions;
        assert.deepEqual(after, clean);
      },
    );
  } finally {
    await db.close();
  }
});
