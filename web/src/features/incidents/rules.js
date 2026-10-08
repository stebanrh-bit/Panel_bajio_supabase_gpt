/** Conserva el nombre del campo para señalar el error junto al control correspondiente. */
export class IncidentValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "IncidentValidationError";
    this.field = field;
  }
}

/** Valida valores normalizados antes de enviar cualquier solicitud de guardado. */
export function prepareIncident(values) {
  const incident = Object.fromEntries(
    ["category", "severity", "description", "action_taken"].map((field) => [
      field,
      String(values[field] ?? "").trim(),
    ]),
  );
  if (!incident.category)
    throw new IncidentValidationError(
      "Ingresa una categoría para registrar la incidencia.",
      "category",
    );
  if (incident.category.length > 100)
    throw new IncidentValidationError(
      "La categoría admite hasta 100 caracteres.",
      "category",
    );
  if (!["baja", "media", "alta"].includes(incident.severity))
    throw new IncidentValidationError(
      "Selecciona una severidad válida.",
      "severity",
    );
  if (!incident.description)
    throw new IncidentValidationError(
      "Describe la incidencia antes de registrarla.",
      "description",
    );
  if (incident.description.length > 10000)
    throw new IncidentValidationError(
      "La descripción admite hasta 10000 caracteres.",
      "description",
    );
  if (incident.action_taken.length > 10000)
    throw new IncidentValidationError(
      "La acción tomada admite hasta 10000 caracteres.",
      "action_taken",
    );
  return incident;
}
