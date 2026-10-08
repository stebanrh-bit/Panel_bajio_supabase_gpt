import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { Window } from "happy-dom";
import { createPortalPanel } from "../src/features/portal/panel.js";
import { createShiftsPanel } from "../src/features/shifts/panel.js";
import { createTemplatesPanel } from "../src/features/team/templates.js";
import { createPanelController } from "../src/ui/panel.js";

const settle = async () => {
  await setImmediate();
  await setImmediate();
};
test("pantallas nuevas: portal sin campos internos, turnos visibles al guardar y plantillas persistentes", async (context) => {
  const window = new Window(),
    original = globalThis.FormData;
  globalThis.FormData = window.FormData;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const errors = [];
  const onError = (message) => {
    if (message) errors.push(message);
  };
  try {
    await context.test(
      "portal muestra solo contenido autorizado y escapa texto del cliente",
      async () => {
        const container = window.document.createElement("div");
        const record = {
          load: "P-1",
          customer: "<img src=x onerror=alert(1)>",
          origin_city: "Laredo",
          dest_city: "Dallas",
          status: "Cargando",
          charges: "CARGO PRIVADO",
          client_notify_reason: "MOTIVO INTERNO",
          messages: [
            {
              message: "Unidad en camino",
              created_at: "2026-10-08T12:00Z",
              reason: "OTRO MOTIVO",
            },
          ],
          incidents: [],
        };
        const panel = createPortalPanel({
          container,
          onError,
          service: { list: async () => [record], get: async () => record },
        });
        await panel.open();
        container.querySelector("[data-portal-load]").click();
        await settle();
        assert.ok(container.textContent.includes("Unidad en camino"));
        assert.ok(container.textContent.includes("<img"));
        assert.equal(container.querySelector("img"), null);
        assert.equal(container.querySelector("form"), null);
        assert.equal(container.textContent.includes("PRIVADO"), false);
        assert.equal(container.textContent.includes("MOTIVO"), false);
        panel.dispose();
      },
    );
    await context.test(
      "turno nuevo cambia de Resueltos a Pendientes y envía varias cargas",
      async () => {
        const container = window.document.createElement("div"),
          records = [];
        let saved;
        const service = {
          list: async () => records,
          closures: async () => [],
          save: async (values) => {
            saved = values;
            records.push({
              ...values,
              id: "task-1",
              load: "T-1",
              state: "open",
              created_by: "csr",
              shift: "Día",
            });
          },
        };
        const panel = createShiftsPanel({
          container,
          service,
          loads: [
            { load: "T-1", customer: "ACME" },
            { load: "T-2", customer: "ACME" },
          ],
          people: [
            { id: "csr", role: "csr", display_name: "Operador", active: true },
          ],
          role: "csr",
          userId: "csr",
          onOpenLoad: () => {},
          onError,
        });
        await panel.open();
        container.querySelector('[data-shift-filter="resolved"]').click();
        container.querySelector("#shift-new").click();
        const form = container.querySelector("#shift-editor");
        form.elements.note.value = "Confirmar citas";
        form.elements.assigned_to.value = "csr";
        [...form.elements.loads.options].forEach((option) => {
          option.selected = true;
        });
        form.requestSubmit();
        await settle();
        assert.deepEqual(saved.loads, ["T-1", "T-2"]);
        assert.ok(container.textContent.includes("Confirmar citas"));
        assert.equal(
          container
            .querySelector('[data-shift-filter="open"]')
            .getAttribute("aria-pressed"),
          "true",
        );
        panel.dispose();
      },
    );
    await context.test(
      "plantilla se guarda y continúa visible al recargar; gerencia tiene consulta",
      async () => {
        const container = window.document.createElement("div"),
          records = [];
        const service = {
          templates: async () => records,
          saveTemplate: async (title, body) =>
            records.push({ id: "template-1", title, body }),
        };
        let panel = createTemplatesPanel({
          container,
          service,
          role: "csr",
          onError,
        });
        await panel.open();
        container.querySelector("#template-new").click();
        const form = container.querySelector("form");
        form.elements.title.value = "Aviso";
        form.elements.body.value = "Carga {load}";
        form.requestSubmit();
        await settle();
        assert.ok(container.textContent.includes("Carga {load}"));
        await panel.open();
        assert.ok(container.textContent.includes("Aviso"));
        panel.dispose();
        panel = createTemplatesPanel({
          container,
          service,
          role: "manager",
          onError,
        });
        await panel.open();
        assert.equal(container.querySelector("button"), null);
        panel.dispose();
      },
    );
    await context.test(
      "una respuesta recibida después de salir no modifica la pantalla",
      async () => {
        const container = window.document.createElement("div");
        let resolve,
          rendered = false;
        const view = createPanelController(container, onError);
        const pending = view.load(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
          () => {
            rendered = true;
          },
        );
        view.dispose();
        resolve([]);
        await pending;
        assert.equal(rendered, false);
      },
    );
    assert.deepEqual(errors, []);
  } finally {
    globalThis.FormData = original;
    await window.happyDOM.close();
  }
});
