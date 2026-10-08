import { marked, attentionFor, doneStatuses } from "../../load-rules.js";

export const customerKey = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
export const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Una carga conserva eventos separados de recolección, cruce, entrega y revisión. */
export function calendarEvents(loads, reserved) {
  const events = [];
  for (const load of loads) {
    for (const [field, label] of Object.entries({
      pickup_appt: "Recolección",
      cruce_usa_fecha: "Cruce",
      delivery_appt: "Entrega",
      next_review_at: "Revisión",
      recordatorio_fecha: "Recordatorio",
    })) {
      const date = new Date(load[field]);
      if (load[field] && !Number.isNaN(date.getTime()))
        events.push({
          date,
          label,
          load: load.load,
          customer: load.customer,
          kind: "load",
        });
    }
  }
  for (const record of reserved.filter(
    (row) => !["usado", "liberado"].includes(row.state),
  )) {
    for (const [field, label] of Object.entries({
      crossing_at: "Cruce apartado",
      delivery_at: "Entrega apartado",
      own_load_at: "Carga propia",
    })) {
      const date = new Date(record[field]);
      if (record[field] && !Number.isNaN(date.getTime()))
        events.push({ date, label, load: record.load, kind: "reserved" });
    }
  }
  return events.sort((a, b) => a.date - b.date);
}

/** El SLA mide tiempo entre pendiente y primer aviso posterior, en minutos. */
export function communicationSla(communications) {
  const byLoad = new Map(),
    elapsed = [];
  for (const event of communications) {
    if (!byLoad.has(event.load)) byLoad.set(event.load, []);
    byLoad.get(event.load).push(event);
  }
  for (const events of byLoad.values()) {
    let pending = null;
    for (const event of events.sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    )) {
      if (event.event_type === "PENDIENTE")
        pending ??= Date.parse(event.created_at);
      else if (event.event_type === "NOTIFICADO" && pending !== null) {
        elapsed.push(
          Math.max(0, (Date.parse(event.created_at) - pending) / 60000),
        );
        pending = null;
      }
    }
  }
  return {
    samples: elapsed.length,
    average: elapsed.length
      ? elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length
      : null,
  };
}

export function indicators(loads, communications, now = Date.now()) {
  const delivered = loads.filter((row) => doneStatuses.includes(row.status));
  const delay = (field) =>
    loads.filter(
      (row) => row[field] !== "" && Number.isFinite(Number(row[field])),
    );
  const measured = delay("delivery_delta_min");
  return {
    active: loads.length,
    attention: loads.filter((row) => attentionFor(row, now)).length,
    notifications: loads.filter((row) => marked(row.client_notify_pending))
      .length,
    today: loads.filter(
      (row) =>
        row.delivery_appt &&
        dayKey(new Date(row.delivery_appt)) === dayKey(new Date(now)),
    ).length,
    missingPod: delivered.filter((row) => !marked(row.pod_sent)).length,
    deliverySamples: measured.length,
    onTimeDelivery: measured.length
      ? (100 *
          measured.filter((row) => Number(row.delivery_delta_min) <= 0)
            .length) /
        measured.length
      : null,
    sla: communicationSla(communications),
  };
}
