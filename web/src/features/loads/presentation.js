import { escapeHtml as escape } from "../../ui/html.js";
import {
  attentionFor,
  alertFor,
  marked,
  stages,
  stageIndex,
  doneStatuses,
} from "../../load-rules.js";

const dateText = (value) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString("es-MX", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Por confirmar";
export const loadGroup = (row) =>
  doneStatuses.includes(row.status) && marked(row.pod_sent)
    ? "done"
    : /^cancelado\.?$/i.test(row.status) ||
        (row.status === "TONU" && marked(row.recargos_vg))
      ? "closed"
      : "active";

/** Cruces y salida a ruta conservan las fechas locales y los límites del filtro original. */
export function matchesOperationFilter(row, filter, now = new Date()) {
  if (filter === "all") return true;
  if (filter === "attention")
    return Boolean(
      attentionFor(row, now.getTime()) || marked(row.client_notify_pending),
    );
  if (filter === "notify") return marked(row.client_notify_pending);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "cruce-hoy" || filter === "cruce-semana") {
    if (!row.cruce_usa_fecha) return false;
    const crossing = new Date(row.cruce_usa_fecha);
    if (Number.isNaN(crossing.getTime())) return false;
    const day = new Date(
      crossing.getFullYear(),
      crossing.getMonth(),
      crossing.getDate(),
    );
    const limit = new Date(today);
    limit.setDate(limit.getDate() + (filter === "cruce-hoy" ? 0 : 6));
    return loadGroup(row) === "active" && day >= today && day <= limit;
  }
  if (filter === "active") {
    const pickup = new Date(row.pickup_appt);
    const pickupDay = new Date(
      pickup.getFullYear(),
      pickup.getMonth(),
      pickup.getDate(),
    );
    return (
      loadGroup(row) === "active" &&
      (!row.pickup_appt || Number.isNaN(pickup.getTime()) || pickupDay <= today)
    );
  }
  return filter === loadGroup(row);
}

export function operationMarkup(loads, writable) {
  return `<div class="page-view"><div class="operation-page-head"><div><h1>Operación completa</h1><p>Consulta, filtra y administra todas las cargas de la operación.</p></div><div class="operation-head-right">${writable ? '<button id="new" class="ws-btn primary">Nueva carga</button><button id="bulk" class="ws-btn">Cambiar selección</button>' : ""}<button id="refresh" class="ws-btn">Actualizar</button></div></div>
    <div class="stats">${Object.entries({
      "Total de cargas": loads.length,
      "En curso": loads.filter((row) => loadGroup(row) === "active").length,
      "Necesitan atención": loads.filter((row) => attentionFor(row)).length,
      Entregadas: loads.filter((row) => loadGroup(row) === "done").length,
      "Pendientes de avisar": loads.filter((row) =>
        marked(row.client_notify_pending),
      ).length,
    })
      .map(
        ([label, value]) =>
          `<div class="stat"><span class="stat-value">${value}</span><span class="stat-label">${label}</span></div>`,
      )
      .join("")}</div>
    <div class="home-operation-wrap"><div class="toolbar operation-filters">${[
      ["all", "Todas"],
      ["active", "En ruta"],
      ["attention", "Necesitan atención"],
      ["notify", "Pendientes de avisar"],
      ["cruce-hoy", "Cruzan hoy"],
      ["cruce-semana", "Cruzan esta semana"],
      ["done", "Entregadas"],
      ["closed", "Canceladas/Finalizadas"],
    ]
      .map(
        ([key, label]) =>
          `<button class="chip" data-filter="${key}">${label}</button>`,
      )
      .join("")}
      <select id="customer-filter" class="cliente-filter" aria-label="Filtrar por cliente"><option value="">Todos los clientes</option>${[
        ...new Set(loads.map((row) => row.customer)),
      ]
        .filter(Boolean)
        .sort()
        .map((value) => `<option>${escape(value)}</option>`)
        .join("")}</select>
      <input id="search" class="search" type="search" placeholder="Buscar load, cliente, trailer…" aria-label="Buscar cargas"><button id="view-toggle" class="file-btn">Vista tabla</button></div>
      <div id="cards-view"></div><div class="table-wrap" id="table-view" hidden><table class="loads-table"><thead><tr>${writable ? "<th>Seleccionar</th>" : ""}<th>Load</th><th>Trailer</th><th>Cliente</th><th>Status</th><th>Origin</th><th>Destination</th><th>Pickup cita</th><th>Entrega cita</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div><section id="detail"></section></div>`;
}

/** Tarjetas originales: unidad, ruta, citas, documentos, timeline y acciones agrupadas. */
export function loadCardMarkup(row, writable = false) {
  const alert = alertFor(row),
    attention = attentionFor(row),
    stage = stageIndex(row);
  return `<article class="load-card card ${attention ? "needs-attention" : ""}"><div class="card-top"><div><span class="load-number">Load ${escape(row.load)}</span><span class="customer-name">${escape(row.customer || "Sin cliente")}</span></div>
    ${writable ? `<label class="load-select"><input type="checkbox" data-load-select="${escape(row.load)}" aria-label="Seleccionar carga ${escape(row.load)}"></label>` : ""}</div>
    <div class="load-unit"><span>Truck <b>${escape(row.truck || "—")}</b></span><span>Trailer <b>${escape(row.trailer || "—")}</b></span><span class="status-pill">${escape(row.status || "Sin status")}</span></div>
    <div class="route-line"><div><small>ORIGIN</small><b>${escape([row.origin_city, row.origin_state].filter(Boolean).join(", ") || "Por confirmar")}</b></div><span class="route-arrow">→</span><div><small>DESTINATION</small><b>${escape([row.dest_city, row.dest_state].filter(Boolean).join(", ") || "Por confirmar")}</b></div></div>
    <div class="load-appointments"><div><small>Pickup cita</small><span>${escape(dateText(row.pickup_appt))}</span></div><div><small>Entrega cita</small><span>${escape(dateText(row.delivery_appt))}</span></div></div>
    <ol class="load-mini-timeline" aria-label="Etapas de carga">${stages.map((label, index) => `<li class="${index < stage ? "done" : index === stage ? "current" : ""}" title="${label}" aria-label="${label}" ${index === stage ? 'aria-current="step"' : ""}></li>`).join("")}</ol><small class="load-stage">${stages[stage]}</small>
    <div class="doc-mini">${Object.entries({
      bol: "BOL",
      doda: "DODA",
      entry: "ENTRY",
      sobre_listo: "SOBRE",
      pod_sent: "POD",
    })
      .map(
        ([field, label]) =>
          `<span class="${marked(row[field]) ? "ready" : ""}">${marked(row[field]) ? "✓" : "○"} ${label}</span>`,
      )
      .join("")}</div>
    ${attention ? `<p class="load-alert ${alert.level === "critical" ? "critical" : "warn"}">${escape(attention)}</p>` : ""}${marked(row.client_notify_pending) ? '<p class="notify-badge">Pendiente comunicar a cliente</p>' : ""}
    <div class="card-actions"><button class="workspace-open-btn" data-load="${escape(row.load)}">Abrir workspace</button><button class="ws-btn" data-load="${escape(row.load)}" data-workspace-tab="comunicacion">Comentarios</button><button class="ws-btn" data-load="${escape(row.load)}" data-workspace-tab="incidencias">Incidencias${row.incidenciasCount ? " (" + row.incidenciasCount + ")" : ""}</button></div></article>`;
}

export function loadCardsMarkup(loads, writable) {
  return (
    [
      ["active", "En curso"],
      ["done", "Entregadas"],
      ["closed", "Canceladas/Finalizadas"],
    ]
      .map(([group, title]) => {
        const rows = loads.filter((row) => loadGroup(row) === group);
        return rows.length
          ? `<section class="group"><h2>${title} <span class="count">${rows.length}</span></h2><div class="cards">${rows.map((row) => loadCardMarkup(row, writable)).join("")}</div></section>`
          : "";
      })
      .join("") ||
    '<div class="action-empty">Sin resultados con los filtros actuales.</div>'
  );
}
export function loadRowsMarkup(loads, writable) {
  return (
    loads
      .map(
        (row) =>
          `<tr>${writable ? `<td><input type="checkbox" data-load-select="${escape(row.load)}" aria-label="Seleccionar carga ${escape(row.load)}"></td>` : ""}<td><button class="link-btn" data-load="${escape(row.load)}">${escape(row.load)}</button></td><td>${escape(row.trailer)}</td><td>${escape(row.customer)}</td><td><span class="status-pill">${escape(row.status)}</span></td><td>${escape(row.origin_city)}</td><td>${escape(row.dest_city)}</td><td>${escape(dateText(row.pickup_appt))}</td><td>${escape(dateText(row.delivery_appt))}</td><td><button class="workspace-open-btn" data-load="${escape(row.load)}">Abrir</button></td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="${writable ? 10 : 9}">Sin resultados con los filtros actuales.</td></tr>`
  );
}
