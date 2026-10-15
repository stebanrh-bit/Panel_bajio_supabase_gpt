/** Claves de presentación: un nombre de cliente nunca se confunde con la opción sin cliente. */
export const CALENDAR_NO_CLIENT = "calendar:no-client";
const normalized = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-MX");
export function calendarClientKey(name) {
  const key = normalized(name);
  return key ? "client:" + key : CALENDAR_NO_CLIENT;
}

/** Solo reconoce una carga relacionada o un cliente conocido; no adivina a partir de notas. */
export function reservationCalendarClient(reservation, scopedLoads) {
  const reference = normalized(reservation.mi_carga);
  if (!reference) return "";
  const linked = scopedLoads.find((row) => normalized(row.load) === reference);
  if (linked) return String(linked.customer || "").trim();
  const customer = scopedLoads.find(
    (row) => normalized(row.customer) === reference,
  );
  return customer ? String(customer.customer).trim() : "";
}

/** El filtro es local y no modifica cargas, apartados ni sus fechas. */
export function filterCalendarEvents(events, type = "all", client = "") {
  return events.filter(
    (event) =>
      (type === "all" || event.tipo === type) &&
      (!client || calendarClientKey(event.customer) === client),
  );
}
