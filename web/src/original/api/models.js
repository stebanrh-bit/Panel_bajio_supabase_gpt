import config from "../config.js";
import { booleanFields, marked, stageIndex, toISO } from "../../load-rules.js";

export const json = JSON.stringify;
export const roles = {
  admin: "Supervisor",
  csr: "CSR",
  manager: "Seguimiento",
  client: "Cliente",
};
export const databaseRoles = {
  Supervisor: "admin",
  CSR: "csr",
  Seguimiento: "manager",
};
export const severity = { critical: "alta", warn: "media", good: "baja" };
export const legacySeverity = { alta: "critical", media: "warn", baja: "good" };
export const date = (value) => (value ? toISO(value) : "");

/** Traducción de datos: conserva los nombres y textos esperados por la interfaz original. */
export function loadModel(raw, name = (value) => value, now = Date.now()) {
  const row = { ...raw };
  for (const field of booleanFields)
    row[field] =
      raw[field] == null || raw[field] === "" ? "" : marked(raw[field]);
  row.client_notify_pending = marked(raw.client_notify_pending);
  for (const field of Object.keys(row)) {
    if (field === "updated_by" || field.endsWith("_by"))
      row[field] = name(row[field]);
  }
  row.stageIndex = stageIndex(row);
  row.stageKey = config.TIMELINE_STAGES[row.stageIndex].key;
  row.stageLabel = config.TIMELINE_STAGES[row.stageIndex].label;
  const delivery = Date.parse(row.delivery_appt),
    updated = Date.parse(row.updated_at);
  const hours = (delivery - now) / 3600000;
  let level = "good",
    message = "En tiempo.";
  if (row.stageIndex !== 9) {
    if (delivery < now) {
      level = "critical";
      message = `Retraso de ${Math.round(-hours)}h respecto al ETA original.`;
    } else if (row.stageIndex < 5 && hours >= 0 && hours <= 24) {
      level = "critical";
      message =
        "La cita de entrega es en menos de 24h y el embarque aún no cruza a EUA.";
    } else if (row.status === "Cruzando" && (now - updated) / 3600000 >= 4) {
      level = "warn";
      message = `La unidad lleva ${Math.round((now - updated) / 3600000)}h en frontera.`;
    } else if (row.stageIndex < 7 && hours >= 0 && hours <= 6) {
      level = "warn";
      message = "Riesgo de no llegar a tiempo a la cita de entrega.";
    }
  }
  row.alertLevel = level;
  row.alertMessage = message;
  row.needsAction = originalNeedsAction(row, now);
  return row;
}
export const commentModel = (row, name) => ({
  ts: row.created_at,
  text: row.body,
  usuario: name(row.created_by),
});
export const incidentModel = (row, name = () => "") => ({
  id: row.id,
  load: row.load,
  fecha: row.created_at,
  categoria: row.category,
  severidad: legacySeverity[row.severity],
  descripcion: row.description,
  accion_tomada: row.action_taken,
  usuario: name(row.created_by),
  creado_por: name(row.created_by),
});
export const pendingModel = (row, name) => ({
  id: row.id,
  cliente: row.customer,
  origen: row.origin,
  destino: row.destination,
  fecha_estimada: row.estimated_date || "",
  nota: row.note,
  creado_por: name(row.created_by),
  creado_en: row.created_at,
});
export const taskModel = (row, name) => ({
  id: row.id,
  turno: row.shift,
  nota: row.note,
  load: row.load || "",
  asignado_a: name(row.assigned_to),
  asignado_csr: name(row.assigned_csr),
  creado_por: name(row.created_by),
  creado_en: row.created_at,
  resuelto: row.state === "resolved",
  resuelto_en: row.resolved_at || "",
  color: row.color,
  fecha_seguimiento: row.follow_up_at || "",
});
export const reservedModel = (row, name, history = []) => ({
  id: row.id,
  load: row.load,
  csr_dueno: row.csr_owner,
  origen: row.origin,
  destino: row.destination,
  fecha_cruce: row.crossing_at || "",
  fecha_entrega: row.delivery_at || "",
  mi_carga: row.own_load,
  fecha_mi_carga: row.own_load_at || "",
  frecuencia_horas: Number(row.review_hours),
  proxima_revision: row.next_review_at || "",
  estado: row.state,
  nota: row.note,
  creado_por: name(row.created_by),
  creado_en: row.created_at,
  actualizado_por: name(row.updated_by),
  actualizado_en: row.updated_at,
  historial: history.map((item) => ({
    ts: item.changed_at,
    por: name(item.actor),
    txt:
      ({
        created: "Apartó el load",
        edited: "Editó los datos",
        state_changed: "Cambió el estado",
        reviewed: "Revisó",
      }[item.event] || item.event) + (item.note ? ": " + item.note : ""),
  })),
});
export const communicationModel = (row, name) => ({
  id: row.id,
  load: row.load,
  timestamp: row.created_at,
  tipo: row.event_type,
  motivo: row.reason,
  usuario: name(row.actor),
  canal: row.channel || "",
  mensaje: row.public_message || row.notice_type || "",
});

/** SLA del original: desde el cambio más reciente hasta la siguiente comunicación. */
export function communicationSla(rows) {
  const pending = new Map(),
    pairs = [];
  for (const row of [...rows].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  )) {
    if (row.event_type === "PENDIENTE") pending.set(row.load, row.created_at);
    else if (
      ["NOTIFICADO", "ENVIADO"].includes(row.event_type) &&
      pending.has(row.load)
    ) {
      const minutes =
        (Date.parse(row.created_at) - Date.parse(pending.get(row.load))) /
        60000;
      if (minutes >= 0)
        pairs.push({ load: row.load, minutes, resolvedAt: row.created_at });
      pending.delete(row.load);
    }
  }
  return pairs;
}

/** La vista de gerencia conserva los criterios de su servidor original. */
export function originalNeedsAction(row, now = Date.now()) {
  if (row.status === "TONU" && row.recargos_vg) return false;
  if (config.DONE_STATUSES.includes(row.status)) return !row.pod_sent;
  if (
    row.alertLevel === "critical" ||
    config.PROBLEM_STATUSES.includes(row.status)
  )
    return true;
  const automatic = config.AUTO_REVIEW_STATUSES.includes(row.status);
  const reminder = config.REMINDER_STATUSES.includes(row.status);
  if (
    (automatic || reminder) &&
    ((!row.recordatorio_fecha && automatic) ||
      Date.parse(row.recordatorio_fecha) <= now)
  )
    return true;
  return (
    [row.pickup_delta_min, row.delivery_delta_min].some(
      (value) => Math.abs(Number(value)) > config.ATTENTION_DELAY_MIN,
    ) || Number(row.incidenciasCount) > 0
  );
}
