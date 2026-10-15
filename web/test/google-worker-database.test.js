import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.js";

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
const token = "panel_maps_" + "test".repeat(16);

test("cola Google: permisos limitados, reservas, cuota, reintentos y prioridad manual", async (t) => {
  const { db, asUser, rpc } = await createTestDatabase(migrations, {
    admin: "admin",
    csr: "csr",
    manager: "manager",
    client: "client",
  });
  async function seed() {
    await db.exec("reset role; delete from original_routes");
    await db.query(
      "update original_google_worker_config set token_hash=encode(sha256(convert_to($1,'UTF8')),'hex'),enabled=true,paused_until=null",
      [token],
    );
    await asUser("csr");
    await rpc("ops_original_places", [
      JSON.stringify([
        { key: "a|tx", kind: "city", lat: 27, lon: -99 },
        { key: "b|tx", kind: "city", lat: 29, lon: -98 },
        { key: "c|tx", kind: "city", lat: 30, lon: -97 },
      ]),
    ]);
    await rpc("ops_original_routes", [
      JSON.stringify([
        { origen: "a|tx", destino: "b|tx", millas: 100, horas: 2 },
        { origen: "a|tx", destino: "c|tx", millas: 200, horas: 4 },
        { origen: "a|tx", destino: "sin|coordenadas", millas: 300, horas: 6 },
      ]),
    ]);
    await asUser("anon");
  }
  const claim = (limit = 20) => rpc("ops_google_worker_claim", [token, limit]);
  const complete = (job, outcome = "ok", miles = 111, hours = 2.5) =>
    rpc("ops_google_worker_complete", [
      token,
      job.route_key,
      job.claim_id,
      outcome,
      miles,
      hours,
    ]);
  const accepted = (result) => result.rows[0].ops_google_worker_complete;
  try {
    await t.test(
      "sin token no hay acceso; no expone configuración ni permite otras operaciones",
      async () => {
        await seed();
        await assert.rejects(
          rpc("ops_google_worker_claim", ["incorrecto", 20]),
          /no autorizado/,
        );
        await assert.rejects(
          db.query("select * from original_google_worker_config"),
          /permission denied/,
        );
        await assert.rejects(
          rpc("ops_require_google_worker", [token]),
          /permission denied/,
        );
        await assert.rejects(
          rpc("ops_original_google_route", ["a|tx>b|tx", 120, 3]),
          /permission denied/,
        );
        await assert.rejects(
          rpc("ops_google_worker_claim", [token, 21]),
          /Lote inválido/,
        );
        for (const role of ["csr", "manager", "client"]) {
          await asUser(role);
          await assert.rejects(
            rpc("ops_google_worker_claim", [token, 1]),
            /permission denied/,
          );
          await assert.rejects(
            db.query("select * from original_google_worker_config"),
            /permission denied/,
          );
        }
      },
    );
    await t.test(
      "reserva solo trayectos pendientes con coordenadas y no repite los ya reservados",
      async () => {
        await seed();
        await asUser("admin");
        await rpc("ops_original_google_route", ["a|tx>c|tx", 210, 4.5]);
        await asUser("anon");
        const jobs = (await claim()).rows;
        assert.equal(jobs.length, 1);
        assert.equal(jobs[0].route_key, "a|tx>b|tx");
        assert.equal(jobs[0].origin_lat, 27);
        assert.equal((await claim()).rows.length, 0);
        assert.equal(accepted(await complete(jobs[0])), true);
        assert.equal(accepted(await complete(jobs[0])), false);
        await asUser("csr");
        const result = (
          await db.query(
            "select * from original_routes where route_key='a|tx>b|tx'",
          )
        ).rows[0];
        assert.equal(Number(result.miles), 100);
        assert.equal(Number(result.google_miles), 111);
        assert.equal(result.google_state, "ok");
        assert.equal(result.google_by, null);
      },
    );
    await t.test(
      "una reserva vencida se recupera y su respuesta antigua no sobrescribe el nuevo trabajo",
      async () => {
        await seed();
        const old = (await claim(1)).rows[0];
        await db.exec(
          "reset role; update original_routes set google_lease_until=now()-interval '1 minute' where google_state='processing'",
        );
        await asUser("anon");
        const jobs = (await claim()).rows;
        const renewed = jobs.find((row) => row.route_key === old.route_key);
        assert.ok(renewed);
        assert.notEqual(renewed.claim_id, old.claim_id);
        assert.equal(accepted(await complete(old)), false);
        assert.equal(accepted(await complete(renewed)), true);
      },
    );
    await t.test(
      "cuota pausa toda la cola; un fallo transitorio programa reintento",
      async () => {
        await seed();
        const quota = (await claim(1)).rows[0];
        assert.equal(
          accepted(await complete(quota, "quota", null, null)),
          true,
        );
        assert.equal((await claim()).rows.length, 0);
        await db.exec(
          "reset role; update original_google_worker_config set paused_until=now()-interval '1 minute'",
        );
        await asUser("anon");
        const retry = (await claim(1)).rows[0];
        assert.notEqual(retry.route_key, quota.route_key);
        assert.equal(
          accepted(await complete(retry, "retry", null, null)),
          true,
        );
        assert.equal((await claim()).rows.length, 0);
        await db.exec("reset role");
        const rows = (
          await db.query(
            "select google_state,google_next_attempt_at>now() as delayed,google_miles from original_routes where google_last_error<>''",
          )
        ).rows;
        assert.equal(rows.length, 2);
        assert.ok(
          rows.every(
            (row) =>
              row.google_state === "retry" &&
              row.delayed &&
              row.google_miles === null,
          ),
        );
      },
    );
    await t.test(
      "sin ruta conserva OSM y no se repite indefinidamente; rechaza valores fuera de rango",
      async () => {
        await seed();
        const job = (await claim(1)).rows[0];
        await assert.rejects(complete(job, "ok", -1, 2), /Distancia inválida/);
        await assert.rejects(
          complete(job, "ok", null, 2),
          /Distancia inválida/,
        );
        await assert.rejects(
          complete(job, "ok", "NaN", 2),
          /Distancia inválida/,
        );
        assert.equal(
          accepted(await complete(job, "no_route", null, null)),
          true,
        );
        const next = (await claim()).rows;
        assert.ok(next.every((row) => row.route_key !== job.route_key));
        await asUser("csr");
        const row = (
          await db.query("select * from original_routes where route_key=$1", [
            job.route_key,
          ])
        ).rows[0];
        assert.equal(row.google_state, "no_route");
        assert.equal(row.google_miles, null);
        assert.ok(Number(row.miles) > 0);
      },
    );
    await t.test(
      "una corrección manual gana frente a un lote en curso y repetir SQL conserva resultados y vínculo",
      async () => {
        await seed();
        const job = (await claim(1)).rows[0];
        await asUser("admin");
        await rpc("ops_original_google_route", [job.route_key, 222, 4]);
        await asUser("anon");
        assert.equal(accepted(await complete(job, "ok", 111, 2)), false);
        await db.exec("reset role");
        await db.exec(
          await readFile(
            new URL(
              "../../supabase/migrations/010_google_miles_worker.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        const row = (
          await db.query("select * from original_routes where route_key=$1", [
            job.route_key,
          ])
        ).rows[0];
        assert.equal(Number(row.google_miles), 222);
        assert.equal(row.google_state, "ok");
        await asUser("anon");
        const status = (await rpc("ops_google_worker_status", [token])).rows[0]
          .ops_google_worker_status;
        assert.equal(status.completed, 1);
        assert.equal(JSON.stringify(status).includes(token), false);
        await db.exec(
          "reset role; update original_google_worker_config set enabled=false",
        );
        await asUser("anon");
        await assert.rejects(claim(), /no autorizado/);
      },
    );
  } finally {
    await db.close();
  }
});
