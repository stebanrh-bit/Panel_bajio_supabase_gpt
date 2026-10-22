import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";
const files = (
  await readdir(new URL("../../supabase/migrations/", import.meta.url))
)
  .filter((f) => /^\d.*sql$/.test(f))
  .sort();
test("señalamientos en PostgreSQL: permisos, guardado, aislamiento y reinstalación", async (t) => {
  const { db, people, asUser, rpc } = await createTestDatabase(files, {
    Admin: "admin",
    Ana: "csr",
    Luis: "csr",
    Gerencia: "manager",
    Cliente: "client",
  });
  const get = async () =>
    (
      await db.query(
        "select *,updated_at::text as version from loads where load='A'",
      )
    ).rows[0];
  const save = async (values, version) =>
    (
      await rpc("ops_set_load_signals", [
        "A",
        version ?? (await get()).version,
        values,
      ])
    ).rows[0];
  try {
    await asUser("Admin");
    await db.exec(
      "insert into loads(load,customer,status,color,next_review_at,next_review_note,recordatorio_fecha) values('A','ACME','Descompuesta','pink','2026-10-25T18:00:00Z','Mañana revisar','2026-10-25T20:00:00Z')",
    );
    await rpc("ops_set_punctual_pending", [
      "A",
      (await get()).version,
      true,
      "Llamar al taller ahora",
    ]);
    const original = await get();
    await t.test(
      "rechaza catálogo desconocido, nulos, duplicados y más de tres",
      async () => {
        for (const values of [
          null,
          [null],
          [""],
          ["unknown"],
          ["workshop", "workshop"],
          ["urgent", "delay", "workshop", "priority"],
        ])
          await assert.rejects(save(values), /catálogo|distintos/);
        assert.deepEqual((await get()).logistics_signals, []);
        await assert.rejects(
          db.exec(
            "update loads set logistics_signals='{workshop}' where load='A'",
          ),
          /permission denied/,
        );
        await assert.rejects(
          db.exec("update loads set logistics_signals_by=null where load='A'"),
          /permission denied/,
        );
        await assert.rejects(
          db.exec("update loads set logistics_signals_at=now() where load='A'"),
          /permission denied/,
        );
      },
    );
    let opened;
    await t.test(
      "CSR puede marcar cualquier cliente; el equipo recibe el cambio en el delta",
      async () => {
        await asUser("Ana");
        opened = await save(["workshop", "delay"]);
        assert.deepEqual(opened.logistics_signals, ["delay", "workshop"]);
        assert.equal(opened.logistics_signals_by, people.Ana);
        assert.ok(opened.logistics_signals_at);
        await asUser("Luis");
        assert.deepEqual((await get()).logistics_signals, [
          "delay",
          "workshop",
        ]);
        const delta = (await rpc("ops_loads_delta", [0, [], "", null, 500]))
          .rows[0].ops_loads_delta;
        assert.deepEqual(delta.items[0].logistics_signals, [
          "delay",
          "workshop",
        ]);
        const same = await save(["delay", "workshop"]);
        assert.deepEqual(same.updated_at, opened.updated_at);
      },
    );
    await t.test(
      "no sobrescribe una versión antigua ni los pendientes y fechas ya existentes",
      async () => {
        const old = (await get()).version;
        await db.exec("update loads set trailer='T0132' where load='A'");
        await assert.rejects(save([], old), /cambió/);
        const current = await save(["documents", "priority", "workshop"]);
        for (const field of [
          "status",
          "color",
          "next_review_at",
          "next_review_note",
          "recordatorio_fecha",
          "client_notify_pending",
          "punctual_pending",
          "punctual_note",
          "punctual_opened_by",
          "punctual_opened_at",
        ])
          assert.deepEqual(current[field], original[field], field);
        assert.equal(
          (await db.query("select count(*)::int as n from shift_tasks")).rows[0]
            .n,
          0,
        );
      },
    );
    await t.test(
      "solo Admin/CSR editan; Gerencia lee; el cliente no recibe señalamientos internos",
      async () => {
        const version = (await get()).version;
        for (const role of ["Gerencia", "Cliente", "anon"]) {
          await asUser(role);
          await assert.rejects(
            rpc("ops_set_load_signals", ["A", version, []]),
            /permiso|permission denied/,
          );
        }
        await asUser("Gerencia");
        assert.equal((await get()).logistics_signals.length, 3);
        await asUser("Admin");
        await rpc("ops_set_portal_access", [people.Cliente, "ACME", true]);
        await asUser("Cliente");
        const portal = (await rpc("ops_portal_detail", ["A"])).rows[0]
          .ops_portal_detail;
        assert.equal(portal.load, "A");
        assert.ok(!Object.hasOwn(portal, "logistics_signals"));
        assert.equal((await db.query("select load from loads")).rows.length, 0);
        await asUser("Admin");
      },
    );
    await t.test(
      "retirar todos se audita; las cargas archivadas no se pueden editar",
      async () => {
        const removed = await save([]);
        assert.deepEqual(removed.logistics_signals, []);
        assert.equal(removed.logistics_signals_by, people.Admin);
        const history = (
          await db.query(
            "select * from load_history where load='A' and after_data->'logistics_signals'='[]'::jsonb and before_data->'logistics_signals'<>'[]'::jsonb",
          )
        ).rows;
        assert.equal(history.length, 1);
        await rpc("ops_archive_load", ["A", (await get()).version, true]);
        await assert.rejects(save(["workshop"]), /no está disponible/);
        await rpc("ops_archive_load", ["A", (await get()).version, false]);
      },
    );
    await t.test(
      "reinstalar 013–014 y 004–014 conserva filas y protege las columnas",
      async () => {
        await save(["priority"]);
        await db.exec("reset role");
        const before = await get();
        for (const file of [
          "actualizar_senalamientos.sql",
          "actualizar_sitio.sql",
        ]) {
          await db.exec(
            await readFile(
              new URL("../../supabase/" + file, import.meta.url),
              "utf8",
            ),
          );
          assert.deepEqual(await get(), before);
        }
        await asUser("Admin");
        await assert.rejects(
          db.exec("update loads set logistics_signals='{}' where load='A'"),
          /permission denied/,
        );
        await save([]);
      },
    );
  } finally {
    await db.close();
  }
});
