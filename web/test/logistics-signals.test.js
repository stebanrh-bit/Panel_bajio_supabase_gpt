import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  logisticsSignals,
  validateLogisticsSignals,
  signalStrip,
  signalsSummary,
} from "../src/original/logistics-signals.js";
import {
  loadHistoryItems,
  presentHistoryChange,
} from "../src/original/history.js";

test("señalamientos: catálogo cerrado, máximo tres distintos y orden canónico sin mutar el borrador", () => {
  const original = ["workshop", "delay"];
  assert.deepEqual(validateLogisticsSignals(original), ["delay", "workshop"]);
  assert.deepEqual(original, ["workshop", "delay"]);
  assert.deepEqual(validateLogisticsSignals([]), []);
  for (const invalid of [
    null,
    {},
    "workshop",
    ["unknown"],
    [null],
    ["delay", "delay"],
    ["urgent", "delay", "workshop", "priority"],
  ])
    assert.throws(() => validateLogisticsSignals(invalid), /3 señalamientos/);
  assert.equal(new Set(logisticsSignals.map((signal) => signal.id)).size, 8);
});
test("señalamientos: SVG locales, nombres accesibles y atributos escapados", () => {
  const window = new Window();
  const load = 'T0132" onclick="alert(1)';
  window.document.body.innerHTML = signalStrip(load, ["workshop", "delay"]);
  const button = window.document.querySelector("button");
  assert.equal(button.dataset.loadSignals, load);
  assert.equal(button.getAttribute("onclick"), null);
  assert.match(button.getAttribute("aria-label"), /En taller/);
  assert.match(button.getAttribute("aria-label"), /Retraso/);
  assert.equal(window.document.querySelectorAll("svg").length, 2);
  for (const signal of logisticsSignals) {
    window.document.body.innerHTML = signal.icon;
    assert.equal(
      window.document.querySelectorAll("script,image,use,foreignObject").length,
      0,
    );
    assert.equal(
      window.document.querySelector("svg").getAttribute("aria-hidden"),
      "true",
    );
  }
});
test("historial: muestra nombres de señalamientos, retiro y autor sin nombres técnicos", () => {
  const items = loadHistoryItems(
    [
      {
        id: 1,
        actor: "ana",
        before_data: { logistics_signals: ["workshop"] },
        after_data: { logistics_signals: ["delay", "workshop"] },
      },
    ],
    "A",
  );
  assert.deepEqual(presentHistoryChange(items[0], String), {
    label: "Señalamientos de la carga",
    before: "En taller",
    after: "En taller, Retraso",
  });
  assert.equal(signalsSummary([]), "Sin señalamientos");
});

test("adaptador: conserva guardados propios y rechaza un cambio remoto de señalamientos con borrador abierto", async () => {
  const { operationMethods } = await import(
    "../src/original/api/operations.js"
  );
  let current = {
      load: "A",
      updated_at: "2026-10-22T18:01:00Z",
      logistics_signals: [],
      trailer: "T0132",
    },
    calls = 0;
  const methods = operationMethods({
    client: {},
    staff() {},
    serial: async (_key, run) => run(),
    previous: () => current,
    saved: (_table, record) => (current = record),
    personName: (id) => id,
    rpc: async (_name, args) => {
      calls++;
      // El formulario de la UI pudo abrirse con un updated_at viejo después de editar trailer.
      assert.equal(args.p_version, current.updated_at);
      return {
        ...current,
        logistics_signals: args.p_signals,
        updated_at: "2026-10-22T18:02:00Z",
      };
    },
  });
  const saved = await methods.setSenalamientosCarga("A", ["workshop"], []);
  assert.deepEqual(saved.logistics_signals, ["workshop"]);
  assert.equal(saved.trailer, "T0132");
  current = {
    ...current,
    logistics_signals: ["delay"],
    updated_at: "2026-10-22T18:03:00Z",
  };
  await assert.rejects(
    methods.setSenalamientosCarga("A", ["priority"], ["workshop"]),
    /señalamientos cambiaron/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(current.logistics_signals, ["delay"]);
});
