import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./helpers/database.js";

test("radar: ubicaciones válidas, archivo compartido acotado y cliente sin acceso", async () => {
  const { db, asUser, rpc, people } = await createTestDatabase(
    [
      "001_panel.sql",
      "002_load_operations.sql",
      "003_pending_loads.sql",
      "004_reserved_loads.sql",
      "005_team_and_shifts.sql",
      "006_import_archive_and_messages.sql",
      "007_radar_and_places.sql",
    ],
    { admin: "admin", csr: "csr", manager: "manager", client: "client" },
  );
  try {
    await asUser("csr");
    await rpc("ops_save_place", [" Laredo, TX ", 27.5, -99.4]);
    await rpc("ops_save_place", ["laredo, tx", 27.6, -99.5]);
    assert.equal((await db.query("select * from geo_places")).rows.length, 1);
    await assert.rejects(rpc("ops_save_place", ["Error", 91, 0]), /inválida/);
    const records = [
      {
        load: "R-1",
        origin_city: "Laredo",
        customer: "ACME",
        secret: "NO GUARDAR",
        created_by: people.admin,
      },
    ];
    const result = (
      await rpc("ops_save_radar_source", [
        "radar.xlsx",
        JSON.stringify(records),
      ])
    ).rows[0];
    assert.equal(result.created_by, people.csr);
    assert.equal(Object.hasOwn(result.records[0], "secret"), false);
    assert.equal((await db.query("select * from loads")).rows.length, 0);
    await rpc("ops_save_template", [
      "Privada",
      "Texto del operador",
      null,
      null,
    ]);
    await assert.rejects(
      rpc("ops_backup_page", ["profiles", 0, 500]),
      /permiso/,
    );
    await asUser("admin");
    assert.equal(
      (await db.query("select * from message_templates")).rows.length,
      0,
    );
    assert.equal(
      (await rpc("ops_backup_page", ["message_templates", 0, 500])).rows.length,
      1,
    );
    await assert.rejects(
      rpc("ops_backup_page", ["auth.users", 0, 500]),
      /no permitida/,
    );
    await asUser("manager");
    assert.equal(
      (await db.query("select * from radar_sources")).rows.length,
      1,
    );
    await assert.rejects(rpc("ops_save_place", ["No", 1, 1]), /permiso/);
    await asUser("client");
    assert.equal((await db.query("select * from geo_places")).rows.length, 0);
    assert.equal(
      (await db.query("select * from radar_sources")).rows.length,
      0,
    );
    await assert.rejects(
      rpc("ops_save_radar_source", ["No", JSON.stringify(records)]),
      /permiso/,
    );
    await asUser("anon");
    await assert.rejects(
      rpc("ops_save_place", ["No", 1, 1]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
