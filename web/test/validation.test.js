import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  mountValidation,
  showFieldValidation,
  validateDateRange,
} from "../src/original/validation.js";

test("Validación: un solo mensaje, ayudas conservadas y limpieza al corregir", async () => {
  const win = new Window();
  try {
    win.document.body.innerHTML =
      '<p id="help">Dato requerido</p><input id="name" required aria-describedby="help">';
    const field = win.document.getElementById("name");
    showFieldValidation(field);
    showFieldValidation(field);
    assert.equal(win.document.querySelectorAll("#name-error").length, 1);
    assert.equal(field.getAttribute("aria-describedby"), "help name-error");
    field.value = "Ana";
    showFieldValidation(field);
    assert.equal(win.document.querySelectorAll("#name-error").length, 0);
    assert.equal(field.getAttribute("aria-describedby"), "help");
    assert.equal(field.hasAttribute("aria-invalid"), false);
  } finally {
    await win.happyDOM.close();
  }
});
test("Validación: impide guardar, enfoca el primer campo y limpia cambios de un selector", async () => {
  const win = new Window();
  try {
    const doc = win.document;
    doc.body.innerHTML =
      '<form novalidate><input id="first" required><select id="category" required><option value="">Elige</option><option value="ok">Otra</option></select><button>Guardar</button></form>';
    mountValidation(doc);
    mountValidation(doc);
    let saves = 0;
    doc.querySelector("form").addEventListener("submit", () => saves++);
    doc
      .querySelector("form")
      .dispatchEvent(
        new win.Event("submit", { bubbles: true, cancelable: true }),
      );
    await Promise.resolve();
    assert.equal(saves, 0);
    assert.equal(doc.activeElement.id, "first");
    assert.equal(doc.querySelectorAll(".field-validation-error").length, 2);
    doc.getElementById("first").value = "Dato";
    const category = doc.getElementById("category");
    category.value = "ok";
    category.dispatchEvent(new win.Event("change", { bubbles: true }));
    assert.equal(category.hasAttribute("aria-invalid"), false);
    assert.equal(category.hasAttribute("aria-describedby"), false);
    doc
      .querySelector("form")
      .dispatchEvent(
        new win.Event("submit", { bubbles: true, cancelable: true }),
      );
    assert.equal(saves, 1);
  } finally {
    await win.happyDOM.close();
  }
});
test("Histórico: intervalo invertido se rechaza y se recupera sin cambiar las fechas", async () => {
  const win = new Window();
  try {
    win.document.body.innerHTML =
      '<input id="start" type="date"><input id="end" type="date">';
    const start = win.document.getElementById("start"),
      end = win.document.getElementById("end");
    start.value = "2026-10-16";
    end.value = "2026-10-10";
    assert.equal(validateDateRange(start, end), false);
    assert.equal(start.value, "2026-10-16");
    assert.equal(end.value, "2026-10-10");
    end.value = "2026-10-16";
    assert.equal(validateDateRange(start, end), true);
    assert.equal(
      win.document.querySelectorAll(".field-validation-error").length,
      0,
    );
  } finally {
    await win.happyDOM.close();
  }
});
