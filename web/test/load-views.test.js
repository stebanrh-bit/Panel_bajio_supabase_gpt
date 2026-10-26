import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig,
  emptyRules,
  initialConfig,
  validateConfig,
  matchesView,
  mexicoDay,
} from "../src/original/load-views/rules.js";
const now = new Date("2026-10-26T18:00:00Z");
const row = {
  load: "0001",
  customer: "ACME",
  status: "PTE. ARRIVO",
  pickup_appt: "2026-10-27T15:00:00Z",
  pod_sent: "false",
  recargos_vg: "false",
  punctual_pending: false,
  needs_attention: false,
};

test("Mostrar: Activas conserva su regla original; puede incluir futuras y Programadas las separa", () => {
  const config = defaultConfig(),
    active = config.items.find((v) => v.id === "active").rules;
  assert.equal(matchesView(row, active, now), false);
  assert.equal(matchesView({ ...row, pickup_appt: "" }, active, now), true);
  assert.equal(
    matchesView({ ...row, pickup_appt: "2026-10-26T23:00:00Z" }, active, now),
    true,
  );
  assert.equal(matchesView(row, { ...active, pickup: "any" }, now), true);
  assert.equal(matchesView(row, { ...active, pickup: "future" }, now), true);
  for (const closed of [
    { status: "DELIVERED", pod_sent: "true" },
    { status: "TONU", recargos_vg: "true" },
    { status: "Cancelado." },
  ])
    assert.equal(
      matchesView({ ...row, ...closed }, { ...active, pickup: "any" }, now),
      false,
    );
  assert.equal(
    matchesView(
      { ...row, status: "DELIVERED", pod_sent: "false" },
      { ...active, pickup: "any" },
      now,
    ),
    true,
  );
  assert.equal(
    matchesView({ ...row, archived: true }, emptyRules(), now),
    false,
  );
});
test("Mostrar: periodos inclusivos y zona de México, incluso si el navegador está en otro día", () => {
  assert.equal(mexicoDay("2026-10-27T02:00:00Z"), "2026-10-26");
  assert.equal(mexicoDay("2026-10-26"), "2026-10-26");
  assert.equal(mexicoDay("2026-02-30"), "");
  const rule = {
    ...emptyRules(),
    dateField: "cruce_usa_fecha",
    period: "next7",
  };
  assert.equal(
    matchesView({ ...row, cruce_usa_fecha: "2026-11-01T18:00:00Z" }, rule, now),
    true,
  );
  assert.equal(
    matchesView({ ...row, cruce_usa_fecha: "2026-11-02T18:00:00Z" }, rule, now),
    false,
  );
  assert.equal(matchesView({ ...row, cruce_usa_fecha: "" }, rule, now), false);
  const custom = {
    ...rule,
    period: "custom",
    start: "2026-10-26",
    end: "2026-10-27",
  };
  assert.equal(
    matchesView(
      { ...row, cruce_usa_fecha: "2026-10-28T02:00:00Z" },
      custom,
      now,
    ),
    true,
  );
  assert.equal(
    matchesView(
      { ...row, cruce_usa_fecha: "2026-10-28T18:00:00Z" },
      custom,
      now,
    ),
    false,
  );
});
test("Mostrar: combina clientes/estatus con pendientes, POD y búsqueda sin confundir false con sí", () => {
  const rule = {
    ...emptyRules(),
    clients: [" acme "],
    statuses: ["pte. arrivo"],
    pod: "no",
    punctual: "yes",
    attention: "yes",
    notice: "yes",
    search: "tránsito",
  };
  const eligible = {
    ...row,
    punctual_pending: true,
    needs_attention: "true",
    client_notify_pending: true,
  };
  assert.equal(
    matchesView(eligible, rule, now, "Confirmar transito en México"),
    true,
  );
  for (const change of [
    { customer: "OTRO" },
    { status: "En AA" },
    { pod_sent: "true" },
    { punctual_pending: "false" },
    { needs_attention: false },
    { client_notify_pending: false },
  ])
    assert.equal(
      matchesView({ ...eligible, ...change }, rule, now, "tránsito"),
      false,
    );
});
test("Mostrar: valida nombres, fechas, menú visible y copias independientes; importa vistas anteriores", () => {
  const config = defaultConfig(),
    snapshot = structuredClone(config);
  validateConfig(config);
  assert.deepEqual(config, snapshot);
  for (const alter of [
    (c) => (c.items[1].name = "Todas"),
    (c) => (c.items[0].visible = false),
    (c) => (c.defaultId = "inexistente"),
    (c) => (c.items[1].rules.period = "javascript:alert(1)"),
    (c) =>
      Object.assign(c.items[1].rules, {
        period: "custom",
        start: "2026-10-28",
        end: "2026-10-26",
      }),
  ]) {
    const invalid = structuredClone(config);
    alter(invalid);
    assert.throws(() => validateConfig(invalid));
  }
  const legacy = [
    {
      nombre: "ACME futuras",
      filtro: "active",
      cliente: "acme",
      busqueda: "T0132",
      vista: "table",
      orden: { col: "trailer", dir: -1 },
    },
  ];
  const imported = initialConfig({}, legacy);
  assert.equal(imported.items.length, 9);
  assert.equal(imported.items[8].rules.pickup, "through_today");
  assert.deepEqual(imported.items[8].rules.clients, ["acme"]);
  assert.equal(imported.items[8].rules.search, "T0132");
  assert.deepEqual(imported.items[8].sort, { col: "trailer", dir: -1 });
  assert.deepEqual(initialConfig(imported, legacy), imported);
});
