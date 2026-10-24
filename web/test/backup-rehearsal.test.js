import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";
import { rehearseBackup } from "../../scripts/rehearse_backup.mjs";
const files = (
  await readdir(new URL("../../supabase/migrations/", import.meta.url))
)
  .filter((n) => /^\d.*sql$/.test(n))
  .sort();
test("respaldo v2: recuperar operación, radar y preferencias en una base separada", async () => {
  const { db, asUser, people } = await createTestDatabase(files, {
    Admin: "admin",
  });
  let backup;
  try {
    await asUser("Admin");
    await db.exec(
      "insert into loads(load,customer,trailer) values ('BACKUP-1','ACME','T0132')",
    );
    await db.exec(
      "update loads set origin_city='Monterrey',origin_state='NL',dest_city='Laredo',dest_state='TX',status='Cargando' where load='BACKUP-1'",
    );
    await db.query(
      "select * from ops_save_route_instruction(null,null,$1,true)",
      [
        {
          name: "Ruta del respaldo",
          customer: "ACME",
          origin_city: "Monterrey",
          origin_state: "NL",
          dest_city: "Laredo",
          dest_state: "TX",
          flow: "export",
          state: "approved",
          steps: {
            origin: {
              action: "Confirmar instrucciones de recuperación",
              requires: [],
            },
          },
        },
      ],
    );
    await db.query("select ops_save_vg_contact(null,null,$1)", [
      { name: "VG externo", phone: "123" },
    ]);
    await db.query("select ops_original_places($1)", [
      [
        {
          key: "laredo|tx",
          kind: "city",
          text: "Laredo, TX",
          lat: 27.5,
          lon: -99.5,
        },
        {
          key: "dallas|tx",
          kind: "city",
          text: "Dallas, TX",
          lat: 32.8,
          lon: -96.8,
        },
      ],
    ]);
    await db.query("select ops_original_routes($1)", [
      [
        {
          key: "laredo|tx>dallas|tx",
          origen: "laredo|tx",
          destino: "dallas|tx",
          millas: 430,
          horas: 8,
          recta: 400,
        },
      ],
    ]);
    await db.query("select ops_save_original_templates($1,$2)", [
      { actualizacion: "Hola cliente" },
      {},
    ]);
    const template = (
      await db.query(
        "select * from ops_save_checklist(null,null,'Documentos',$1)",
        [[{ label: "Validar DODA", required: true }]],
      )
    ).rows[0];
    const schedule = (
      await db.query("select * from ops_save_task_schedule(null,null,$1)", [
        {
          note: "Diaria",
          assigned_to: people.Admin,
          cadence: "daily",
          weekdays: [1],
          local_time: "09:00",
          load: "BACKUP-1",
          checklist_id: template.id,
        },
      ])
    ).rows[0];
    const task = (
      await db.query("select * from ops_save_tasks($1,null,null)", [
        { note: "Revisar", assigned_to: people.Admin, loads: ["BACKUP-1"] },
      ])
    ).rows[0];
    await db.query("select ops_attach_checklist($1,$2,$3)", [
      task.id,
      task.updated_at,
      template.id,
    ]);
    await db.query(
      "select ops_save_structured_closure('Resumen','Sin pendientes críticos',$1,'Revisar mañana')",
      [people.Admin],
    );
    const manifest = (await db.query("select ops_backup_manifest() as data"))
      .rows[0].data;
    backup = { format: manifest.format, tables: {}, counts: {} };
    for (const table of manifest.tables) {
      backup.tables[table] = (
        await db.query("select * from ops_backup_page($1,0,500)", [table])
      ).rows.map((r) => r.ops_backup_page);
      backup.counts[table] = backup.tables[table].length;
    }
    assert.ok(!JSON.stringify(backup).includes("token_hash"));
    assert.equal(backup.tables.profiles[0].id, people.Admin);
  } finally {
    await db.close();
  }
  const restored = await rehearseBackup(backup);
  assert.equal(restored.ok, true);
  assert.equal(restored.tables.loads, 1);
  assert.equal(restored.tables.route_instruction_templates, 1);
  assert.equal(restored.tables.original_routes, 1);
  assert.equal(restored.tables.original_preferences, 1);
  assert.equal(restored.tables.vg_contacts, 1);
  assert.equal(restored.tables.task_schedules, 1);
  assert.equal(restored.tables.task_checklist_items, 1);
  assert.equal(restored.tables.shift_closures, 1);
  await assert.rejects(
    rehearseBackup({ ...backup, counts: { ...backup.counts, loads: 999 } }),
    /Conteo/,
  );
});
