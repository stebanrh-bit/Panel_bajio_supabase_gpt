import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";

// Transcripción independiente de la lista del usuario, incluida la segunda columna (844090).
const KEEP = `839445 839453 839454 839995 839996 839997 839998 839994
840598 840600 840720 840721 840722 840723 841140 841431
841757 841758 842233 842232 841947 842234 842382 842362
842386 842908 842909 842910 843065 843444 843196 843847
843855 843106 844224 844223 843107 843108 843121 843122
845121 845120 845704 845309 844408 845690 845515 845122
845941 845942 845943 845517 845709 845496 845516 845520
843516 845679 844304 844745 845667 844090 845562 845112`.split(/\s+/);
const maintenance = (file) =>
  readFile(
    new URL(`../../supabase/maintenance/${file}`, import.meta.url),
    "utf8",
  );
const [previewSql, deleteSql] = await Promise.all([
  maintenance("01_vista_previa_conservar_64.sql"),
  maintenance("02_eliminar_excepto_64.sql"),
]);
const migrations = [
  "001_panel.sql",
  "002_load_operations.sql",
  "003_pending_loads.sql",
  "004_reserved_loads.sql",
  "005_team_and_shifts.sql",
  "006_import_archive_and_messages.sql",
  "007_radar_and_places.sql",
  "008_incident_category_validation.sql",
  "009_original_interface.sql",
  "010_google_miles_worker.sql",
];

/** Comparar valores completos, no solo conteos: fechas/autores/textos tampoco deben cambiar. */
async function snapshot(db) {
  const { rows: tables } = await db.query(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  );
  const result = {};
  for (const { tablename } of tables) {
    const name = '"' + tablename.replaceAll('"', '""') + '"';
    result[tablename] = (
      await db.query(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as rows from public.${name} t`,
      )
    ).rows[0].rows;
  }
  return result;
}
const sorted = (rows) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const sameRows = (actual, expected, name) =>
  assert.deepEqual(sorted(actual), sorted(expected), name);

test("limpieza: ambos archivos contienen exactamente los 64 números autorizados", () => {
  assert.equal(new Set(KEEP).size, 64);
  for (const sql of [previewSql, deleteSql]) {
    const values = sql.match(
      /insert into pb_conservar\(load\) values\n([\s\S]*?);/,
    )[1];
    const ids = [...values.matchAll(/\('(\d+)'\)/g)].map((match) => match[1]);
    assert.deepEqual(ids.sort(), [...KEEP].sort());
  }
});

test("limpieza de cargas: vista previa, conservación exacta y reversión real en PostgreSQL", async (context) => {
  const { db, people } = await createTestDatabase(migrations, {
    admin: "admin",
    csr: "csr",
    client: "client",
  });
  const removed = ["999999", "BORRAR-A", "8394450", "000839445"];
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      people.admin,
    ]);
    await db.query(
      `insert into loads(load,customer,status,trailer,regresos,charges,archived,pod_sent)
      select n,'Cliente '||n,case when ord%3=0 then 'DELIVERED' else 'Cargando' end,
      'T-'||n,'Referencia libre 999999', '0',ord%2=0,case when ord%3=0 then 'true' else 'false' end
      from unnest($1::text[]) with ordinality t(n,ord)`,
      [KEEP],
    );
    await db.query(
      "insert into loads(load,customer,status) select n,'Archivo incorrecto','Cargando' from unnest($1::text[]) t(n)",
      [removed],
    );
    for (const load of [KEEP[0], KEEP.at(-1), ...removed]) {
      await db.query(
        "insert into comments(load,body) values($1,'Comentario exacto con acentos y <texto>')",
        [load],
      );
      await db.query(
        "insert into incidents(load,category,severity,description) values($1,'Demora','alta','No perder esta incidencia')",
        [load],
      );
      await db.query(
        "insert into communications(load,event_type,reason,actor,public_message) values($1,'NOTIFICADO','Mensaje de prueba',$2,'Aviso al cliente')",
        [load, people.admin],
      );
      await db.query("insert into load_followers(load,user_id) values($1,$2)", [
        load,
        people.csr,
      ]);
      const task = (
        await db.query(
          "insert into shift_tasks(load,note,assigned_to,shift,created_by) values($1,'Tarea '||$1,$2,'07:00–16:00',$2) returning id",
          [load, people.admin],
        )
      ).rows[0];
      await db.query(
        "insert into shift_task_history(task_id,event,actor,after_data) values($1,'created',$2,'{}')",
        [task.id, people.admin],
      );
      const pending = (
        await db.query(
          "insert into pending_loads(customer,created_by) values('Cliente',$1) returning id",
          [people.admin],
        )
      ).rows[0];
      await db.query(
        "insert into pending_load_comments(pending_id,body) values($1,'Comentario previo a vincular')",
        [pending.id],
      );
      await db.query(
        "update pending_loads set state='linked',linked_load=$1,linked_by=$2,linked_at=now() where id=$3",
        [load, people.admin, pending.id],
      );
      await db.query(
        "insert into admin_events(action,details) values('load_archive_changed',jsonb_build_object('load',$1::text))",
        [load],
      );
    }
    const task = (
      await db.query(
        "insert into shift_tasks(note,assigned_to,shift,created_by) values('Tarea general sin carga',$1,'Turno',$1) returning id",
        [people.admin],
      )
    ).rows[0];
    await db.query(
      "insert into shift_task_history(task_id,event,actor,after_data) values($1,'created',$2,'{}')",
      [task.id, people.admin],
    );
    await db.query(
      "insert into pending_loads(customer,created_by) values('Solicitud sin carga',$1)",
      [people.admin],
    );
    for (const [load, own, note] of [
      ["EXTERNO-1", KEEP[0], "Apartado protegido"],
      ["999999", "", "Apartado descartable"],
      ["999999", "Regreso: 839445 / 999999", "Apartado compartido protegido"],
      ["EXTERNO-2", "SIN-CARGA", "Apartado independiente"],
    ]) {
      const reserved = (
        await db.query(
          "insert into reserved_loads(load,own_load,note,next_review_at,created_by,updated_by) values($1,$2,$3,now(),$4,$4) returning id",
          [load, own, note, people.admin],
        )
      ).rows[0];
      await db.query(
        "insert into reserved_load_history(reserved_id,event,actor,after_data) values($1,'created',$2,'{}')",
        [reserved.id, people.admin],
      );
    }
    const batches = {};
    for (const [name, loads] of [
      ["mixto", [KEEP[0], "999999"]],
      ["descartar", ["BORRAR-A", "HUERFANA"]],
      ["protegido", [KEEP.at(-1)]],
    ]) {
      const batch = (
        await db.query(
          "insert into import_batches(file_name,created_by) values($1,$2) returning id",
          [name, people.admin],
        )
      ).rows[0];
      batches[name] = batch.id;
      for (const load of loads)
        await db.query(
          "insert into import_rows(batch_id,load,before_data,after_data) values($1,$2,'{}','{}')",
          [batch.id, load],
        );
      await db.query(
        "insert into admin_events(action,details) values('import_applied',jsonb_build_object('batch',$1::text))",
        [batch.id],
      );
    }
    await db.query(
      "insert into admin_events(action,details) values('shared_event',jsonb_build_object('batch',$1::text,'load','999999'))",
      [batches.mixto],
    );
    const keepRow = {
      load: KEEP[0],
      customer: "Conservar",
      note: "Texto íntegro",
      nested: { untouched: true },
    };
    const deleteRow = { load: "999999", customer: "Descartar" };
    const externalRow = {
      load: "EXTERNA-VG",
      customer: "Archivo independiente",
    };
    for (const records of [
      [keepRow, deleteRow, externalRow, keepRow],
      [deleteRow],
    ])
      await db.query(
        "insert into radar_sources(file_name,records,created_by) values('Radar sin cambios de nombre',$1,$2)",
        [JSON.stringify(records), people.admin],
      );
    await db.query(
      "insert into original_radar(file_name,records,visible,updated_by) values('Radar actual',$1,true,$2)",
      [JSON.stringify([deleteRow, keepRow, externalRow]), people.admin],
    );
    await db.query(
      "insert into original_routes(route_key,origin_key,destination_key,miles,hours,created_by) values('aa>bb','aa','bb',100,2,$1)",
      [people.admin],
    );
    await db.query(
      "insert into customer_assignments(customer,owner_id,updated_by) values('Cliente conservado',$1,$1)",
      [people.admin],
    );
    await db.query(
      "insert into portal_access(user_id,customer) values($1,'Cliente conservado')",
      [people.client],
    );
    await db.query(
      "insert into message_templates(owner_id,title,body) values($1,'Plantilla','No borrar')",
      [people.admin],
    );
    await db.query(
      "insert into shift_closures(body,shift,created_by) values('Cierre con referencia libre 999999','Turno',$1)",
      [people.admin],
    );
    const before = await snapshot(db);
    let previewReport;
    await context.test(
      "vista previa no modifica ninguna tabla y muestra 64 encontradas y 4 por eliminar",
      async () => {
        const output = await db.exec(previewSql);
        const report = output.find((item) =>
          item.rows?.some((row) => row.concepto === "Faltantes de tu lista"),
        ).rows;
        previewReport = report;
        assert.equal(
          Number(
            report.find((row) => row.concepto === "Faltantes de tu lista")
              .cantidad,
          ),
          0,
        );
        assert.equal(
          Number(report.find((row) => row.concepto === "Cargas").cantidad),
          removed.length,
        );
        assert.equal(
          Number(report.find((row) => row.grupo === "CONSERVAR").cantidad),
          64,
        );
        assert.deepEqual(await snapshot(db), before);
      },
    );
    await context.test(
      "una carga faltante detiene toda la operación",
      async () => {
        await assert.rejects(
          db.exec(deleteSql.replace("('839453')", "('FALTA-839453')")),
          /FALTA-839453/,
        );
        await db.exec("rollback");
        assert.deepEqual(await snapshot(db), before);
      },
    );
    await context.test(
      "una relación no contemplada causa error y recupera incluso los hijos ya borrados",
      async () => {
        await db.exec(
          "create table public.test_guard(load text references public.loads(load)); insert into test_guard values('999999')",
        );
        const guarded = await snapshot(db);
        await assert.rejects(
          db.exec(deleteSql),
          /foreign key|violates|referenc/i,
        );
        await db.exec("rollback");
        assert.deepEqual(await snapshot(db), guarded);
        await db.exec("drop table public.test_guard");
      },
    );
    await context.test(
      "si un trigger intenta cambiar una carga protegida se revierte todo",
      async () => {
        await db.exec(`create function public.test_bad_trigger() returns trigger language plpgsql as $$ begin update public.loads set trailer='CAMBIO INDEBIDO' where load='839445'; return old; end $$;
        create trigger test_bad_trigger after delete on public.loads for each row execute function public.test_bad_trigger()`);
        await assert.rejects(
          db.exec(deleteSql),
          /Cambio inesperado en datos protegidos/,
        );
        await db.exec("rollback");
        assert.deepEqual(await snapshot(db), before);
        await db.exec(
          "drop trigger test_bad_trigger on public.loads; drop function public.test_bad_trigger()",
        );
      },
    );
    await context.test(
      "borra solo lo asociado y preserva datos completos, relaciones compartidas y configuración",
      async () => {
        const result = await db.exec(deleteSql);
        assert.equal(Number(result.at(-1).rows[0].cargas_conservadas), 64);
        const after = await snapshot(db);
        const countedTables = {
          Cargas: "loads",
          Comentarios: "comments",
          "Incidencias, incluidas retiradas": "incidents",
          "Historial de cargas": "load_history",
          Comunicaciones: "communications",
          "Seguidores de cargas": "load_followers",
          "Tareas relacionadas": "shift_tasks",
          "Historial de esas tareas": "shift_task_history",
          "Solicitudes vinculadas": "pending_loads",
          "Comentarios de esas solicitudes": "pending_load_comments",
          "Historial de esas solicitudes": "pending_load_history",
          "Apartados relacionados sin carga protegida": "reserved_loads",
          "Historial de esos apartados": "reserved_load_history",
          "Filas de importacion no conservadas": "import_rows",
          "Lotes sin cargas protegidas": "import_batches",
          "Eventos de cargas/lotes eliminados": "admin_events",
        };
        for (const [concept, table] of Object.entries(countedTables))
          assert.equal(
            Number(
              previewReport.find((row) => row.concepto === concept).cantidad,
            ),
            before[table].length - after[table].length,
            `Vista previa exacta: ${concept}`,
          );
        for (const [concept, table] of [
          ["Filas de archivos Radar", "radar_sources"],
          ["Filas del Radar actual", "original_radar"],
        ])
          assert.equal(
            Number(
              previewReport.find((row) => row.concepto === concept).cantidad,
            ),
            before[table].flatMap((row) => row.records).length -
              after[table].flatMap((row) => row.records).length,
            `Vista previa exacta: ${concept}`,
          );
        const kept = (row) => KEEP.includes(row.load);
        for (const table of [
          "loads",
          "comments",
          "incidents",
          "load_history",
          "communications",
          "load_followers",
          "import_rows",
        ])
          sameRows(after[table], before[table].filter(kept), table);
        sameRows(
          after.shift_tasks,
          before.shift_tasks.filter((row) => row.load === null || kept(row)),
          "tareas completas",
        );
        sameRows(
          after.shift_task_history,
          before.shift_task_history.filter((row) =>
            after.shift_tasks.some((task) => task.id === row.task_id),
          ),
          "historial de tareas",
        );
        sameRows(
          after.pending_loads,
          before.pending_loads.filter(
            (row) => row.linked_load === null || KEEP.includes(row.linked_load),
          ),
          "solicitudes completas",
        );
        for (const table of ["pending_load_comments", "pending_load_history"])
          sameRows(
            after[table],
            before[table].filter((row) =>
              after.pending_loads.some(
                (pending) => pending.id === row.pending_id,
              ),
            ),
            table,
          );
        sameRows(
          after.reserved_loads,
          before.reserved_loads.filter(
            (row) => row.note !== "Apartado descartable",
          ),
          "apartados completos",
        );
        sameRows(
          after.reserved_load_history,
          before.reserved_load_history.filter((row) =>
            after.reserved_loads.some(
              (reserved) => reserved.id === row.reserved_id,
            ),
          ),
          "historial de apartados",
        );
        sameRows(
          after.import_batches,
          before.import_batches.filter((row) => row.id !== batches.descartar),
          "lotes completos",
        );
        sameRows(
          after.admin_events,
          before.admin_events.filter(
            (row) =>
              row.details.batch !== batches.descartar &&
              (!removed.includes(row.details.load) ||
                row.details.batch === batches.mixto),
          ),
          "eventos",
        );
        assert.equal(after.radar_sources.length, 1);
        assert.deepEqual(after.radar_sources[0], {
          ...before.radar_sources.find((row) => row.records.length > 1),
          records: [keepRow, externalRow, keepRow],
        });
        assert.deepEqual(after.original_radar[0], {
          ...before.original_radar[0],
          records: [keepRow, externalRow],
        });
        const changed = new Set([
          "loads",
          "comments",
          "incidents",
          "load_history",
          "communications",
          "load_followers",
          "import_rows",
          "shift_tasks",
          "shift_task_history",
          "pending_loads",
          "pending_load_comments",
          "pending_load_history",
          "reserved_loads",
          "reserved_load_history",
          "import_batches",
          "admin_events",
          "radar_sources",
          "original_radar",
        ]);
        for (const table of Object.keys(before).filter(
          (table) => !changed.has(table),
        ))
          assert.deepEqual(
            after[table],
            before[table],
            `tabla independiente ${table}`,
          );
        assert.deepEqual(
          (await db.query("select load from loads order by load")).rows.map(
            (row) => row.load,
          ),
          [...KEEP].sort(),
        );
      },
    );
    await context.test(
      "repetir el SQL conserva todo y no cambia fechas ni autores",
      async () => {
        const clean = await snapshot(db);
        await db.exec(deleteSql);
        assert.deepEqual(await snapshot(db), clean);
      },
    );
    await context.test(
      "Radar vacío se oculta sin afectar rutas ni las cargas conservadas",
      async () => {
        const protectedLoads = (
          await db.query("select * from loads order by load")
        ).rows;
        await db.exec("insert into loads(load) values('ULTIMA-A-BORRAR')");
        await db.query("update original_radar set records=$1", [
          JSON.stringify([{ load: "ULTIMA-A-BORRAR" }]),
        ]);
        await db.exec(deleteSql);
        const radar = (
          await db.query("select records,visible from original_radar")
        ).rows[0];
        assert.deepEqual(radar, { records: [], visible: false });
        assert.deepEqual(
          (await db.query("select * from loads order by load")).rows,
          protectedLoads,
        );
        assert.equal(
          (await db.query("select count(*) as count from original_routes"))
            .rows[0].count,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
