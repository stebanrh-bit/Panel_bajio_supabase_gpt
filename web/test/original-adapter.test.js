import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { createOriginalApi, createRunner } from "../src/original/api/index.js";
import {
  loadModel,
  communicationSla,
  reservedModel,
} from "../src/original/api/models.js";
import { originalPage } from "../src/original/page.js";
import config from "../src/original/config.js";
import { createTestDatabase } from "./helpers/database.js";

const root = new URL("../../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("interfaz original: las 97 acciones de las tres páginas tienen un adaptador real", async () => {
  const expected = JSON.parse(await read("web/src/original/methods.json"));
  const api = createOriginalApi({});
  assert.equal(expected.length, 97);
  assert.deepEqual(Object.keys(api.methods).sort(), expected);
  for (const method of expected)
    assert.equal(typeof api.methods[method], "function");
});

test("sin sesión: los módulos limpian sus datos con el formato original y no consultan tablas", async () => {
  const api = createOriginalApi({
    from: () => {
      throw Error("No debe consultar datos");
    },
  });
  for (const method of [
    "getComments",
    "getIncidencias",
    "getPendientes",
    "getBitacoraTurno",
    "getAsignaciones",
    "getLoadSeguimientos",
  ])
    assert.deepEqual(JSON.parse(await api.methods[method]("A")), []);
  assert.deepEqual(await api.methods.getApartados(), { ok: true, items: [] });
  assert.deepEqual(await api.methods.getCierresTurnoRecibidos(), {
    ok: true,
    items: [],
  });
  assert.equal((await api.methods.getLoadsDelta()).loads.length, 0);
});

test("cadena original: handlers independientes, errores visibles y respuestas antiguas descartadas", async () => {
  let stamp = 0,
    release;
  const results = [],
    errors = [];
  const run = createRunner(
    {
      read: (value) => value,
      fail: () => {
        throw Error("Fallo real");
      },
      delayed: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
    () => stamp,
  );
  run.withSuccessHandler((value) => results.push(["A", value])).read("uno");
  run.withSuccessHandler((value) => results.push(["B", value])).read("dos");
  run.withFailureHandler((error) => errors.push(error.message)).fail();
  run.withFailureHandler((error) => errors.push(error.message)).missing();
  await setImmediate();
  assert.deepEqual(results, [
    ["A", "uno"],
    ["B", "dos"],
  ]);
  assert.deepEqual(errors, ["Fallo real", "Acción desconocida: missing"]);
  run.withSuccessHandler((value) => results.push(value)).delayed();
  await setImmediate();
  stamp += 1;
  release("dato privado anterior");
  await setImmediate();
  assert.equal(results.length, 2);
});

test("presentación: documentos booleanos, alertas originales y SLA desde el último cambio", () => {
  const row = loadModel(
    {
      status: "Cargando",
      pod_sent: "false",
      bol: "false",
      doda: "false",
      delivery_appt: "2026-10-08T10:00:00Z",
    },
    (value) => value,
    Date.parse("2026-10-08T12:00:00Z"),
  );
  assert.equal(row.stageIndex, 0);
  assert.equal(row.bol, false);
  assert.equal(
    loadModel({ status: "Cargando", next_review_at: "2000-01-01T00:00:00Z" })
      .needsAction,
    false,
    "gerencia conserva los criterios del original",
  );
  assert.equal(
    loadModel({ status: "Cargando", sobre_listo: "" }).sobre_listo,
    "",
    "sin información es diferente de pendiente",
  );
  assert.equal(row.alertMessage, "Retraso de 2h respecto al ETA original.");
  assert.deepEqual(
    communicationSla([
      {
        load: "A",
        event_type: "PENDIENTE",
        created_at: "2026-10-08T10:00:00Z",
      },
      {
        load: "A",
        event_type: "PENDIENTE",
        created_at: "2026-10-08T10:20:00Z",
      },
      {
        load: "A",
        event_type: "NOTIFICADO",
        created_at: "2026-10-08T10:30:00Z",
      },
    ]),
    [{ load: "A", minutes: 10, resolvedAt: "2026-10-08T10:30:00Z" }],
  );
  const reserved = reservedModel({ id: "R", review_hours: 3 }, (id) => id, [
    { event: "reviewed", actor: "Esteban", changed_at: "hoy", note: "Listo" },
  ]);
  assert.deepEqual(reserved.historial[0], {
    ts: "hoy",
    por: "Esteban",
    txt: "Revisó: Listo",
  });
});

test("HTML original: mismos elementos y estilos; scripts usan el adaptador sin alterar Google Maps", async () => {
  const template = await read("index.html");
  const styles = (await read("PanelEstilos.html"))
    .replace(/^\s*<style>/, "")
    .replace(/<\/style>\s*$/, "");
  const script = await read("web/src/original/panel-script.js");
  const page = originalPage({ template, styles, script, config });
  assert.doesNotMatch(page.body, /<script|<\?/);
  assert.doesNotMatch(page.scripts.join(""), /google\.script\.run/);
  assert.match(page.scripts.join(""), /window\.panelApi\.run/);
  assert.match(page.head, /Inter/);
  assert.equal(
    (
      page.body.match(
        /id="(?:workspace|comments|identity|incidencia|pendiente|bitacora|apartado|csr|confirmar)-backdrop"/g,
      ) || []
    ).length,
    9,
  );
  // La copia elimina espacios al final de las líneas, sin cambiar ninguna regla CSS.
  const normalizeStyles = (value) => value.replace(/[\t ]+$/gm, "").trim();
  assert.equal(
    normalizeStyles(await read("web/src/original/panel-styles.css")),
    normalizeStyles(styles),
  );
});

test("SQL 009: persistencia, bajas lógicas, radar, aislamiento y permisos", async (t) => {
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
  ];
  const { db, rpc, asUser, people } = await createTestDatabase(migrations, {
    admin: "admin",
    csr: "csr",
    other: "csr",
    manager: "manager",
    customer: "client",
  });
  try {
    await db.exec("insert into loads(load,customer) values('A','ACME')");
    await asUser("admin");
    await rpc("ops_set_portal_access", [people.customer, "ACME", true]);
    await t.test(
      "plantillas privadas y radar compartido conservan todos los campos del original",
      async () => {
        await asUser("csr");
        const initialMarks = (await rpc("ops_original_marks", [])).rows[0]
          .ops_original_marks;
        assert.equal(initialMarks.ok, true);
        await rpc("ops_save_original_templates", [
          { status: "Load {load}" },
          { status: "Aviso" },
        ]);
        assert.equal(
          (await db.query("select * from original_preferences")).rows[0]
            .templates.status,
          "Load {load}",
        );
        await asUser("other");
        assert.equal(
          (await db.query("select * from original_preferences")).rows.length,
          0,
        );
        await rpc("ops_original_places", [
          [
            {
              key: "laredo|tx",
              kind: "city",
              text: "Laredo, TX",
              lat: 27.5,
              lon: -99.5,
            },
            {
              key: "dir:planta",
              kind: "address",
              text: "Planta",
              formatted: "Dirección real",
              lat: 28,
              lon: -99,
            },
          ],
        ]);
        await rpc("ops_original_routes", [
          [
            {
              origen: "laredo|tx",
              destino: "dir:planta",
              millas: 42.3,
              horas: 1.5,
              recta: 20,
            },
          ],
        ]);
        await assert.rejects(
          rpc("ops_original_places", [
            [{ key: "bad|tx", kind: "city", text: "Bad", lat: 91, lon: 0 }],
          ]),
          /check constraint/,
        );
        await rpc("ops_original_radar", [
          "Archivo.xlsx",
          [
            {
              load: "EXTERNA",
              ciudad: "Laredo",
              estado: "TX",
              regresos: "YES",
              entrega: "2026-10-09",
            },
          ],
          true,
        ]);
        const radar = (await db.query("select * from original_radar")).rows[0];
        assert.equal(radar.records[0].regresos, "YES");
        assert.equal(radar.updated_by, people.other);
        assert.equal(
          (await rpc("ops_original_marks", [])).rows[0].ops_original_marks
            .marcas.loads,
          initialMarks.marcas.loads,
          "las marcas no cambian sin edición de la carga",
        );
        await rpc("ops_original_radar", ["", [], false]);
        assert.equal(
          (await db.query("select * from original_radar")).rows[0].visible,
          false,
        );
      },
    );
    await t.test(
      "categoría vacía no guarda; retirar incidencia la oculta al cliente y conserva el registro",
      async () => {
        await asUser("csr");
        await assert.rejects(
          db.query(
            "insert into incidents(load,category,severity,description) values($1,$2,$3,$4)",
            ["A", "\t ", "media", "Error"],
          ),
          /category/,
        );
        const incident = (
          await db.query(
            "insert into incidents(load,category,severity,description) values('A','Unidad','alta','Prueba') returning *",
          )
        ).rows[0];
        await rpc("ops_remove_incident", [incident.id]);
        assert.equal(
          (await db.query("select * from incidents")).rows[0].deleted_by,
          people.csr,
        );
        await asUser("customer");
        const detail = (await rpc("ops_portal_detail", ["A"])).rows[0]
          .ops_portal_detail;
        assert.equal(detail.incidents.length, 0);
        assert.equal(
          (await db.query("select * from original_routes")).rows.length,
          0,
        );
        await assert.rejects(
          rpc("ops_original_radar", ["Ataque", [], false]),
          /permiso/,
        );
      },
    );
    await t.test(
      "lectura de gerencia y anónimo no permite escrituras ni acceso a fallos de login",
      async () => {
        for (const user of ["manager", "customer", "anon"]) {
          await asUser(user);
          await assert.rejects(
            rpc("ops_save_original_templates", [{}, {}]),
            /permiso|permission denied/,
          );
          await assert.rejects(
            rpc("ops_original_google_route", ["x", 1, 1]),
            /permiso|permission denied/,
          );
          await assert.rejects(
            db.exec("select * from original_login_attempts"),
            /permission denied/,
          );
          await assert.rejects(
            rpc("ops_record_login_failure", ["p:admin"]),
            /permission denied/,
          );
        }
        await asUser("admin");
        await rpc("ops_original_google_route", [
          "laredo|tx>dir:planta",
          44.4,
          1.6,
        ]);
        assert.equal(
          Number(
            (await db.query("select * from original_routes")).rows[0]
              .google_miles,
          ),
          44.4,
        );
        await db.exec("reset role");
        await db.exec(
          await read("supabase/migrations/009_original_interface.sql"),
        );
        assert.equal(
          (await db.query("select * from original_routes")).rows.length,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
