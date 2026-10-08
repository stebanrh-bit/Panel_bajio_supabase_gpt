import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mountLoadWorkspace } from "../src/features/loads/workspace.js";
import {
  loadCardsMarkup,
  loadRowsMarkup,
  matchesOperationFilter,
  loadGroup,
} from "../src/features/loads/presentation.js";
import { homePriorities, homeMarkup } from "../src/features/overview/home.js";
import { createOverviewPanel } from "../src/features/overview/panel.js";
import { setImmediate } from "node:timers/promises";

/** Cambiar el contenedor visual debe conservar formularios, eventos y accesibilidad. */
test("workspace: mueve controles a su pestaña, conserva eventos y cierra con Escape", async () => {
  const window = new Window(),
    previous = globalThis.document;
  globalThis.document = window.document;
  try {
    const section = window.document.createElement("section");
    window.document.body.append(section);
    section.innerHTML =
      '<div class="card"><div class="toolbar"><h2>Carga A</h2><button id="edit">Editar</button></div><dl><div data-field="customer">Cliente</div><div data-field="bol">BOL</div><div data-field="tracking_link">Tracking</div></dl><h3>Comentarios</h3><form id="comment"><button>Guardar comentario</button></form><h3>Incidencias</h3><form id="incident"><button>Guardar incidencia</button></form><div id="load-extra-actions"></div><h3>Últimos cambios</h3><ul><li>Historial</li></ul></div>';
    const form = section.querySelector("#incident");
    let submitted = 0,
      closed = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitted++;
    });
    mountLoadWorkspace(section, {
      row: {
        load: "A",
        customer: "ACME",
        origin_city: "Bajío",
        dest_city: "Laredo",
      },
      initialTab: "incidencias",
      onClose: () => closed++,
    });
    assert.strictEqual(section.querySelector("#incident"), form);
    assert.equal(
      section.querySelector("[data-workspace-panel=incidencias]").hidden,
      false,
    );
    assert.equal(
      section.querySelector("[data-workspace-panel=operacion]").hidden,
      true,
    );
    assert.equal(
      section
        .querySelector("#workspace-tab-incidencias")
        .getAttribute("aria-selected"),
      "true",
    );
    assert.ok(
      section.querySelector(
        "[data-workspace-panel=documentos] [data-field=bol]",
      ),
    );
    assert.ok(
      section.querySelector(
        "[data-workspace-panel=tracking] [data-field=tracking_link]",
      ),
    );
    assert.ok(
      section.querySelector("[data-workspace-panel=comunicacion] #comment"),
    );
    assert.ok(
      section.querySelector(
        "[data-workspace-panel=comunicacion] #load-extra-actions",
      ),
    );
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    assert.equal(submitted, 1);
    section.querySelector("#workspace-tab-documentos").click();
    assert.equal(
      section.querySelector("[data-workspace-panel=documentos]").hidden,
      false,
    );
    const dialog = section.querySelector("dialog");
    dialog.dispatchEvent(new window.Event("cancel", { cancelable: true }));
    assert.equal(closed, 1);
    assert.equal(dialog.open, false);
  } finally {
    globalThis.document = previous;
    await window.happyDOM.close();
  }
});

test("tarjetas y tabla agrupan cierres y escapan textos del cliente", () => {
  const loads = [
    {
      load: "<script>1</script>",
      customer: "<img src=x onerror=alert(1)>",
      status: "Cargando",
    },
    { load: "ENTREGADA", status: "DELIVERED", pod_sent: true },
    { load: "CANCELADA", status: "Cancelado." },
  ];
  const cards = loadCardsMarkup(loads, false),
    table = loadRowsMarkup(loads, false);
  assert.match(cards, /En curso/);
  assert.match(cards, /Entregadas/);
  assert.match(cards, /Canceladas\/Finalizadas/);
  for (const html of [cards, table]) {
    assert.doesNotMatch(html, /<script>|<img/);
    assert.match(html, /&lt;script&gt;/);
  }
});

test("inicio: prioridad usa datos operativos y Mi turno restringe tareas al usuario", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const loads = [
    {
      load: "REVISAR",
      status: "En transito",
      next_review_at: "2026-10-08T11:00:00Z",
      client_notify_pending: true,
    },
    { load: "INCIDENCIA", status: "Cargando", incidenciasCount: 1 },
    { load: "VIEJA", status: "Cargando", updated_at: "2026-10-06T12:00:00Z" },
    {
      load: "ENTREGADA",
      status: "DELIVERED",
      pod_sent: true,
      next_review_at: "2026-10-06T12:00:00Z",
    },
  ];
  const groups = homePriorities(loads, now);
  assert.deepEqual(
    groups.review.map((row) => row.load),
    ["REVISAR"],
  );
  assert.deepEqual(
    groups.now.map((row) => row.load),
    ["INCIDENCIA"],
  );
  assert.deepEqual(
    groups.stale.map((row) => row.load),
    ["VIEJA"],
  );
  const html = homeMarkup(
    loads,
    {
      reserved: [],
      tasks: [
        { state: "open", assigned_to: "yo", note: "MI TAREA" },
        { state: "open", assigned_to: "otro", note: "AJENA" },
        { state: "resolved", assigned_to: "yo", note: "CERRADA" },
      ],
    },
    { tab: "shift", userId: "yo", now },
  );
  assert.match(html, /MI TAREA/);
  assert.doesNotMatch(html, /AJENA|CERRADA/);
});

test("calendario: anterior y siguiente muestran siete días y permiten volver a la semana", async () => {
  const window = new Window();
  try {
    const container = window.document.createElement("div");
    window.document.body.append(container);
    const panel = createOverviewPanel({
      container,
      mode: "calendar",
      people: [],
      userId: "yo",
      onError: (message) => assert.fail(message),
      service: {
        list: async () => ({
          loads: [],
          assignments: [],
          following: [],
          communications: [],
          reserved: [],
        }),
      },
    });
    await panel.open();
    await setImmediate();
    assert.equal(container.querySelectorAll(".calendar-day").length, 7);
    const first = container.querySelector("#overview-content h3").textContent;
    container.querySelector("#week-next").click();
    assert.notEqual(
      container.querySelector("#overview-content h3").textContent,
      first,
    );
    container.querySelector("#week-previous").click();
    assert.equal(
      container.querySelector("#overview-content h3").textContent,
      first,
    );
    panel.dispose();
  } finally {
    await window.happyDOM.close();
  }
});

// Un cierre se agrupa como Entregada únicamente cuando su POD ya fue compartido.
test("filtros originales: POD pendiente permanece en curso; cruces usan hoy y seis días siguientes", () => {
  const now = new Date(2026, 9, 8, 23, 30),
    row = { status: "Cargando" };
  assert.equal(loadGroup({ status: "DELIVERED", pod_sent: false }), "active");
  assert.equal(loadGroup({ status: "DELIVERED", pod_sent: "false" }), "active");
  assert.equal(loadGroup({ status: "DELIVERED", pod_sent: true }), "done");
  assert.equal(
    matchesOperationFilter(
      { ...row, cruce_usa_fecha: new Date(2026, 9, 8, 1).toISOString() },
      "cruce-hoy",
      now,
    ),
    true,
  );
  assert.equal(
    matchesOperationFilter(
      { ...row, cruce_usa_fecha: new Date(2026, 9, 14, 23).toISOString() },
      "cruce-semana",
      now,
    ),
    true,
  );
  assert.equal(
    matchesOperationFilter(
      { ...row, cruce_usa_fecha: new Date(2026, 9, 15, 1).toISOString() },
      "cruce-semana",
      now,
    ),
    false,
  );
  assert.equal(
    matchesOperationFilter(
      { ...row, cruce_usa_fecha: new Date(2026, 9, 7, 23).toISOString() },
      "cruce-hoy",
      now,
    ),
    false,
  );
  assert.equal(
    matchesOperationFilter(
      { ...row, pickup_appt: new Date(2026, 9, 9).toISOString() },
      "active",
      now,
    ),
    false,
  );
  assert.equal(
    matchesOperationFilter(
      { ...row, pickup_appt: new Date(2026, 9, 8, 23, 59).toISOString() },
      "active",
      now,
    ),
    true,
  );
});
