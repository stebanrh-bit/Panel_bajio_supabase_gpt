import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";

/** El cambio se valida con PostgreSQL local; no utiliza la base del usuario. */
test("cargas nuevas y avisos manuales: actualización conserva datos y limita confirmaciones a cargas propias", async () => {
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const migrations = (await readdir(directory))
    .filter((name) => /^\d.*\.sql$/.test(name) && Number(name.slice(0, 3)) < 17)
    .sort();
  const { db, asUser, rpc } = await createTestDatabase(migrations, {
    admin: "admin",
    csr: "csr",
    client: "client",
  });
  const update = await readFile(
    new URL("017_default_arrival_status.sql", directory),
    "utf8",
  );
  const manualUpdate = await readFile(
    new URL("018_manual_client_messages.sql", directory),
    "utf8",
  );
  const allLoads = async () =>
    (await db.query("select * from loads order by load")).rows;
  try {
    await asUser("admin");
    await db.exec(`insert into loads(load,customer,status) values
      ('PREVIA','ACME','En AA'), ('SIN-ESTATUS','ACME','');
      insert into comments(load,body) values ('PREVIA','Esperar documentación');`);
    const before = await allLoads();
    const historyBefore = (
      await db.query("select * from load_history order by id")
    ).rows;
    await db.exec("reset role");
    await db.exec(update);
    await db.exec(manualUpdate);
    await db.exec(update);
    await db.exec(manualUpdate); // Instalar dos veces no reescribe registros ni crea historial.
    await asUser("admin");
    assert.deepEqual(await allLoads(), before);
    assert.deepEqual(
      (await db.query("select * from load_history order by id")).rows,
      historyBefore,
    );
    assert.equal(
      (await db.query("select body from comments")).rows[0].body,
      "Esperar documentación",
    );

    await db.exec(`insert into loads(load,customer) values ('DEFAULT','ACME');
      insert into loads(load,customer,status) values
      ('VACIA','ACME','  '), ('NULL','ACME',null), ('EXPLICITA','ACME','Cargando');`);
    for (const load of ["DEFAULT", "VACIA", "NULL"])
      assert.equal(
        (await db.query("select status from loads where load=$1", [load]))
          .rows[0].status,
        "PTE. ARRIVO",
      );
    assert.equal(
      (await db.query("select status from loads where load='EXPLICITA'"))
        .rows[0].status,
      "Cargando",
    );

    const records = JSON.stringify([
      { load: "IMPORTADA", customer: "ACME", status: "DELIVERED" },
      {
        load: "PREVIA",
        customer: "ACME",
        status: "Cargando",
        trailer: "T-001",
      },
      { load: "SIN-ESTATUS", customer: "ACME", truck: "101" },
    ]);
    const preview = (await rpc("ops_preview_import", [records])).rows[0]
      .ops_preview_import;
    await rpc("ops_apply_import", [
      records,
      JSON.stringify(preview),
      "prueba.csv",
    ]);
    const saved = Object.fromEntries(
      (await allLoads()).map((load) => [load.load, load]),
    );
    assert.equal(saved.IMPORTADA.status, "PTE. ARRIVO");
    assert.equal(saved.PREVIA.status, "En AA");
    assert.equal(saved.PREVIA.trailer, "T-001");
    assert.equal(saved["SIN-ESTATUS"].status, "");
    assert.equal(saved["SIN-ESTATUS"].truck, "101");

    await db.exec(
      "update loads set status='En transito' where load='IMPORTADA'",
    );
    const updatedPreview = (await rpc("ops_preview_import", [records])).rows[0]
      .ops_preview_import;
    await rpc("ops_apply_import", [
      records,
      JSON.stringify(updatedPreview),
      "actualizacion.csv",
    ]);
    assert.equal(
      (await db.query("select status from loads where load='IMPORTADA'"))
        .rows[0].status,
      "En transito",
    );
    assert.equal(
      (
        await db.query(
          "select has_function_privilege(current_user, 'public.ops_default_load_status()', 'execute') as allowed",
        )
      ).rows[0].allowed,
      false,
    );
    const notification = (
      await db.query(
        "select *,updated_at::text as version from loads where load='IMPORTADA'",
      )
    ).rows[0];
    assert.equal(notification.client_notify_pending, "true");
    const confirmed = (
      await rpc("confirm_client_notice", [
        notification.load,
        notification.version,
        "WhatsApp",
        "Actualización manual",
      ])
    ).rows[0];
    assert.equal(confirmed.client_notify_pending, "false");
    assert.ok(confirmed.client_notified_at);
    assert.equal(confirmed.last_communication_channel, "WhatsApp");
    await assert.rejects(
      rpc("confirm_client_notice", [
        notification.load,
        notification.version,
        "WhatsApp",
        "Obsoleta",
      ]),
      /cambió/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as total from communications where load='IMPORTADA' and event_type='NOTIFICADO'",
        )
      ).rows[0].total,
      1,
    );
    const events = (await rpc("ops_customer_communications", ["ACME", 0, 100]))
      .rows[0].ops_customer_communications;
    assert.ok(events.some((event) => event.channel === "WhatsApp"));
    await asUser("csr");
    await db.exec(
      "insert into loads(load,customer) values('OTRA','OTRO CLIENTE')",
    );
    await assert.rejects(
      rpc("confirm_client_notice", [
        notification.load,
        confirmed.updated_at,
        "WhatsApp",
        "Ajena",
      ]),
      /pertenece|cambió/,
    );
    assert.deepEqual(
      (await db.query("select * from communications where load='IMPORTADA'"))
        .rows,
      [],
    );
    assert.deepEqual(
      (await rpc("ops_customer_communications", ["ACME", 0, 100])).rows[0]
        .ops_customer_communications,
      [],
    );
    await asUser("client");
    await assert.rejects(
      rpc("confirm_client_notice", [
        notification.load,
        confirmed.updated_at,
        "WhatsApp",
        "Externa",
      ]),
      /permiso/,
    );
    await asUser("admin");
    await assert.rejects(
      rpc("ops_portal_loads", [0, 100]),
      /permission denied/,
    );
    assert.equal(
      (await db.query("select external_alerts_enabled from panel_settings"))
        .rows[0].external_alerts_enabled,
      false,
    );
  } finally {
    await db.close();
  }
});
