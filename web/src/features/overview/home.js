import { escapeHtml as escape } from "../../ui/html.js";
import { alertFor, attentionFor, marked } from "../../load-rules.js";
import { loadGroup } from "../loads/presentation.js";
import { dayKey } from "./rules.js";

/** Prioridades reales de las cargas; cada tarjeta muestra la razón antes de abrir el expediente. */
export function homePriorities(loads, now = Date.now()) {
  const active = loads.filter((row) => loadGroup(row) === "active");
  return {
    now: active.filter(
      (row) =>
        alertFor(row, now).level === "critical" || row.incidenciasCount > 0,
    ),
    review: active.filter(
      (row) => row.next_review_at && Date.parse(row.next_review_at) <= now,
    ),
    monitor: active.filter((row) => marked(row.client_notify_pending)),
    clear: active.filter(
      (row) => !attentionFor(row, now) && !marked(row.client_notify_pending),
    ),
    today: loads.filter(
      (row) =>
        row.delivery_appt &&
        dayKey(new Date(row.delivery_appt)) === dayKey(new Date(now)),
    ),
    stale: active.filter(
      (row) => row.updated_at && Date.parse(row.updated_at) < now - 86400000,
    ),
  };
}
const openButton = (row) =>
  `<button class="action-open" data-overview-load="${escape(row.load)}">Abrir</button>`;
const miniRows = (rows, field) =>
  rows
    .slice(0, 6)
    .map(
      (row) =>
        `<div class="home-mini-row"><div><b>Load ${escape(row.load)}</b><small>${escape(row.customer)} · ${escape(row.origin_city)} → ${escape(row.dest_city)}</small>${field && row[field] ? `<small>${escape(new Date(row[field]).toLocaleString("es-MX"))}</small>` : ""}</div>${openButton(row)}</div>`,
    )
    .join("") || '<div class="action-empty">Sin pendientes.</div>';
const panel = (title, rows, field) =>
  `<section class="home-mini-panel"><div class="home-mini-head"><h3>${title}</h3><span>${rows.length}</span></div><div class="home-mini-list">${miniRows(rows, field)}</div></section>`;

export function homeMarkup(
  loads,
  data,
  { tab = "now", priority = "", userId, now = Date.now() } = {},
) {
  const groups = homePriorities(loads, now);
  const queue = (
    priority
      ? groups[priority]
      : loads.filter(
          (row) => attentionFor(row, now) || marked(row.client_notify_pending),
        )
  )
    .slice()
    .sort(
      (a, b) =>
        (alertFor(b, now).level === "critical") -
        (alertFor(a, now).level === "critical"),
    );
  const due = (field) =>
    loads
      .filter(
        (row) =>
          loadGroup(row) === "active" &&
          row[field] &&
          Date.parse(row[field]) >= now,
      )
      .sort((a, b) => Date.parse(a[field]) - Date.parse(b[field]));
  const tasks = (data.tasks || []).filter(
    (row) =>
      row.state === "open" &&
      (row.assigned_to === userId || row.assigned_csr === userId),
  );
  const pending = (data.pending || []).filter(
    (row) => row.state === "pending" && row.created_by === userId,
  );
  return `<div class="home-tabs" role="group" aria-label="Vista de inicio"><button class="home-tab-btn ${tab === "now" ? "active" : ""}" data-home-tab="now" aria-pressed="${tab === "now"}">Ahora</button><button class="home-tab-btn ${tab === "shift" ? "active" : ""}" data-home-tab="shift" aria-pressed="${tab === "shift"}">Mi turno</button></div>
    ${
      tab === "shift"
        ? `<div class="home-two-col"><section class="home-mini-panel"><div class="home-mini-head"><h3>MIS PENDIENTES DE LOAD</h3><button data-home-module="pending">Abrir pendientes</button></div><div class="home-mini-list">${pending.map((row) => `<div class="home-mini-row"><div><b>${escape(row.customer)}</b><small>${escape(row.origin)} → ${escape(row.destination)}</small><small>${escape(row.note)}</small></div></div>`).join("") || '<div class="action-empty">Sin solicitudes pendientes.</div>'}</div></section><section class="home-mini-panel"><div class="home-mini-head"><h3>MI BITÁCORA</h3><button data-home-module="shifts">Abrir bitácora</button></div><div class="home-mini-list">${tasks.map((row) => `<div class="home-mini-row"><div><b>${escape(row.load || "Tarea de turno")}</b><small>${escape(row.note)}</small></div>${row.load ? openButton(row) : ""}</div>`).join("") || '<div class="action-empty">Sin tareas abiertas.</div>'}</div></section><section class="home-mini-panel"><div class="home-mini-head"><h3>CIERRES DE TURNO</h3><button data-home-module="shifts">Ver cierres</button></div><div class="home-mini-list">${
            (data.closures || [])
              .slice()
              .sort(
                (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
              )
              .slice(0, 3)
              .map(
                (row) =>
                  `<div class="home-mini-row"><div><b>${escape(row.shift)}</b><small>${escape(row.body)}</small></div></div>`,
              )
              .join("") ||
            '<div class="action-empty">Sin cierres registrados.</div>'
          }</div></section></div>`
        : `
    <div class="home-priority-kpis">${[
      ["now", "ATENDER", "Incidencias y alertas críticas"],
      ["review", "REVISAR", "Seguimientos vencidos"],
      ["monitor", "MONITOREAR", "Pendientes de comunicar"],
      ["clear", "SIN ACCIÓN", "En tiempo"],
      ["today", "ENTREGAS HOY", "Citas de entrega"],
      ["stale", "SIN ACTUALIZAR", "Más de 24 horas"],
    ]
      .map(
        ([key, label, note]) =>
          `<button class="home-priority-kpi ${key}" data-home-priority="${key}" aria-pressed="${priority === key}"><span class="home-n">${groups[key].length}</span><span><b>${label}</b><small>${note}</small></span></button>`,
      )
      .join("")}</div>
    <section id="action-center" class="action-center"><div class="action-center-head"><div><h2 class="action-center-title">Mi jornada · Action Center</h2><p class="action-center-sub">${priority ? "Prioridad seleccionada · pulsa de nuevo para ver toda la atención" : "Cargas que requieren atención ahora"}</p></div><span class="action-center-count">${queue.length}</span></div><div class="action-list">${queue.map((row) => `<div class="action-row"><div class="action-row-top"><span class="action-dot ${alertFor(row, now).level === "critical" ? "critical" : "warn"}"></span><b class="action-load">${escape(row.load)}</b><span class="action-customer">${escape(row.customer)}</span>${openButton(row)}</div><span class="action-reason">${escape(attentionFor(row, now) || (marked(row.client_notify_pending) ? "Pendiente de comunicar al cliente" : priority === "stale" ? "Sin actualización en las últimas 24 horas" : "En tiempo"))}</span></div>`).join("") || '<div class="action-empty">Sin cargas pendientes con este filtro.</div>'}</div></section>
    <div class="home-two-col">${panel("PRÓXIMAS CARGAS", due("pickup_appt"), "pickup_appt")}${panel("PRÓXIMAS ENTREGAS", due("delivery_appt"), "delivery_appt")}${panel("PENDIENTES DE COMUNICACIÓN", groups.monitor)}</div>
    <div class="home-two-col">${panel(
      "RECORDATORIOS",
      loads.filter(
        (row) => row.recordatorio_fecha && loadGroup(row) === "active",
      ),
      "recordatorio_fecha",
    )}${panel(
      "INCIDENCIAS",
      loads.filter((row) => row.incidenciasCount > 0),
    )}<section class="home-mini-panel"><div class="home-mini-head"><h3>LOADS APARTADOS</h3><button data-home-module="reserved">Ver apartados</button></div><div class="home-mini-list">${
      data.reserved
        .filter((row) => !["usado", "liberado"].includes(row.state))
        .slice(0, 6)
        .map(
          (row) =>
            `<div class="home-mini-row"><div><b>${escape(row.load)}</b><small>${escape(row.customer)} · ${escape(row.state)}</small></div></div>`,
        )
        .join("") || '<div class="action-empty">Sin apartados pendientes.</div>'
    }</div></section></div>`
    }`;
}
