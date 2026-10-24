import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";
import {
  loadHistoryItems,
  presentHistoryChange,
} from "../src/original/history.js";
const files = (
  await readdir(new URL("../../supabase/migrations/", import.meta.url))
)
  // Contrato de compatibilidad hasta 015; la restricción personal 016 tiene su propia prueba.
  .filter((f) => /^\d.*sql$/.test(f) && !f.startsWith("016_"))
  .sort();

test("pendientes puntuales: persistencia, resolución, permisos y aislamiento de seguimientos", async (t) => {
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
  const save = async (active, note, version) =>
    (
      await rpc("ops_set_punctual_pending", [
        "A",
        version ?? (await get()).version,
        active,
        note,
      ])
    ).rows[0];
  let original, opened;
  try {
    await asUser("Admin");
    await db.exec(
      "insert into loads(load,customer,status,next_review_at,next_review_note,recordatorio_fecha) values('A','ACME','Descompuesta','2026-10-25T18:00:00Z','Revisión de mañana','2026-10-25T20:00:00Z')",
    );
    await rpc("ops_assign_customer",["ACME",people.Admin,null]);
    original = await get();
    await t.test(
      "no permite nota vacía ni escritura directa de banderas/autor",
      async () => {
        for (const note of ["", "  ", "\n\t\n", "ab", "x".repeat(1001)])
          await assert.rejects(save(true, note), /entre 3 y 1000/);
        await assert.rejects(save(null, "Taller"), /Selecciona/);
        for (const field of [
          "punctual_pending",
          "punctual_note",
          "punctual_opened_at",
          "punctual_opened_by",
          "punctual_resolved_at",
          "punctual_resolved_by",
        ]) {
          const value =
            field === "punctual_pending"
              ? "true"
              : field === "punctual_note"
                ? "'Nota'"
                : "null";
          await assert.rejects(
            db.exec(`update loads set ${field}=${value} where load='A'`),
            /permission denied/,
          );
        }
        assert.equal((await get()).punctual_pending, false);
      },
    );
    await t.test(
      "CSR puede destacar cualquier cliente, con actor y fecha comprobados",
      async () => {
        await asUser("Ana");
        opened = await save(
          true,
          "  Confirmar con el taller la hora de salida  ",
        );
        assert.equal(opened.punctual_pending, true);
        assert.equal(
          opened.punctual_note,
          "Confirmar con el taller la hora de salida",
        );
        assert.equal(opened.punctual_opened_by, people.Ana);
        assert.ok(opened.punctual_opened_at);
        await asUser("Luis");
        assert.equal((await get()).punctual_pending, true);
        const delta = (await rpc("ops_loads_delta", [0, [], "", null, 500]))
          .rows[0].ops_loads_delta;
        assert.equal(delta.items[0].punctual_note, opened.punctual_note);
        const unchanged = await save(true, opened.punctual_note);
        assert.equal(String(unchanged.updated_at), String(opened.updated_at));
      },
    );
    await t.test(
      "versiones viejas no sobrescriben; editar nota conserva la apertura",
      async () => {
        const before = await get();
        await db.exec("update loads set trailer='T0132' where load='A'");
        await assert.rejects(save(false, "", before.version), /cambió/);
        const edited = await save(true, "Confirmar refacción con taller");
        assert.equal(edited.punctual_opened_by, people.Ana);
        assert.equal(
          String(edited.punctual_opened_at),
          String(opened.punctual_opened_at),
        );
        assert.equal(edited.trailer, "T0132");
      },
    );
    await t.test(
      "solo Admin y CSR pueden escribir; clientes no reciben la nota",
      async () => {
        const version = (await get()).version;
        for (const role of ["Gerencia", "Cliente", "anon"]) {
          await asUser(role);
          await assert.rejects(
            rpc("ops_set_punctual_pending", [
              "A",
              version,
              true,
              "Cambiar nota",
            ]),
            /permiso|permission denied/,
          );
        }
        await asUser("Admin");
        await rpc("ops_set_portal_access", [people.Cliente, "ACME", true]);
        await asUser("Cliente");
        const portal = (await rpc("ops_portal_detail", ["A"])).rows[0]
          .ops_portal_detail;
        assert.equal(portal.load, "A");
        assert.ok(!Object.hasOwn(portal, "punctual_note"));
        assert.ok(!Object.hasOwn(portal, "punctual_pending"));
        const portalList = (await rpc("ops_portal_loads", [0, 100])).rows;
        assert.equal(portalList.length, 1);
        assert.ok(!Object.hasOwn(portalList[0], "punctual_note"));
        assert.equal((await db.query("select load from loads")).rows.length, 0);
        await asUser("Admin");
      },
    );
    await t.test(
      "resolver conserva nota e historial sin alterar tareas, citas ni estatus",
      async () => {
        const resolved = await save(false, "");
        assert.equal(resolved.punctual_pending, false);
        assert.equal(resolved.punctual_note, "Confirmar refacción con taller");
        assert.equal(resolved.punctual_resolved_by, people.Admin);
        assert.ok(resolved.punctual_resolved_at);
        for (const key of [
          "status",
          "next_review_at",
          "next_review_note",
          "recordatorio_fecha",
          "client_notify_pending",
          "client_notify_reason",
          "client_notify_since",
        ])
          assert.deepEqual(resolved[key], original[key], key);
        assert.equal(
          (await db.query("select count(*)::int as n from shift_tasks")).rows[0]
            .n,
          0,
        );
        const history = (
          await db.query(
            "select * from load_history where load='A' order by id",
          )
        ).rows;
        const items = loadHistoryItems(
          history,
          "A",
          (id) =>
            Object.entries(people).find(([, uuid]) => uuid === id)?.[0] || id,
        );
        const change = items.find(
          (i) => i.campo === "punctual_pending" && i.valor_nuevo === false,
        );
        assert.deepEqual(presentHistoryChange(change, String), {
          label: "Pendiente puntual",
          before: "Pendiente puntual activo",
          after: "Sin pendiente puntual",
        });
        assert.ok(
          items.some(
            (i) =>
              i.campo === "punctual_resolved_by" && i.valor_nuevo === "Admin",
          ),
        );
      },
    );
    await t.test(
      "reabrir crea una nueva apertura y las entregadas también admiten pendientes",
      async () => {
        await db.exec("update loads set status='DELIVERED' where load='A'");
        await asUser("Luis");
        const reopened = await save(true, "Falta respuesta del taller");
        assert.equal(reopened.punctual_opened_by, people.Luis);
        assert.equal(reopened.punctual_resolved_at, null);
        assert.equal(reopened.punctual_resolved_by, null);
        assert.equal(reopened.status, "DELIVERED");
        await asUser("Admin");
        await rpc("ops_archive_load", ["A", (await get()).version, true]);
        await assert.rejects(save(false, ""), /no está disponible/);
        await rpc("ops_archive_load", ["A", (await get()).version, false]);
      },
    );
    await t.test(
      "reinstalar el SQL conjunto conserva datos y vuelve a cerrar permisos por columna",
      async () => {
        await db.exec("reset role");
        const before = await get();
        await db.exec(
          await readFile(
            new URL("../../supabase/actualizar_sitio.sql", import.meta.url),
            "utf8",
          ),
        );
        const after = await get();
        assert.deepEqual(after, before);
        await asUser("Admin");
        await assert.rejects(
          db.exec("update loads set punctual_pending=false where load='A'"),
          /permission denied/,
        );
        await save(false, "");
      },
    );
  } finally {
    await db.close();
  }
});
