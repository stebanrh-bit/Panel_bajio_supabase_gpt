/** Identidades y reglas de presentación compartidas. No conceden permisos: Supabase los verifica. */
export const key = (value) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
export function canonicalCustomer(value, aliases = []) {
  const alias = aliases.find((a) => key(a.alias) === key(value));
  return String(alias?.canonical_name || value || "").trim();
}
// Códigos y nombres oficiales. Los puntos y acentos no cambian el país.
const mx = [
  ["AG", "AGS", "AGU", "Aguascalientes"],
  ["BC", "BCN", "Baja California"],
  ["BCS", "Baja California Sur"],
  ["CAM", "CAMP", "Campeche"],
  ["CHIS", "CHP", "Chiapas"],
  ["CHIH", "CHH", "Chihuahua"],
  ["COAH", "COA", "Coahuila"],
  ["COL", "Colima"],
  ["CDMX", "DF", "Ciudad de Mexico", "Distrito Federal"],
  ["DGO", "DUR", "Durango"],
  ["GTO", "GUA", "Guanajuato"],
  ["GRO", "Guerrero"],
  ["HGO", "HID", "Hidalgo"],
  ["JAL", "Jalisco"],
  ["MEX", "EDOMEX", "Estado de Mexico"],
  ["MICH", "MIC", "Michoacan"],
  ["MOR", "Morelos"],
  ["NAY", "Nayarit"],
  ["NL", "NLE", "Nuevo Leon"],
  ["OAX", "Oaxaca"],
  ["PUE", "Puebla"],
  ["QRO", "QUE", "Queretaro"],
  ["QR", "QROO", "ROO", "Quintana Roo"],
  ["SLP", "San Luis Potosi"],
  ["SIN", "Sinaloa"],
  ["SON", "Sonora"],
  ["TAB", "Tabasco"],
  ["TAM", "TAMPS", "Tamaulipas"],
  ["TLAX", "TLA", "Tlaxcala"],
  ["VER", "Veracruz"],
  ["YUC", "Yucatan"],
  ["ZAC", "Zacatecas"],
];
const us =
  "AL Alabama|AK Alaska|AZ Arizona|AR Arkansas|CA California|CO Colorado|CT Connecticut|DE Delaware|FL Florida|GA Georgia|HI Hawaii|ID Idaho|IL Illinois|IN Indiana|IA Iowa|KS Kansas|KY Kentucky|LA Louisiana|ME Maine|MD Maryland|MA Massachusetts|MI Michigan|MN Minnesota|MS Mississippi|MO Missouri|MT Montana|NE Nebraska|NV Nevada|NH New Hampshire|NJ New Jersey|NM New Mexico|NY New York|NC North Carolina|ND North Dakota|OH Ohio|OK Oklahoma|OR Oregon|PA Pennsylvania|RI Rhode Island|SC South Carolina|SD South Dakota|TN Tennessee|TX Texas|UT Utah|VT Vermont|VA Virginia|WA Washington|WV West Virginia|WI Wisconsin|WY Wyoming|DC District of Columbia"
    .split("|")
    .map((x) => [x.slice(0, 2), x.slice(3)]);
const countries = new Map([
  ...mx.flatMap((a) => a.map((s) => [key(s), "MX"])),
  ...us.flatMap((a) => a.map((s) => [key(s), "US"])),
]);
export function stateCountry(state) {
  return countries.get(key(state)) || "";
}
export function routeDirection(row) {
  const origin = stateCountry(row.origin_state),
    destination = stateCountry(row.dest_state);
  const laredo =
    key(row.dest_city) === "laredo" &&
    destination === "US" &&
    key(row.dest_state) === "tx";
  const transload =
    key(row.origin_city) === "nuevolaredo" && destination === "US" && !laredo;
  let code = null;
  if (origin === "MX" && destination === "US") code = "NB";
  else if (origin === "US" && destination === "MX") code = "SB";
  else if (origin === "US" && destination === "US" && laredo) code = "SB"; // Excepción operativa acordada para ambos puntos en EE.UU.
  return { code, transload };
}
export function chronologicalDates(row) {
  const checks = [
    [
      "pickup_appt",
      "delivery_appt",
      "La cita de entrega no puede ser anterior al Pickup.",
    ],
    [
      "pickup_actual",
      "delivery_actual",
      "La entrega real no puede ser anterior a la recolección real.",
    ],
  ];
  for (const [a, b, message] of checks)
    if (row[a] && row[b] && Date.parse(row[b]) < Date.parse(row[a]))
      throw Error(message);
  return row;
}
/** La acción concreta antecede al número de motivos, para poder continuar el trabajo al abrir Inicio. */
export function nextAction(entry) {
  const row = entry.row,
    due = (entry.reminders || []).filter((r) => r.needsAction),
    next = (entry.reminders || []).find((r) => !r.needsAction);
  if (row.punctual_pending && row.punctual_note) return row.punctual_note;
  if (
    row.instruction_context?.action &&
    ["ready", "waiting", "undefined"].includes(row.instruction_context.state)
  )
    return row.instruction_context.action;
  if (due.length)
    return (
      due[0].note ||
      {
        transit: "Confirmar ubicación y avance",
        personal: "Atender seguimiento programado",
        status: "Revisar el estatus de la carga",
      }[due[0].kind] ||
      due[0].label
    );
  if (row.client_notify_pending)
    return "Preparar actualización para el cliente";
  if (entry.reasons?.length) return entry.reasons[0].text;
  if (next) return next.note || next.label;
  return row.pickup_actual
    ? "Preparar y confirmar entrega"
    : "Preparar Pickup y confirmar avance";
}
