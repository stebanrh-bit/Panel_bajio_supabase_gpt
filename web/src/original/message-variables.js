import { escapeHtml } from "./content.js";
import { formatMoment } from "./usability.js";

/** Un solo catálogo para plantillas, mensajes y comentarios. No incluye datos de Auth ni del worker. */
export const messageVariables = [
  ["last_comment", "Último comentario", "Comentarios"],
  ["last_comment_at", "Fecha del último comentario", "Comentarios"],
  ["last_comment_by", "Autor del último comentario", "Comentarios"],
  ["load", "Carga (texto)", "Carga y cliente"],
  ["load_number", "Load (número)", "Carga y cliente"],
  ["customer", "Cliente", "Carga y cliente"],
  ["work_order", "Work order", "Carga y cliente"],
  ["status", "Estatus", "Carga y cliente"],
  ["stage", "Etapa", "Carga y cliente"],
  ["route", "Ruta completa", "Ruta y unidad"],
  ["origin", "Origen completo", "Ruta y unidad"],
  ["origin_city", "Ciudad de origen", "Ruta y unidad"],
  ["origin_state", "Estado de origen", "Ruta y unidad"],
  ["origin_address", "Dirección de origen", "Ruta y unidad"],
  ["destination", "Destino completo", "Ruta y unidad"],
  ["dest_city", "Ciudad de destino", "Ruta y unidad"],
  ["dest_state", "Estado de destino", "Ruta y unidad"],
  ["dest_address", "Dirección de destino", "Ruta y unidad"],
  ["truck", "Truck", "Ruta y unidad"],
  ["trailer", "Trailer", "Ruta y unidad"],
  ["tracking", "Liga de tracking", "Ruta y unidad"],
  ["pickup", "Pickup (cita)", "Fechas"],
  ["pickup_actual", "Recolección real", "Fechas"],
  ["delivery", "Entrega (cita)", "Fechas"],
  ["delivery_actual", "Entrega real (frase)", "Fechas"],
  ["delivery_actual_at", "Entrega real (fecha)", "Fechas"],
  ["departure", "Salida de planta (fecha guardada)", "Fechas"],
  ["crossing", "Cruce a USA (frase)", "Fechas"],
  ["crossing_at", "Cruce a USA (fecha guardada)", "Fechas"],
  ["eta_note", "ETA / nota de llegada", "Fechas"],
  ["updated_at", "Última actualización de la carga", "Fechas"],
  ["doc_status", "Estado de documentación", "Documentos"],
  ["bol", "BOL", "Documentos"],
  ["doda", "DODA", "Documentos"],
  ["entry", "Entry", "Documentos"],
  ["sobre_listo", "Sobre de documentos", "Documentos"],
  ["pod_sent", "POD enviado", "Documentos"],
  ["pedimentos", "Pedimentos", "Documentos"],
  ["exportacion", "Exportación", "Documentos"],
  ["importacion", "Importación", "Documentos"],
  ["regresos", "Regresos", "Documentos"],
  ["reason", "Motivo de actualización (frase)", "Seguimiento"],
  ["reason_text", "Motivo de actualización (texto)", "Seguimiento"],
  ["next_review_at", "Fecha del seguimiento programado", "Seguimiento"],
  ["next_review_note", "Qué revisar en el seguimiento", "Seguimiento"],
  ["punctual_note", "Pendiente puntual vigente", "Seguimiento"],
  ["instruction_action", "Instrucción de la etapa", "Seguimiento"],
  ["incident_count", "Número de incidencias", "Seguimiento"],
  ["loaded_miles", "Millas cargadas", "Millas y cargos"],
  ["empty_miles", "Millas vacías", "Millas y cargos"],
  ["rpm", "RPM", "Millas y cargos"],
  ["charges", "Cargos", "Millas y cargos"],
].map(([key, label, group]) => ({ key, label, group }));

const present = (value, fallback = "") =>
  value == null || value === "" ? fallback : String(value);
const documentValue = (value) => {
  if ([true, "true", "si", "sí"].includes(value)) return "Sí";
  if ([false, "false", "no"].includes(value)) return "No";
  return present(value, "Sin información");
};

/** Los valores son texto literal: no se ejecutan ni se vuelven a interpretar sus marcadores. */
export function variableValues(
  row,
  latest = null,
  date = formatMoment,
  cityName = (value) => present(value),
) {
  const location = (city, state) =>
    [cityName(city), present(state).toUpperCase()].filter(Boolean).join(", ");
  const when = (value) => (value ? date(value) : "Por confirmar");
  const origin = location(row.origin_city, row.origin_state),
    destination = location(row.dest_city, row.dest_state);
  const values = Object.fromEntries(
    messageVariables.map(({ key }) => [key, present(row[key])]),
  );
  Object.assign(values, {
    load: "Carga " + present(row.load),
    load_number: present(row.load),
    work_order: present(row.work_order, "—"),
    status: present(row.status, "Sin estatus"),
    stage: present(row.stageLabel),
    origin,
    destination,
    route: origin + " → " + destination,
    pickup: when(row.pickup_appt),
    pickup_actual: when(row.pickup_actual),
    delivery: row.delivery_appt
      ? date(row.delivery_appt)
      : "pendiente por confirmar",
    delivery_actual: row.delivery_actual
      ? "Entrega registrada: " + date(row.delivery_actual) + "."
      : "Seguimos atentos al cumplimiento de la entrega.",
    delivery_actual_at: when(row.delivery_actual),
    departure: when(row.salida_mexico_fecha),
    crossing: row.cruce_usa_fecha
      ? "Cruce a USA registrado: " + date(row.cruce_usa_fecha) + ". "
      : "",
    crossing_at: when(row.cruce_usa_fecha),
    updated_at: when(row.updated_at),
    tracking: present(row.tracking_link),
    reason: row.client_notify_reason
      ? " Motivo de actualización: " + row.client_notify_reason + "."
      : "",
    reason_text: present(row.client_notify_reason),
    next_review_at: when(row.next_review_at),
    punctual_note:
      row.punctual_pending === true ? present(row.punctual_note) : "",
    instruction_action: present(row.instruction_context?.action),
    incident_count: present(row.incidenciasCount, "0"),
    last_comment: latest?.text || "Sin comentarios registrados",
    last_comment_at: latest?.ts ? date(latest.ts) : "Sin fecha",
    last_comment_by: latest?.usuario || "Sin autor",
  });
  for (const key of [
    "bol",
    "doda",
    "entry",
    "sobre_listo",
    "pod_sent",
    "pedimentos",
    "exportacion",
    "importacion",
    "regresos",
  ])
    values[key] = documentValue(row[key]);
  return values;
}

const aliases = {
  ultimo_comentario: "last_comment",
  latest_comment: "last_comment",
};
export function renderMessageTemplate(template, values) {
  return String(template).replace(/\{\{([a-z_]+)\}\}/g, (marker, key) => {
    key = aliases[key] || key;
    return Object.hasOwn(values, key) ? present(values[key]) : marker;
  });
}
export function needsLatestComment(template) {
  return /\{\{(?:last_comment(?:_at|_by)?|ultimo_comentario|latest_comment)\}\}/.test(
    String(template),
  );
}

/** Sin destino inserta marcadores en una plantilla; con destino inserta datos en un texto libre. */
export function variableSelectHtml(target = "", load = "") {
  const groups = [...new Set(messageVariables.map((item) => item.group))];
  return (
    '<label class="message-variable-menu"><span>' +
    (target ? "Insertar dato de la carga" : "Insertar variable en plantilla") +
    '</span><select class="var-select" data-insert-var-select data-variable-target="' +
    escapeHtml(target) +
    '" data-variable-load="' +
    escapeHtml(load) +
    '" aria-label="' +
    (target ? "Insertar dato de la carga" : "Insertar variable en plantilla") +
    '"><option value="">Selecciona una variable…</option>' +
    groups
      .map(
        (group) =>
          '<optgroup label="' +
          escapeHtml(group) +
          '">' +
          messageVariables
            .filter((item) => item.group === group)
            .map(
              (item) =>
                '<option value="' +
                escapeHtml(item.key) +
                '">' +
                escapeHtml(item.label) +
                "</option>",
            )
            .join("") +
          "</optgroup>",
      )
      .join("") +
    "</select></label>"
  );
}
