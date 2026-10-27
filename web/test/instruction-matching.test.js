import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findInstructionMatches,
  instructionFlow,
} from "../src/original/instructions/matching.js";

const load = {
  customer: "ACME",
  origin_city: "San Luis Potosí",
  origin_state: "S.L.P.",
  dest_city: "Coldwater",
  dest_state: "MI",
};
const template = (id, patch = {}) => ({
  ...load,
  id,
  name: id,
  state: "approved",
  ...patch,
});

test("buscar instructivos respeta ciudades, estados y prioridad del cliente sobre ruta general", () => {
  const exact = template("cliente", {
    origin_city: "SAN LUIS POTOSI",
    origin_state: "SLP",
  });
  const general = template("general", { customer: "" });
  const wrongState = template("otro-estado", { dest_state: "TX" });
  const otherCustomer = template("otro-cliente", { customer: "Otro cliente" });
  const result = findInstructionMatches(
    [general, wrongState, otherCustomer, exact],
    load,
  );
  assert.deepEqual(
    result.approved.map((item) => item.id),
    ["cliente"],
  );
  assert.deepEqual(
    findInstructionMatches([general, wrongState], load).approved,
    [general],
  );
});

test("buscar muestra borradores y pausados, pero nunca los ofrece como aprobados", () => {
  const items = [
    template("borrador", { state: "draft" }),
    template("pausado", { state: "paused" }),
    template("incorporado", { state: "merged" }),
  ];
  const result = findInstructionMatches(items, load);
  assert.deepEqual(result.approved, []);
  assert.deepEqual(
    result.unpublished.map((item) => item.id),
    ["borrador", "pausado"],
  );
});

test("buscar reconoce equivalencias del cliente y conserva la ambigüedad sin elegir al azar", () => {
  const items = [
    template("nombre-principal"),
    template("alias", { customer: "ACME Bajio" }),
  ];
  const result = findInstructionMatches(items, load, [
    { alias: "ACME Bajio", canonical_name: "ACME" },
  ]);
  assert.equal(result.approved.length, 2);
  assert.deepEqual(
    findInstructionMatches(
      [items[0]],
      { ...load, customer: "Nombre visible", customer_original: "ACME Bajio" },
      [{ alias: "ACME Bajio", canonical_name: "ACME" }],
    ).approved.map((item) => item.id),
    ["nombre-principal"],
  );
  assert.equal(
    findInstructionMatches(
      [template("sin-alias", { customer: "ACME-Bajio" })],
      load,
      [{ alias: "ACME Bajio", canonical_name: "ACME" }],
    ).approved.length,
    0,
  );
  // El nombre del cliente conserva las mismas diferencias de acentos que el comparador SQL.
  assert.equal(
    findInstructionMatches([template("otro", { customer: "ÁCME" })], load)
      .approved.length,
    0,
  );
});

test("el editor propone el recorrido según la ruta y conserva una elección existente", () => {
  const incoming = {
    origin_city: "Dallas",
    origin_state: "TX",
    dest_city: "Monterrey",
    dest_state: "NL",
  };
  assert.equal(instructionFlow(incoming), "import");
  assert.equal(
    instructionFlow({ ...incoming, instruction_plan: { flow: "export" } }),
    "export",
  );
  assert.equal(instructionFlow({ ...incoming, flow: "export" }), "export");
  assert.equal(instructionFlow(load), "export");
});
