import {
  requirementLabels,
  instructionStateLabels,
} from "./instructions/content.js";
import { signalsSummary } from "./logistics-signals.js";

/** Campos operativos del historial. La auditoría original se conserva íntegra en Supabase. */
export const historyFieldLabels = {
  instruction_exception: "Indicación particular de la carga",
  instruction_context: "Seguimiento del instructivo",
  customer: "Cliente",
  origin_city: "Ciudad de origen",
  origin_state: "Estado de origen",
  origin_address: "Dirección de origen",
  dest_city: "Ciudad de destino",
  dest_state: "Estado de destino",
  dest_address: "Dirección de destino",
  pickup_appt: "Cita de recolección",
  pickup_actual: "Recolección realizada",
  pickup_delta_min: "Desfase de recolección",
  delivery_appt: "Cita de entrega",
  delivery_actual: "Entrega realizada",
  delivery_delta_min: "Desfase de entrega",
  truck: "Unidad",
  trailer: "Trailer",
  status: "Estatus",
  cancel_reason: "Motivo de cancelación",
  work_order: "Orden de trabajo",
  bol: "Documento BOL",
  doc_status: "Estado de documentación",
  doda: "Documento DODA",
  entry: "Documento Entry",
  exportacion: "Exportación",
  importacion: "Importación",
  pedimentos: "Pedimentos",
  regresos: "Regreso",
  sobre_listo: "Sobre de documentos",
  loaded_miles: "Millas con carga",
  empty_miles: "Millas vacías",
  rpm: "Tarifa por milla",
  charges: "Cargos",
  tracking_link: "Enlace de seguimiento",
  eta_note: "Nota de llegada estimada",
  pod_sent: "POD enviado al cliente",
  recargos_vg: "Recargos registrados",
  recordatorio_fecha: "Próxima revisión por estatus",
  color: "Color de la carga",
  salida_mexico_fecha: "Salida de planta",
  cruce_usa_fecha: "Cruce de aduana",
  client_notify_pending: "Aviso al cliente pendiente",
  client_notify_reason: "Motivo del aviso al cliente",
  client_notified_at: "Fecha del aviso al cliente",
  client_notified_by: "Aviso al cliente registrado por",
  next_review_at: "Seguimiento programado",
  next_review_note: "Qué revisar en el seguimiento",
  next_review_by: "Seguimiento programado por",
  operacion_pais: "País de operación",
  llegada_planta_fecha: "Llegada a planta",
  ultima_revision_csr: "Última revisión de la carga",
  ultima_revision_csr_by: "Carga revisada por",
  siguiente_movimiento: "Siguiente movimiento",
  etd_operativa: "Salida estimada",
  cruce_confirmado: "Cruce confirmado",
  client_notify_since: "Aviso pendiente desde",
  logistics_signals: "Señalamientos de la carga",
  logistics_signals_at: "Señalamientos actualizados el",
  logistics_signals_by: "Señalamientos actualizados por",
  punctual_pending: "Pendiente puntual",
  punctual_note: "Qué resolver ahora",
  punctual_opened_at: "Pendiente puntual abierto el",
  punctual_opened_by: "Pendiente puntual abierto por",
  punctual_resolved_at: "Pendiente puntual resuelto el",
  punctual_resolved_by: "Pendiente puntual resuelto por",
  archived: "Archivo de la carga",
};

const historyBooleans = new Set([
  "punctual_pending",
  "bol",
  "doda",
  "entry",
  "sobre_listo",
  "pod_sent",
  "recargos_vg",
  "cruce_confirmado",
  "client_notify_pending",
  "archived",
]);
const historyDates = new Set([
  "logistics_signals_at",
  "punctual_opened_at",
  "punctual_resolved_at",
  "pickup_appt",
  "pickup_actual",
  "delivery_appt",
  "delivery_actual",
  "recordatorio_fecha",
  "salida_mexico_fecha",
  "cruce_usa_fecha",
  "next_review_at",
  "llegada_planta_fecha",
  "ultima_revision_csr",
  "etd_operativa",
  "client_notified_at",
  "client_notify_since",
]);
const historyPeople = new Set([
  "logistics_signals_by",
  "punctual_opened_by",
  "punctual_resolved_by",
  "client_notified_by",
  "next_review_by",
  "ultima_revision_csr_by",
]);
const blank = (value) => value === null || value === undefined || value === "";
const truth = (value) =>
  !["false", "0", "no", "null"].includes(String(value).trim().toLowerCase());

function comparable(field, value) {
  if (blank(value)) return "";
  if (field === "instruction_context" && value && typeof value === "object") {
    const { changed_at, event_key, ...meaningful } = value;
    return JSON.stringify(meaningful);
  }
  if (historyBooleans.has(field)) return truth(value) ? "true" : "false";
  if (historyDates.has(field) && Number.isFinite(Date.parse(value)))
    return String(Date.parse(value));
  return String(value);
}

/** Traduce los cambios relevantes; las marcas técnicas y los valores equivalentes no generan ruido. */
export function loadHistoryItems(records, load, personName = (value) => value) {
  const person = (id) => {
    if (!id || id === "database") return "Sistema";
    const name = personName(id);
    return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(name))
      ? "Usuario no disponible"
      : name || "Sistema";
  };
  const items = [];
  for (const record of records) {
    const base = {
      load,
      timestamp: record.changed_at,
      usuario: person(record.actor),
    };
    if (!record.before_data) {
      items.push({
        ...base,
        id: String(record.id) + ":created",
        campo: "created",
        valor_anterior: "",
        valor_nuevo: "Carga registrada",
      });
      continue;
    }
    for (const field of Object.keys(historyFieldLabels)) {
      if (globalThis.PANEL_CONFIG?.INTERNAL_ONLY && /^client_/.test(field))
        continue;
      const before = record.before_data[field],
        after = record.after_data?.[field];
      // Un campo ausente en una instantánea antigua no se interpreta como borrado.
      if (
        !(field in (record.after_data || {})) ||
        comparable(field, before) === comparable(field, after)
      )
        continue;
      items.push({
        ...base,
        id: `${record.id}:${field}`,
        campo: field,
        valor_anterior:
          historyPeople.has(field) && !blank(before)
            ? person(before)
            : (before ?? ""),
        valor_nuevo:
          historyPeople.has(field) && !blank(after)
            ? person(after)
            : (after ?? ""),
      });
    }
  }
  return items;
}

/** Texto de lectura: false y cero son valores válidos, distintos de falta de información. */
export function presentHistoryChange(item, formatDate) {
  const field = item.campo;
  function value(raw) {
    if (field === "instruction_context") {
      if (!raw || typeof raw !== "object") return "Sin instructivo";
      return [
        instructionStateLabels[raw.state] || "Sin instructivo",
        raw.stage_label,
        raw.action,
        raw.condition ? "Condición: " + raw.condition : "",
        raw.missing?.length
          ? "Falta: " +
            raw.missing.map((key) => requirementLabels[key] || key).join(", ")
          : "",
        raw.exception ? "Excepción: " + raw.exception : "",
        raw.on_issue ? "Si hay un problema: " + raw.on_issue : "",
        raw.contact ? "Contacto: " + raw.contact : "",
        raw.notify_at ? "Aviso: " + formatDate(raw.notify_at) : "",
        raw.approved_at ? "Aprobado: " + formatDate(raw.approved_at) : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (field === "logistics_signals") return signalsSummary(raw);
    if (blank(raw)) return "Sin información";
    if (historyBooleans.has(field)) {
      const yes = truth(raw);
      const terms = {
        pod_sent: ["No enviado", "Enviado"],
        recargos_vg: ["Pendientes", "Registrados"],
        cruce_confirmado: ["No confirmado", "Confirmado"],
        client_notify_pending: ["Sin aviso pendiente", "Aviso pendiente"],
        punctual_pending: ["Sin pendiente puntual", "Pendiente puntual activo"],
        archived: ["Activa", "Archivada"],
      }[field] || ["Pendiente", "Recibido"];
      return terms[Number(yes)];
    }
    if (historyDates.has(field) && Number.isFinite(Date.parse(raw)))
      return formatDate(raw);
    if (field === "color")
      return (
        {
          critical: "Rojo",
          warn: "Amarillo",
          good: "Verde",
          info: "Azul",
          purple: "Morado",
          teal: "Turquesa",
          pink: "Rosa",
          neutral: "Sin color",
        }[raw] || String(raw)
      );
    if (field === "pickup_delta_min" || field === "delivery_delta_min")
      return String(raw) + " minutos";
    return typeof raw === "object" ? "Información actualizada" : String(raw);
  }
  if (field === "created")
    return {
      label: "Carga creada o importada",
      before: "Sin registro",
      after: "Carga registrada",
    };
  return {
    label: historyFieldLabels[field] || "Información de la carga",
    before: value(item.valor_anterior),
    after: value(item.valor_nuevo),
  };
}
