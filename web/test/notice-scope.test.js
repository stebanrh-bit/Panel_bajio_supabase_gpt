import { test } from "node:test";
import assert from "node:assert/strict";
import { customerNoticeScope } from "../src/original/notice-scope.js";

const assignments = [
  { cliente: "ACME Norte", csr: "Esteban" },
  { cliente: "Continental", csr: "Ana" },
];
const loads = [
  { load: "A", customer: "  acme   NORTE  " },
  { load: "B", customer: "Continental" },
  { load: "C", customer: "Sin asignación" },
];
test("Campana: cada cuenta recibe solo sus clientes, con normalización de nombres", () => {
  const esteban = customerNoticeScope("Esteban", assignments, loads);
  const ana = customerNoticeScope("Ana", assignments, loads);
  assert.equal(esteban.hasLoad(" A "), true);
  assert.equal(esteban.hasLoad("B"), false);
  assert.equal(ana.hasLoad("A"), false);
  assert.equal(ana.hasLoad("B"), true);
  assert.equal(ana.hasLoad("C"), false);
  assert.equal(customerNoticeScope("", assignments, loads).hasLoad("A"), false);
  assert.equal(
    customerNoticeScope("Abraham", assignments, loads).hasLoad("B"),
    false,
  );
});
test("Campana: una reasignación elimina el alcance anterior sin alterar los registros", () => {
  const snapshot = structuredClone(assignments);
  const previous = customerNoticeScope("Esteban", assignments, loads);
  const next = customerNoticeScope(
    "Esteban",
    [{ cliente: "Continental", csr: "Esteban" }],
    loads,
  );
  assert.equal(previous.hasLoad("A"), true);
  assert.equal(next.hasLoad("A"), false);
  assert.equal(next.hasLoad("B"), true);
  assert.deepEqual(assignments, snapshot);
});
test("Campana: tareas vinculadas respetan el cliente; sin carga requieren asignación personal", () => {
  const scope = customerNoticeScope("Esteban", assignments, loads);
  assert.equal(scope.hasTask({ load: "B", asignado_a: "Esteban" }), false);
  assert.equal(scope.hasTask({ load: "A", asignado_a: "Esteban" }), true);
  assert.equal(scope.hasTask({ asignado_a: "Esteban" }), true);
  assert.equal(
    scope.hasTask({ asignado_a: "Ana", creado_por: "Esteban" }),
    false,
  );
  assert.equal(
    scope.hasTask({ asignado_a: "Ana", asignado_csr: "Esteban" }),
    false,
  );
});
test("Campana: un apartado requiere carga propia identificada; CSR VG y referencia manual no conceden alcance", () => {
  const scope = customerNoticeScope("Esteban", assignments, loads);
  assert.equal(
    scope.hasReservation({ related_load: "A", csr_dueno: "Otra persona" }),
    true,
  );
  assert.equal(
    scope.hasReservation({ related_load: "B", mi_carga: "A" }),
    false,
  );
  assert.equal(scope.hasReservation({ mi_carga: "A" }), true);
  assert.equal(
    scope.hasReservation({
      load: "EXTERNA",
      csr_dueno: "Esteban",
      creado_por: "Esteban",
    }),
    false,
  );
});
