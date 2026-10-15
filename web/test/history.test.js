import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadHistoryItems,
  presentHistoryChange,
} from "../src/original/history.js";
import { operationMethods } from "../src/original/api/operations.js";

test("historial: muestra cambios operativos y omite marcas internas o valores equivalentes", () => {
  const records = [
    {
      id: "1",
      actor: "csr",
      changed_at: "2026-10-15T12:00:00Z",
      before_data: {
        trailer: "R-1",
        pod_sent: "false",
        pickup_appt: "2026-10-15T12:00:00Z",
        truck_source: "archivo",
        updated_at: "antes",
      },
      after_data: {
        trailer: "R-2",
        pod_sent: false,
        pickup_appt: "2026-10-15T06:00:00-06:00",
        truck_source: "manual",
        updated_at: "ahora",
      },
    },
  ];
  const snapshot = structuredClone(records);
  const items = loadHistoryItems(records, "A", () => "Ana");
  assert.deepEqual(
    items.map((item) => item.campo),
    ["trailer"],
  );
  assert.equal(items[0].valor_anterior, "R-1");
  assert.equal(items[0].valor_nuevo, "R-2");
  assert.equal(items[0].usuario, "Ana");
  assert.deepEqual(records, snapshot);
});

test("historial: creación es un evento y no una lista de columnas vacías", () => {
  const items = loadHistoryItems(
    [
      {
        id: "created",
        before_data: null,
        after_data: { status: "Cargando", truck: "", trailer: "", bol: "" },
      },
    ],
    "A",
  );
  assert.equal(items.length, 1);
  assert.equal(
    presentHistoryChange(items[0]).label,
    "Carga creada o importada",
  );
  assert.equal(items[0].usuario, "Sistema");
});

test("historial: false, cero, fechas y ausencia tienen significados distintos", () => {
  const present = (campo, before, after) =>
    presentHistoryChange(
      { campo, valor_anterior: before, valor_nuevo: after },
      () => "15 oct 2026, 06:00",
    );
  assert.deepEqual(present("pod_sent", false, true), {
    label: "POD enviado al cliente",
    before: "No enviado",
    after: "Enviado",
  });
  assert.equal(present("charges", 0, 125).before, "0");
  assert.equal(present("bol", "", "false").before, "Sin información");
  assert.equal(present("bol", "", "false").after, "Pendiente");
  assert.equal(
    present("next_review_at", "", "2026-10-15T12:00:00Z").after,
    "15 oct 2026, 06:00",
  );
});

test("adaptador de historial: conserva autor y consulta de la carga, traduce personas y no muestra UUID", async () => {
  let authorized = false;
  const uuid = "11111111-1111-4111-8111-111111111111";
  const methods = operationMethods({
    client: {},
    staff() {
      authorized = true;
    },
    personName: (id) => (id === "csr" ? "Ana" : id),
    rows: async (table, filter) => {
      assert.equal(table, "load_history");
      filter({
        eq(field, value) {
          assert.equal(field, "load");
          assert.equal(value, "A");
          return this;
        },
      });
      return [
        {
          id: "1",
          actor: uuid,
          before_data: { next_review_by: "csr" },
          after_data: { next_review_by: uuid },
          changed_at: "2026-10-15T12:00:00Z",
        },
      ];
    },
  });
  const result = await methods.getHistorialLoad("A");
  assert.equal(authorized, true);
  assert.equal(result.items[0].usuario, "Usuario no disponible");
  assert.equal(result.items[0].valor_anterior, "Ana");
  assert.equal(result.items[0].valor_nuevo, "Usuario no disponible");
});
