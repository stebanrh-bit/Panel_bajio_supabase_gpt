import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stateCountry,
  routeDirection,
  canonicalCustomer,
  chronologicalDates,
  nextAction,
} from "../src/original/personal/domain.js";
import { groupNotices } from "../src/original/personal/notices.js";
import { operationCsv } from "../src/original/personal/export.js";
import { stageIndex } from "../src/load-rules.js";
import { customerNoticeScope } from "../src/original/notice-scope.js";
test("países y sentido real de la ruta, sin inferir por puntuación", () => {
  for (const state of [
    "NL",
    "N.L.",
    "Nuevo León",
    "SLP",
    "S.L.P.",
    "Estado de México",
    "Tamps.",
  ])
    assert.equal(stateCountry(state), "MX", state);
  for (const state of ["TX", "MI", "CA", "New York", "Texas"])
    assert.equal(stateCountry(state), "US", state);
  assert.equal(stateCountry("desconocido"), "");
  assert.equal(
    routeDirection({
      origin_state: "NL",
      dest_state: "TX",
      dest_city: "Laredo",
    }).code,
    "NB",
  );
  assert.equal(
    routeDirection({ origin_state: "MI", dest_state: "SLP" }).code,
    "SB",
  );
  assert.equal(
    routeDirection({
      origin_state: "MI",
      dest_state: "TX",
      dest_city: "Laredo",
    }).code,
    "SB",
  );
  assert.deepEqual(
    routeDirection({
      origin_state: "TAM",
      origin_city: "Nuevo Laredo",
      dest_state: "MI",
      dest_city: "Coldwater",
    }),
    { code: "NB", transload: true },
  );
});
test("PTE. ARRIVO inicial, avanzado y aliases conservan alcance personal", () => {
  assert.equal(stageIndex({ status: "PTE. ARRIVO" }), 0);
  assert.equal(
    stageIndex({ status: "PTE. ARRIVO", pickup_actual: "2026-10-27T12:00Z" }),
    1,
  );
  const aliases = [{ alias: "ACME antiguo", canonical_name: "ACME" }];
  assert.equal(canonicalCustomer("ACME antiguo", aliases), "ACME");
  const scope = customerNoticeScope(
    "Esteban",
    [{ csr: "Esteban", cliente: "ACME", aliases: ["ACME antiguo"] }],
    [
      { load: "A", customer: "ACME antiguo" },
      { load: "B", customer: "OTRO" },
    ],
  );
  assert.equal(scope.hasLoad("A"), true);
  assert.equal(scope.hasLoad("B"), false);
});
test("acción concreta, avisos agrupados y exportación segura", () => {
  assert.equal(
    nextAction({
      row: { punctual_pending: true, punctual_note: "Llamar al taller" },
      reminders: [],
    }),
    "Llamar al taller",
  );
  const groups = groupNotices([
    {
      id: "one",
      load: "A",
      sev: "warn",
      nuevo: false,
      detalle: "Primer motivo",
    },
    {
      id: "two",
      load: "A",
      sev: "critical",
      nuevo: true,
      detalle: "Segundo motivo",
    },
    { id: "three", load: "B", sev: "info" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, "two");
  assert.equal(groups[0].nuevo, true);
  assert.deepEqual(new Set(groups[0].memberIds), new Set(["one", "two"]));
  const csv = operationCsv([
    {
      load: "=1+1",
      customer: "ACME",
      status: "PTE. ARRIVO",
      latest_comment: "Prueba, con coma",
    },
  ]);
  assert.match(csv, /Comentarios/);
  assert.match(csv, /'=1\+1/);
  assert.match(csv, /"Prueba, con coma"/);
  assert.doesNotMatch(csv, /CSR|Salida planta/);
  assert.throws(
    () =>
      chronologicalDates({
        pickup_appt: "2026-10-28T12:00Z",
        delivery_appt: "2026-10-27T12:00Z",
      }),
    /anterior/,
  );
});
