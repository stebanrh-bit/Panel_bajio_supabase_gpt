import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";
import { defaultConfig } from "../src/original/load-views/rules.js";

test("Mostrar privado: actualización aditiva, aislamiento, versiones y plantillas conservadas", async () => {
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const migrations = (await readdir(directory))
    .filter((f) => /^\d.*sql$/.test(f) && !f.startsWith("019_"))
    .sort();
  const { db, people, asUser, rpc } = await createTestDatabase(migrations, {
    admin: "admin",
    csr: "csr",
    manager: "manager",
    client: "client",
  });
  const update = await readFile(
    new URL("019_personal_load_views.sql", directory),
    "utf8",
  );
  const save = async (config, version = null) =>
    (await rpc("ops_save_load_views", [JSON.stringify(config), version]))
      .rows[0].ops_save_load_views;
  try {
    await asUser("admin");
    await db.exec(
      "insert into loads(load,customer) values('NO-CAMBIAR','ACME')",
    );
    await rpc("ops_save_original_templates", [
      JSON.stringify({ general: "Mi mensaje" }),
      JSON.stringify({ general: "General" }),
    ]);
    const loadBefore = (
      await db.query("select * from loads where load='NO-CAMBIAR'")
    ).rows[0];
    await db.exec("reset role");
    await db.exec(update);
    await db.exec(update);
    await asUser("admin");
    assert.deepEqual(
      (await db.query("select * from loads where load='NO-CAMBIAR'")).rows[0],
      loadBefore,
    );
    const previous = (
      await db.query(
        "select updated_at::text as version from original_preferences",
      )
    ).rows[0];
    const config = defaultConfig();
    config.items[1].rules.pickup = "any";
    let result = await save(config, previous.version);
    assert.deepEqual(result.config, config);
    assert.equal(
      (await db.query("select templates from original_preferences")).rows[0]
        .templates.general,
      "Mi mensaje",
    );
    await assert.rejects(save(config, previous.version), /otra ventana/);
    for (const mutate of [
      (c) => (c.items[1].rules.pod = "maybe"),
      (c) => (c.items[1].name = "Todas"),
      (c) => (c.items[0].visible = false),
      (c) => (c.items[1].rules.statuses = [{}]),
      (c) =>
        Object.assign(c.items[1].rules, {
          period: "custom",
          start: "2026-10-28",
          end: "2026-10-26",
        }),
    ]) {
      const bad = structuredClone(config);
      mutate(bad);
      await assert.rejects(save(bad, result.version));
    }
    await rpc("ops_save_original_templates", [
      JSON.stringify({ general: "Mensaje actualizado" }),
      "{}",
    ]);
    assert.deepEqual(
      (await db.query("select load_views from original_preferences")).rows[0]
        .load_views,
      config,
    );
    const backup = (
      await rpc("ops_backup_page", ["original_preferences", 0, 500])
    ).rows[0];
    assert.ok(JSON.stringify(backup).includes("load_views"));
    await asUser("csr");
    assert.deepEqual(
      (await db.query("select * from original_preferences")).rows,
      [],
    );
    const personal = defaultConfig();
    personal.items[1].name = "Mi operación";
    await save(personal);
    assert.equal(
      (await db.query("select user_id from original_preferences")).rows[0]
        .user_id,
      people.csr,
    );
    await assert.rejects(
      db.query("update original_preferences set load_views=$1", [
        JSON.stringify(config),
      ]),
      /permission denied/,
    );
    for (const role of ["manager", "client", "anon"]) {
      await asUser(role);
      await assert.rejects(save(config), /permiso|permission denied/);
    }
    await db.exec("reset role");
    await db.exec(update);
    await asUser("admin");
    assert.deepEqual(
      (await db.query("select load_views from original_preferences")).rows[0]
        .load_views,
      config,
    );
  } finally {
    await db.close();
  }
});
