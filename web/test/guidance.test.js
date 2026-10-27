import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import config from "../src/original/config.js";
import {
  reminderEntries,
  currentLoadReviewAlert,
  mountGuidance,
} from "../src/original/guidance.js";
const now = Date.parse("2026-10-14T18:00:00Z");
const past = "2026-10-14T17:00:00Z",
  future = "2026-10-14T19:00:00Z";

test("recordatorios: dos plazos independientes, vencidos persistentes y orden por atención", () => {
  const rows = [
    {
      load: "1",
      status: "En transito",
      recordatorio_fecha: future,
      next_review_at: past,
      next_review_note: "Confirmar ubicación",
    },
    { load: "2", status: "Descompuesta", recordatorio_fecha: past },
  ];
  const entries = reminderEntries(rows, now, config);
  assert.deepEqual(
    entries.map((item) => item.kind),
    ["personal", "status", "transit"],
  );
  assert.deepEqual(
    entries.map((item) => item.state),
    ["vencido", "vencido", "programado"],
  );
  assert.equal(entries[0].note, "Confirmar ubicación");
  assert.equal(
    reminderEntries(rows, now + 7 * 86400000, config).length,
    3,
    "Vencer no elimina fechas ni tareas",
  );
  assert.equal(
    rows[0].next_review_at,
    past,
    "La presentación no modifica datos",
  );
});

test("recordatorios: fecha ausente y cierre operativo; POD pendiente conserva seguimiento", () => {
  const entries = reminderEntries(
    [
      { load: "Sinfecha", status: "En transito" },
      { load: "Manual", status: "En resguardo", recordatorio_fecha: "mal" },
      {
        load: "POD",
        status: "DELIVERED",
        pod_sent: "false",
        next_review_at: past,
      },
      {
        load: "Cerrada",
        status: "DELIVERED",
        pod_sent: "true",
        next_review_at: past,
      },
      {
        load: "TONU",
        status: "TONU",
        recargos_vg: "true",
        next_review_at: past,
      },
      { load: "Archivada", status: "En transito", archived: true },
    ],
    now,
    config,
  );
  assert.deepEqual(
    entries.map((item) => item.row.load),
    ["Sinfecha", "Manual", "POD"],
  );
  assert.equal(entries[0].state, "sinfecha");
  assert.equal(entries[0].needsAction, true);
});

test("navegación: nombres visibles, montaje único y acceso por teclado a indicadores", () => {
  const window = new Window();
  try {
    window.document.body.innerHTML =
      '<nav id="sidebar"><button data-page="home"><svg></svg></button><button id="sidebar-manage-csr-btn"></button></nav><div data-kpi-detail="now"></div>';
    mountGuidance(window.document);
    mountGuidance(window.document);
    assert.equal(
      window.document.querySelectorAll('[data-page="home"] .nav-label').length,
      1,
    );
    assert.equal(
      window.document
        .querySelector("#sidebar-manage-csr-btn")
        .getAttribute("aria-label"),
      "Administrar",
    );
    const tile = window.document.querySelector("[data-kpi-detail]");
    assert.equal(tile.tabIndex, 0);
    let clicks = 0;
    tile.addEventListener("click", () => clicks++);
    tile.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
    assert.equal(clicks, 1);
  } finally {
    window.happyDOM.abort();
  }
});

test("campana: un seguimiento completado o reprogramado invalida su aviso antiguo en caché", () => {
  const record = {
    load: "1",
    status: "En transito",
    next_review_at: past,
    recordatorio_fecha: past,
  };
  const alert = {
    kind: "load_review",
    load: "1",
    recipient: "user",
    dedupe_key: `review:1:seguimiento_personal:${past}:user`,
  };
  assert.equal(
    currentLoadReviewAlert(alert, record, now, config).kind,
    "personal",
  );
  for (const next_review_at of [
    "",
    future,
    "2026-10-14T16:00:00Z",
    "fecha inválida",
  ])
    assert.equal(
      currentLoadReviewAlert(alert, { ...record, next_review_at }, now, config),
      null,
    );
  const transit = {
    ...alert,
    dedupe_key: `review:1:revision_operativa:${past}:user`,
  };
  assert.equal(
    currentLoadReviewAlert(
      transit,
      { ...record, next_review_at: "" },
      now,
      config,
    ).kind,
    "transit",
  );
  assert.equal(
    record.next_review_at,
    past,
    "La comprobación no modifica ni resuelve datos",
  );
});

test("campana: los avisos de revisiones exigen identidad del evento, fecha vigente y carga abierta", () => {
  const record = { load: "1", status: "Cargando", next_review_at: past };
  const alert = {
    kind: "load_review",
    load: "1",
    recipient: "user",
    dedupe_key: `review:1:seguimiento_personal:${past}:user`,
  };
  for (const row of [
    null,
    { ...record, archived: true },
    { ...record, status: "Cancelado" },
    { ...record, status: "DELIVERED", pod_sent: "true" },
  ])
    assert.equal(currentLoadReviewAlert(alert, row, now, config), null);
  for (const patch of [
    { kind: "task_due" },
    { recipient: "other" },
    { load: "2" },
    { dedupe_key: "" },
  ])
    assert.equal(
      currentLoadReviewAlert({ ...alert, ...patch }, record, now, config),
      null,
    );
  assert.equal(
    currentLoadReviewAlert(
      { ...alert, dedupe_key: `review:1:seguimiento_personal:${future}:user` },
      { ...record, next_review_at: future },
      now,
      config,
    ),
    null,
  );
});
