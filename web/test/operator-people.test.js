import { test } from "node:test";
import assert from "node:assert/strict";
import { canOperate, isOperational } from "../src/original/people.js";

test("supervisor como CSR: aparece al tener clientes o cargas, sin incluir gerencia ni clientes", () => {
  const supervisor = { nombre: "Esteban", rol: "Supervisor" };
  assert.equal(canOperate(supervisor), true);
  assert.equal(isOperational(supervisor), false);
  assert.equal(
    isOperational(supervisor, [{ cliente: "ACME", csr: "Esteban" }]),
    true,
  );
  assert.equal(
    isOperational(supervisor, [], [{ load: "1", csr: "Esteban" }]),
    true,
  );
  assert.equal(
    isOperational(supervisor, [{ cliente: "ACME", csr: "Ana" }]),
    false,
  );
  assert.equal(isOperational({ nombre: "Ana", rol: "CSR" }), true);
  for (const rol of ["Seguimiento", "Cliente", "", undefined]) {
    const person = { nombre: "Esteban", rol };
    assert.equal(canOperate(person), false);
    assert.equal(isOperational(person, [{ csr: "Esteban" }]), false);
  }
});
