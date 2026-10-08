import { localDateInput } from "../../load-rules.js";

export const stateLabels = {
  cruce: "Monitoreando cruce",
  transito: "Cruzó: esperando entrega",
  entregado: "Entregó en destino",
  broker: "En broker",
  usado: "Usado para mi carga",
  liberado: "Liberado",
};

export const stateActions = {
  cruce: ["transito", "broker", "liberado"],
  transito: ["cruce", "entregado", "broker", "liberado"],
  entregado: ["transito", "usado", "broker", "liberado"],
  broker: ["entregado", "usado", "liberado"],
  usado: ["cruce"],
  liberado: ["cruce"],
};
export const textFields = {
  load: "Carga apartada",
  csr_owner: "Operador que tiene la carga",
  origin: "Origen",
  destination: "Destino donde entrega",
  own_load: "Mi carga / cliente",
  note: "Nota",
};
export const dateFields = {
  crossing_at: "Cruce previsto",
  delivery_at: "Entrega en destino",
  own_load_at: "Fecha de mi carga",
};

export const isClosed = (record) =>
  ["usado", "liberado"].includes(record.state);
export const canManage = (record, userId, role) =>
  role === "admin" || (role === "csr" && record.created_by === userId);

/** Avisos visibles: revisión vencida y riesgo para mi carga en las próximas 24 horas. */
export function attentionFor(record, now = Date.now()) {
  if (isClosed(record)) return "";
  const ownDate = Date.parse(record.own_load_at);
  if (
    ["cruce", "transito"].includes(record.state) &&
    ownDate - now <= 24 * 3600000
  ) {
    return "Mi carga es en menos de 24 horas o ya pasó y este viaje aún no entrega.";
  }
  if (Date.parse(record.next_review_at) <= now)
    return "Toca revisar este apartado.";
  return "";
}

/** Valida datos y convierte las horas locales del navegador a instantes con zona horaria. */
export function prepareReservedLoad(formValues, previous = {}) {
  const values = {};
  for (const field of Object.keys(textFields)) {
    values[field] = String(formValues[field] ?? "").trim();
    if (values[field].length > (field === "load" ? 200 : 500)) {
      throw new Error(`El campo ${textFields[field]} es demasiado largo.`);
    }
  }
  if (!values.load) throw new Error("Escribe el número de carga apartada.");
  values.review_hours = Number(formValues.review_hours ?? 3);
  if (
    !Number.isFinite(values.review_hours) ||
    values.review_hours < 0.5 ||
    values.review_hours > 48
  ) {
    throw new Error("La frecuencia debe estar entre 0.5 y 48 horas.");
  }
  for (const field of Object.keys(dateFields)) {
    const input = String(formValues[field] || "");
    if (!input) {
      values[field] = null;
      continue;
    }
    // Editar una nota no debe truncar los segundos de una fecha que no se modificó.
    if (input === localDateInput(previous[field])) {
      values[field] = previous[field];
      continue;
    }
    const date = new Date(input);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) ||
      Number.isNaN(date.getTime()) ||
      localDateInput(date.toISOString()) !== input
    ) {
      throw new Error(
        `La fecha ${dateFields[field]} no es válida en tu zona horaria.`,
      );
    }
    values[field] = date.toISOString();
  }
  return values;
}
