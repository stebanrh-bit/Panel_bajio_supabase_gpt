import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { Window } from "happy-dom";
import { bindIncidentForm } from "../src/features/incidents/form.js";

const settle = async () => {
  await setImmediate();
  await setImmediate();
};

test("una incidencia inválida nunca llega a guardar aunque se dispare submit directamente", async (context) => {
  const window = new Window(),
    original = globalThis.FormData;
  globalThis.FormData = window.FormData;
  try {
    for (const category of ["", "   ", "\t\n", "\u00a0"]) {
      await context.test(`categoría ${JSON.stringify(category)}`, async () => {
        const form = window.document.createElement("form");
        form.innerHTML =
          '<input name="category" required maxlength="100"><select name="severity"><option>baja</option></select><textarea name="description" required></textarea><textarea name="action_taken"></textarea><button>Guardar</button>';
        form.elements.category.value = category;
        form.elements.description.value = "Descripción válida";
        let saves = 0,
          refreshes = 0;
        const errors = [];
        bindIncidentForm({
          form,
          loadNumber: "PRUEBA-1",
          saveIncident: async () => {
            saves++;
          },
          onSaved: async () => {
            refreshes++;
          },
          onError: (message) => errors.push(message),
        });
        // Evita la validación nativa deliberadamente: el código debe proteger el envío también.
        form.dispatchEvent(new window.Event("submit", { cancelable: true }));
        await settle();
        assert.equal(saves, 0);
        assert.equal(refreshes, 0);
        assert.match(errors[0], /categoría/i);
        assert.equal(form.querySelector("button").disabled, false);
        // Corregir el campo elimina el error y permite exactamente un registro válido.
        form.elements.category.value = " Documentación ";
        form.elements.category.dispatchEvent(
          new window.Event("input", { bubbles: true }),
        );
        form.dispatchEvent(new window.Event("submit", { cancelable: true }));
        await settle();
        assert.equal(saves, 1);
        assert.equal(refreshes, 1);
      });
    }
    await context.test(
      "un doble envío guarda una sola incidencia y un error conserva el formulario",
      async () => {
        const form = window.document.createElement("form");
        form.innerHTML =
          '<input name="category" value="Unidad" required><select name="severity"><option>alta</option></select><textarea name="description" required>Falla de unidad</textarea><textarea name="action_taken">Revisar</textarea><button>Guardar</button>';
        let saves = 0,
          finish;
        const errors = [];
        bindIncidentForm({
          form,
          loadNumber: "PRUEBA-1",
          saveIncident: () => {
            saves++;
            return new Promise((resolve, reject) => {
              finish = reject;
            });
          },
          onSaved: async () =>
            assert.fail("No debe mostrar un guardado exitoso"),
          onError: (message) => errors.push(message),
        });
        form.dispatchEvent(new window.Event("submit", { cancelable: true }));
        form.dispatchEvent(new window.Event("submit", { cancelable: true }));
        assert.equal(saves, 1);
        finish(new Error("Falló la conexión"));
        await settle();
        assert.match(errors[0], /conexión/);
        assert.equal(form.elements.description.value, "Falla de unidad");
        assert.equal(form.querySelector("button").disabled, false);
      },
    );
  } finally {
    globalThis.FormData = original;
    await window.happyDOM.close();
  }
});
