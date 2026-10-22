import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orderedRecords,
  moveVisible,
  readOrder,
  saveOrder,
} from "../src/original/load-order.js";

test("orden manual: mover arriba/abajo conserva los lugares de cargas filtradas y los números reales", () => {
  const original = ["0001", "OCULTA", "2", "3"];
  assert.deepEqual(moveVisible(original, ["0001", "2", "3"], "3", "0001"), [
    "3",
    "OCULTA",
    "0001",
    "2",
  ]);
  assert.deepEqual(
    moveVisible(original, ["0001", "2", "3"], "0001", "3", true),
    ["2", "OCULTA", "3", "0001"],
  );
  assert.deepEqual(original, ["0001", "OCULTA", "2", "3"]);
  for (const [source, target] of [
    ["0001", "OCULTA"],
    ["AUSENTE", "2"],
    ["2", "2"],
  ])
    assert.deepEqual(
      moveVisible(original, ["0001", "2", "3"], source, target),
      original,
    );
});

test("orden manual: una carga nueva va al final; una eliminada no reaparece; no cambia los registros", () => {
  const records = [
    { load: "2", status: "EN PLANTA" },
    { load: "3" },
    { load: "0001" },
    { load: "NUEVA" },
  ];
  const snapshot = structuredClone(records);
  const sorted = orderedRecords(records, ["0001", "ELIMINADA", "3", "3", "2"]);
  assert.deepEqual(
    sorted.map((row) => row.load),
    ["0001", "3", "2", "NUEVA"],
  );
  assert.strictEqual(sorted[0], records[2]);
  assert.deepEqual(records, snapshot);
});

test("preferencias: guardado por usuario, datos dañados y almacenamiento bloqueado", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(
    saveOrder(storage, "cuenta-a", ["3", "0001", "3", null, 2]),
    true,
  );
  assert.deepEqual(readOrder(storage, "cuenta-a"), ["3", "0001"]);
  assert.deepEqual(readOrder(storage, "cuenta-b"), []);
  values.set("bajio_orden_cargas_cuenta-b", "datos dañados");
  assert.deepEqual(readOrder(storage, "cuenta-b"), []);
  values.set("bajio_orden_cargas_cuenta-b", '{"no_es_lista":1}');
  assert.deepEqual(readOrder(storage, "cuenta-b"), []);
  const blocked = {
    getItem() {
      throw Error("Bloqueado");
    },
    setItem() {
      throw Error("Bloqueado");
    },
  };
  assert.equal(saveOrder(blocked, "cuenta-b", ["2", "1"]), false);
  assert.deepEqual(readOrder(blocked, "cuenta-b"), ["2", "1"]);
  assert.deepEqual(readOrder(storage, "cuenta-a"), ["3", "0001"]);
  assert.equal(saveOrder(storage, "", ["3"]), false);
  assert.deepEqual(readOrder(storage, ""), []);
});
