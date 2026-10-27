import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";
const directory = new URL("../../supabase/migrations/", import.meta.url);
const files = (await readdir(directory))
  .filter((n) => /^\d.*\.sql$/.test(n))
  .sort();
test("SQL 020: operación personal, importación, documentos, mensajes y avisos privados", async (t) => {
  const { db, asUser, rpc, people } = await createTestDatabase(files, {
    Esteban: "admin",
    Ana: "csr",
    Cliente: "client",
  });
  const value = async (name, args = []) => {
    const row = (await rpc(name, args)).rows[0];
    return row?.[name] ?? row;
  };
  const load = async (id) =>
    (
      await db.query(
        "select *,updated_at::text as version from loads where load=$1",
        [id],
      )
    ).rows[0];
  try {
    await asUser("Esteban");
    await db.exec(
      "insert into loads(load,customer,origin_city,origin_state,dest_city,dest_state) values ('A','ACME','Monterrey','NL','Laredo','TX')",
    );
    await asUser("Ana");
    await db.exec("insert into loads(load,customer) values ('B','OTRO')");
    await asUser("Esteban");
    await t.test(
      "instalación repetible y contexto inicial en origen",
      async () => {
        await value("ops_save_route_instruction", [
          null,
          null,
          {
            name: "Instrucción prueba",
            customer: "ACME",
            origin_city: "Monterrey",
            origin_state: "NL",
            dest_city: "Laredo",
            dest_state: "TX",
            flow: "export",
            state: "approved",
            steps: {
              origin: { action: "Confirmar carga en planta", requires: [] },
              destination: { action: "Entregar POD", requires: [] },
            },
          },
          true,
        ]);
        const a = await load("A");
        assert.equal(a.status, "PTE. ARRIVO");
        assert.equal(a.instruction_context.stage, "origin");
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL("020_personal_consolidation.sql", directory),
            "utf8",
          ),
        );
        await asUser("Esteban");
        assert.equal((await value("ops_site_status")).schema, 20);
      },
    );
    await t.test(
      "protección manual, reemplazo explícito, archivo real y cronología",
      async () => {
        await db.exec(
          "update loads set truck='MANUAL-1',trailer='TR-1' where load='A'",
        );
        assert.equal((await load("A")).truck_source, "MANUAL");
        const input = [
          { load: "A", customer: "ACME", truck: "VG-1", trailer: "VG-2" },
        ];
        let preview = await value("ops_preview_import", [input]);
        assert.equal(preview[0].protected.length, 2);
        assert.ok(!preview[0].changes.includes("truck"));
        await value("ops_apply_import", [input, preview, "archivo-real.xlsx"]);
        assert.equal((await load("A")).truck, "MANUAL-1");
        const explicit = [{ ...input[0], _replace_manual: ["truck"] }];
        preview = await value("ops_preview_import", [explicit]);
        await value("ops_apply_import", [
          explicit,
          preview,
          "archivo-elegido.xlsx",
        ]);
        assert.equal((await load("A")).truck, "VG-1");
        assert.equal((await load("A")).trailer, "TR-1");
        const info = await value("ops_original_import_info");
        assert.equal(info.fileName, "archivo-elegido.xlsx");
        assert.equal(info.author, "Esteban");
        const invalid = [
          {
            load: "A",
            pickup_appt: "2026-10-29T12:00Z",
            delivery_appt: "2026-10-28T12:00Z",
          },
        ];
        preview = await value("ops_preview_import", [invalid]);
        assert.match(preview[0].validation_error, /anterior/);
        await assert.rejects(
          value("ops_apply_import", [invalid, preview, "incorrecto.csv"]),
          /anterior/,
        );
        await assert.rejects(
          db.exec(
            "update loads set pickup_appt='2026-10-29T12:00Z',delivery_appt='2026-10-28T12:00Z' where load='A'",
          ),
          /anterior/,
        );
      },
    );
    await t.test(
      "preferencias se mezclan y estado de avisos solo pertenece a la sesión",
      async () => {
        await value("ops_save_personal_ui", [
          { calendar_view: "list", calendar_client: "acme" },
        ]);
        await value("ops_save_personal_ui", [{ calendar_hide_empty: false }]);
        const prefs = (
          await db.query(
            "select personal_ui from original_preferences where user_id=$1",
            [people.Esteban],
          )
        ).rows[0].personal_ui;
        assert.equal(prefs.calendar_view, "list");
        assert.equal(prefs.calendar_client, "acme");
        const state = await value("ops_notice_state", [
          [
            { key: "A:followup", action: "read" },
            { key: "A:followup", action: "snooze" },
          ],
        ]);
        assert.ok(state[0].read_at);
        assert.ok(state[0].snoozed_until);
        await asUser("Ana");
        assert.deepEqual(await value("ops_notice_state"), []);
        assert.equal(
          (await db.query("select * from personal_notice_state")).rows.length,
          0,
        );
        await asUser("Esteban");
      },
    );
    let document;
    await t.test(
      "documentos HTTPS, concurrencia, retiro y RLS por carga",
      async () => {
        document = await value("ops_save_document_link", [
          "A",
          null,
          null,
          "pod",
          "POD firmado",
          "https://example.org/pod.pdf",
        ]);
        assert.equal(document.load, "A");
        await assert.rejects(
          value("ops_save_document_link", [
            "A",
            document.id,
            "2020-01-01T00:00Z",
            "pod",
            "Otro",
            "https://example.org/otro",
          ]),
          /cambió/,
        );
        await assert.rejects(
          value("ops_save_document_link", [
            "A",
            null,
            null,
            "pod",
            "Inseguro",
            "javascript:alert(1)",
          ]),
          /HTTPS/,
        );
        await asUser("Ana");
        assert.equal(
          (await db.query("select * from load_document_links")).rows.length,
          0,
        );
        await assert.rejects(
          value("ops_save_document_link", [
            "A",
            null,
            null,
            "pod",
            "Ajeno",
            "https://example.org/ajeno",
          ]),
          /disponible/,
        );
        await asUser("Esteban");
        await value("ops_remove_document_link", [
          document.id,
          document.updated_at,
        ]);
        assert.ok(
          (
            await db.query(
              "select deleted_at from load_document_links where id=$1",
              [document.id],
            )
          ).rows[0].deleted_at,
        );
      },
    );
    await t.test(
      "texto final privado opcional y versión obligatoria",
      async () => {
        let a = await load("A");
        await value("ops_record_manual_notice", [
          "A",
          a.version,
          "WhatsApp",
          "General",
          "Mensaje final revisado",
        ]);
        let rows = (
          await db.query(
            "select * from communications where load='A' and event_type='NOTIFICADO' order by created_at desc",
          )
        ).rows;
        assert.equal(rows[0].manual_message, "Mensaje final revisado");
        assert.equal(rows[0].public_message, "");
        a = await load("A");
        await value("ops_record_manual_notice", [
          "A",
          a.version,
          "WhatsApp",
          "General",
          null,
        ]);
        rows = (
          await db.query(
            "select * from communications where load='A' and event_type='NOTIFICADO' order by created_at desc",
          )
        ).rows;
        assert.equal(rows[0].manual_message, "");
        await asUser("Ana");
        await assert.rejects(
          value("ops_record_manual_notice", [
            "A",
            a.version,
            "WhatsApp",
            "General",
            "Ajeno",
          ]),
          /cambió|permisos|disponible|pertenece|guardar/,
        );
        assert.equal(
          (await db.query("select * from communications where load='A'")).rows
            .length,
          0,
        );
        await asUser("Cliente");
        await assert.rejects(
          value("ops_site_status"),
          /acceso|Acceso|sesión|Sesión|uso interno/,
        );
        await asUser("Esteban");
      },
    );
    await t.test(
      "worker autenticado, tablero sin secreto y respaldo ampliado",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update original_google_worker_config set token_hash=encode(sha256(convert_to($1,'UTF8')),'hex'),enabled=true",
          ["secreto-prueba-020".repeat(4)],
        );
        await asUser("anon");
        await assert.rejects(
          value("ops_google_worker_report", ["incorrecto", { status: "ok" }]),
          /autorizado/,
        );
        await value("ops_google_worker_report", [
          "secreto-prueba-020".repeat(4),
          { status: "ok", claimed: 0, completed: 0 },
        ]);
        await asUser("Esteban");
        const dashboard = await value("ops_miles_dashboard");
        assert.equal(dashboard.batch_limit, 20);
        assert.equal(dashboard.status, "ok");
        assert.doesNotMatch(JSON.stringify(dashboard), /token|secreto/);
        await db.exec("reset role");
        const tables = await value("ops_backup_tables");
        assert.ok(tables.includes("load_document_links"));
        assert.ok(tables.includes("personal_notice_state"));
      },
    );
  } finally {
    await db.close();
  }
});
