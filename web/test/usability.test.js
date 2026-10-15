import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  attentionGroups,
  formatMoment,
  mountUsability,
} from "../src/original/usability.js";
import { createRunner } from "../src/original/api/index.js";

test("Inicio: una carga reúne sus motivos y dos plazos sin alterar ni completar ninguno", () => {
  const rows = [
    { load: "A", customer: "Cliente", client_notify_pending: true },
    { load: "B", client_notify_pending: true },
    { load: "C" },
  ];
  const snapshot = structuredClone(rows);
  const reminders = [
    { row: rows[0], kind: "transit", time: 1, needsAction: true },
    { row: rows[0], kind: "personal", time: 3, needsAction: false },
    { row: rows[2], kind: "transit", time: 4, needsAction: false },
  ];
  const groups = attentionGroups(
    rows,
    [{ rec: rows[0], reasons: [{ text: "Avisar" }], bucket: "now" }],
    reminders,
  );
  assert.deepEqual(
    groups.map((entry) => entry.row.load),
    ["A", "B", "C"],
  );
  assert.equal(groups[0].reminders.length, 2);
  assert.deepEqual(
    groups.map((entry) => entry.bucket),
    ["now", "review", "scheduled"],
  );
  assert.deepEqual(rows, snapshot);
  assert.equal(reminders[1].needsAction, false);
});

test("fechas de lectura: fecha sin hora conserva su día y las inválidas no se presentan como reales", () => {
  assert.match(formatMoment("2026-10-15", true), /15.*oct.*2026/);
  assert.equal(formatMoment("fecha inválida"), "—");
  assert.equal(formatMoment(null), "—");
});

test("Administración: cambiar de sección conserva controles, valores y manejadores; las etiquetas se asocian", async () => {
  const win = new Window();
  let mounted;
  try {
    win.document.body.innerHTML =
      '<header class="top"></header><div id="csr-backdrop"><div class="modal-box"><div class="modal-head"></div><section class="csr-section"><input id="csr-new-nombre" placeholder="Nombre"></section><section class="csr-section"><select id="csr-asig-csr"></select><button id="assign">Asignar</button></section></div></div><div class="field"><div class="k">Cita de entrega</div><input type="datetime-local" id="date"></div>';
    const input = win.document.getElementById("csr-new-nombre");
    input.value = "Borrador";
    let calls = 0;
    win.document
      .getElementById("assign")
      .addEventListener("click", () => calls++);
    mounted = mountUsability(win.document);
    assert.strictEqual(mountUsability(win.document), mounted);
    win.document.querySelector('[data-admin-section="customers"]').click();
    assert.equal(input.closest("section").hidden, true);
    win.document.getElementById("assign").click();
    assert.equal(calls, 1);
    win.document.querySelector('[data-admin-section="people"]').click();
    assert.strictEqual(win.document.getElementById("csr-new-nombre"), input);
    assert.equal(input.value, "Borrador");
    const labelId = win.document
      .getElementById("date")
      .getAttribute("aria-labelledby");
    assert.equal(
      win.document.getElementById(labelId).textContent,
      "Cita de entrega",
    );
    await win.happyDOM.waitUntilComplete();
  } finally {
    mounted?.disconnect();
    await win.happyDOM.close();
  }
});

test("guardado: un error no desaparece al finalizar otra petición ni se reintenta sin intervención", async () => {
  const win = new Window();
  let mounted;
  try {
    win.document.body.innerHTML = '<header class="top"></header>';
    mounted = mountUsability(win.document);
    const emit = (detail) =>
      win.dispatchEvent(new win.CustomEvent("panel:save", { detail }));
    emit({ id: 1, phase: "start" });
    emit({ id: 2, phase: "start" });
    emit({ id: 1, phase: "error", message: "El registro cambió." });
    emit({ id: 2, phase: "success" });
    const feedback = win.document.getElementById("ux-save-feedback");
    assert.equal(feedback.dataset.state, "error");
    assert.match(feedback.textContent, /El registro cambió/);
    feedback.querySelector("button").click();
    assert.doesNotMatch(feedback.textContent, /El registro cambió/);
    emit({ phase: "reset" });
    assert.equal(feedback.hidden, true);
    await win.happyDOM.waitUntilComplete();
  } finally {
    mounted?.disconnect();
    await win.happyDOM.close();
  }
});

test("guardado dentro de una ventana: un encabezado anidado no provoca ciclos de montaje", async () => {
  const win = new Window();
  let mounted;
  try {
    win.document.body.innerHTML =
      '<header class="top"></header><div class="modal-backdrop show"><div class="modal-box"><div id="column"><div class="modal-head">Acceso</div><input placeholder="Usuario"></div></div></div>';
    mounted = mountUsability(win.document);
    win.dispatchEvent(
      new win.CustomEvent("panel:save", {
        detail: { id: 1, phase: "error", message: "Dato inválido" },
      }),
    );
    await win.happyDOM.waitUntilComplete();
    assert.equal(
      win.document.getElementById("ux-save-feedback").parentElement.id,
      "column",
    );
    assert.equal(win.document.querySelectorAll("#ux-save-feedback").length, 1);
    win.document.querySelector(".modal-backdrop").classList.remove("show");
    await win.happyDOM.waitUntilComplete();
    assert.equal(
      win.document.getElementById("ux-save-feedback").previousElementSibling
        .tagName,
      "HEADER",
    );
  } finally {
    mounted?.disconnect();
    await win.happyDOM.close();
  }
});

test("adaptador: informa guardado confirmado o rechazado sin exponer argumentos de cuentas", async () => {
  const observed = [];
  const methods = {
    setPersonaPassword: async () => ({ ok: true }),
    saveStatus: async () => {
      throw Error("Versión antigua");
    },
    getPersonas: async () => [],
  };
  const runner = createRunner(
    methods,
    () => 0,
    (event) => observed.push(event),
  );
  await new Promise((resolve) =>
    runner
      .withSuccessHandler(resolve)
      .setPersonaPassword("Ana", "No-debe-salir"),
  );
  await new Promise((resolve) =>
    runner.withFailureHandler(resolve).saveStatus("1", "Cargando"),
  );
  await new Promise((resolve) =>
    runner.withSuccessHandler(resolve).getPersonas(),
  );
  assert.deepEqual(
    observed.map((event) => event.phase),
    ["start", "success", "start", "error"],
  );
  assert.doesNotMatch(JSON.stringify(observed), /No-debe-salir|Ana|Cargando/);
});
