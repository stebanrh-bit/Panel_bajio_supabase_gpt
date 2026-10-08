import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";

test("importación, archivo y publicación: transacciones y permisos reales de PostgreSQL", async (context) => {
  const migrations = [
    "001_panel.sql",
    "002_load_operations.sql",
    "003_pending_loads.sql",
    "004_reserved_loads.sql",
    "005_team_and_shifts.sql",
    "006_import_archive_and_messages.sql",
  ];
  const { db, people, asUser, rpc } = await createTestDatabase(migrations, {
    admin: "admin",
    csr: "csr",
    client: "client",
    manager: "manager",
  });
  const load = async (id) =>
    (await db.query("select * from loads where load=$1", [id])).rows[0];
  const preview = async (records) =>
    (await rpc("ops_preview_import", [JSON.stringify(records)])).rows[0]
      .ops_preview_import;
  const apply = async (records) =>
    (
      await rpc("ops_apply_import", [
        JSON.stringify(records),
        JSON.stringify(await preview(records)),
        "prueba.csv",
      ])
    ).rows[0];
  let batch;
  try {
    await context.test(
      "vista previa sin escritura y campos manuales conservados",
      async () => {
        await asUser("admin");
        await db.exec(
          "insert into loads(load,customer,status,pod_sent,bol,tracking_link) values('I-1','Antes','DELIVERED','true','true','https://example.com')",
        );
        const records = [
          {
            load: "I-1",
            customer: "Después",
            status: "Cargando",
            pod_sent: "false",
            bol: "false",
            tracking_link: "",
            truck: "100",
            archived: true,
          },
          { load: "I-2", customer: "ACME", status: "TONU" },
        ];
        const result = await preview(records);
        assert.equal(result[0].new, false);
        assert.equal(result[1].new, true);
        assert.equal((await load("I-1")).customer, "Antes");
        assert.equal(await load("I-2"), undefined);
        batch = await apply(records);
        const existing = await load("I-1");
        assert.equal(existing.customer, "Después");
        assert.equal(existing.status, "DELIVERED");
        assert.equal(existing.pod_sent, "true");
        assert.equal(existing.bol, "true");
        assert.equal(existing.tracking_link, "https://example.com");
        assert.equal(existing.archived, false);
        assert.equal(existing.truck_source, "IMPORT");
        assert.equal((await load("I-2")).status, "Cargando");
        await assert.rejects(
          preview([{ load: "D" }, { load: " D " }]),
          /duplicados/,
        );
        await assert.rejects(
          db.exec("update loads set archived=true where load='I-1'"),
          /permission denied/,
        );
        await assert.rejects(
          db.exec("insert into loads(load,archived) values('FORGED',true)"),
          /permission denied/,
        );
      },
    );
    await context.test(
      "deshacer recupera existentes y archiva nuevas sin borrar expedientes",
      async () => {
        await rpc("ops_undo_import", [batch.id]);
        const previous = await load("I-1");
        assert.equal(previous.customer, "Antes");
        assert.equal(previous.truck, "");
        assert.equal((await load("I-2")).archived, true);
        assert.equal(
          (
            await db.query("select state from import_batches where id=$1", [
              batch.id,
            ])
          ).rows[0].state,
          "undone",
        );
        assert.ok(
          (await db.query("select * from load_history where load='I-2'")).rows
            .length > 0,
        );
        await assert.rejects(rpc("ops_undo_import", [batch.id]), /deshecha/);
      },
    );
    await context.test(
      "una versión vieja o actividad posterior revierte toda la operación",
      async () => {
        const records = [{ load: "I-1", customer: "Nuevo" }, { load: "I-3" }];
        const oldPreview = await preview(records);
        await db.exec(
          "update loads set eta_note='Cambio manual' where load='I-1'",
        );
        await assert.rejects(
          rpc("ops_apply_import", [
            JSON.stringify(records),
            JSON.stringify(oldPreview),
            "prueba.csv",
          ]),
          /cambió/,
        );
        assert.equal(await load("I-3"), undefined);
        assert.equal((await load("I-1")).customer, "Antes");
        const created = await apply([{ load: "I-3" }]);
        await db.exec(
          "insert into comments(load,body) values('I-3','No borrar actividad')",
        );
        await assert.rejects(
          rpc("ops_undo_import", [created.id]),
          /actividad posterior/,
        );
        assert.equal((await load("I-3")).archived, false);
      },
    );
    await context.test(
      "archivo reversible, cambios masivos y mensajes públicos separados",
      async () => {
        let record = await load("I-1");
        await rpc("ops_archive_load", [record.load, record.updated_at, true]);
        assert.equal((await load("I-1")).archived_by, people.admin);
        await assert.rejects(
          rpc("ops_archive_load", [record.load, record.updated_at, false]),
          /cambió/,
        );
        record = await load("I-1");
        await rpc("ops_archive_load", [record.load, record.updated_at, false]);
        record = await load("I-1");
        await rpc("confirm_client_notice", [
          record.load,
          record.updated_at,
          "Correo",
          "Aviso enviado",
        ]);
        assert.equal((await load("I-1")).last_communication_channel, "Correo");
        record = await load("I-1");
        await rpc("review_load", [record.load, record.updated_at]);
        const items = [await load("I-1"), await load("I-3")].map((row) => ({
          load: row.load,
          updated_at: row.updated_at,
        }));
        await db.exec(
          "update loads set eta_note='Otra versión' where load='I-3'",
        );
        await assert.rejects(
          rpc("ops_bulk_loads", [JSON.stringify(items), '{"color":"warn"}']),
          /cambió/,
        );
        assert.equal((await load("I-1")).color, "");
        await assert.rejects(
          rpc("ops_bulk_loads", [null, '{"color":"warn"}']),
          /Selecciona/,
        );
        await rpc("ops_set_portal_access", [people.client, "ACME", true]);
        const current = await load("I-3");
        await db.exec("update loads set customer='ACME' where load='I-3'");
        await assert.rejects(
          rpc("ops_publish_portal_message", [
            "I-3",
            current.updated_at,
            "Mensaje",
          ]),
          /cambió/,
        );
        await asUser("csr");
        const fresh = await load("I-3");
        await rpc("ops_publish_portal_message", [
          "I-3",
          fresh.updated_at,
          "Unidad en camino",
        ]);
        await asUser("client");
        const result = (await rpc("ops_portal_detail", ["I-3"])).rows[0]
          .ops_portal_detail;
        assert.equal(result.messages[0].message, "Unidad en camino");
        assert.equal(Object.hasOwn(result.messages[0], "reason"), false);
      },
    );
    await context.test(
      "roles y funciones privadas protegidos; migración repetible",
      async () => {
        await asUser("csr");
        await assert.rejects(preview([{ load: "X" }]), /permiso/);
        await assert.rejects(
          rpc("ops_write_load_snapshot", ['{"load":"X"}', true]),
          /permission denied/,
        );
        await asUser("manager");
        await assert.rejects(rpc("ops_archive_finished", []), /permiso/);
        await asUser("anon");
        await assert.rejects(
          rpc("ops_publish_portal_message", ["X", null, "Texto"]),
          /permission denied/,
        );
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL(
              "../../supabase/migrations/006_import_archive_and_messages.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal((await load("I-3")).archived, false);
      },
    );
  } finally {
    await db.close();
  }
});
