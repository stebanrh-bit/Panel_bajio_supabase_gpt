/** Vistas personales: solo filtran las cargas que la sesión ya tiene permiso de consultar. */
export const MAX_VIEWS = 30;
export const BUILTIN_IDS = [
  "all",
  "active",
  "punctual",
  "attention",
  "cruce-hoy",
  "cruce-semana",
  "done",
  "cancelada",
];
export const choices = {
  lifecycle: [
    ["all", "Todas"],
    ["open", "Abiertas"],
    ["delivered", "Entregadas con POD"],
    ["closed", "Canceladas o finalizadas"],
  ],
  pickup: [
    ["any", "Cualquier fecha"],
    ["through_today", "Hoy y anteriores, o sin fecha"],
    ["future", "Solo futuras"],
    ["today", "Solo hoy"],
    ["missing", "Sin fecha de Pickup"],
  ],
  dateField: [
    ["pickup_appt", "Pickup"],
    ["delivery_appt", "Entrega"],
    ["cruce_usa_fecha", "Cruce"],
  ],
  period: [
    ["any", "Sin restricción"],
    ["today", "Hoy"],
    ["next7", "Hoy y los próximos 6 días"],
    ["next30", "Hoy y los próximos 29 días"],
    ["past", "Días anteriores a hoy"],
    ["custom", "Elegir fechas"],
  ],
  flag: [
    ["any", "Indistinto"],
    ["yes", "Sí"],
    ["no", "No"],
  ],
  layout: [
    ["keep", "Conservar vista actual"],
    ["table", "Tabla"],
    ["cards", "Tarjetas"],
  ],
};
export const textKey = (value) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
const marked = (value) =>
  !["", "false", "0", "no", "null", "undefined"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
export function emptyRules() {
  return {
    lifecycle: "all",
    pickup: "any",
    statuses: [],
    clients: [],
    dateField: "pickup_appt",
    period: "any",
    start: "",
    end: "",
    pod: "any",
    punctual: "any",
    attention: "any",
    notice: "any",
    search: "",
  };
}
export function defaultConfig() {
  const item = (id, name, rules) => ({
    id,
    name,
    visible: true,
    rules: { ...emptyRules(), ...rules },
    layout: "keep",
    sort: null,
  });
  return {
    schema: 1,
    defaultId: "all",
    items: [
      item("all", "Todas", {}),
      item("active", "Activas", { lifecycle: "open", pickup: "through_today" }),
      item("punctual", "Pendientes puntuales", { punctual: "yes" }),
      item("attention", "Necesitan atención", { attention: "yes" }),
      item("cruce-hoy", "Cruzan hoy", {
        dateField: "cruce_usa_fecha",
        period: "today",
      }),
      item("cruce-semana", "Cruzan esta semana", {
        dateField: "cruce_usa_fecha",
        period: "next7",
      }),
      item("done", "Entregadas", { lifecycle: "delivered" }),
      item("cancelada", "Canceladas / finalizadas", { lifecycle: "closed" }),
    ],
  };
}
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDay(value) {
  if (!datePattern.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
/** Validación compartida por el editor y el adaptador. Nunca ejecuta expresiones del usuario. */
export function validateConfig(value) {
  const result = structuredClone(value);
  if (
    !result ||
    result.schema !== 1 ||
    !Array.isArray(result.items) ||
    result.items.length < 1 ||
    result.items.length > MAX_VIEWS
  )
    throw Error("El menú admite entre 1 y 30 vistas.");
  const ids = new Set(),
    names = new Set();
  for (const view of result.items) {
    if (
      !view ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(view.id) ||
      ids.has(view.id)
    )
      throw Error("Hay una vista repetida o no válida.");
    ids.add(view.id);
    view.name = String(view.name ?? "").trim();
    if (!view.name || view.name.length > 60 || names.has(textKey(view.name)))
      throw Error(
        "Cada vista necesita un nombre distinto de hasta 60 caracteres.",
      );
    names.add(textKey(view.name));
    if (
      typeof view.visible !== "boolean" ||
      !choices.layout.some(([id]) => id === view.layout)
    )
      throw Error("Revisa la visibilidad y presentación de la vista.");
    const r = view.rules;
    if (!r || typeof r !== "object" || Array.isArray(r))
      throw Error("Faltan las condiciones de la vista.");
    for (const key of ["lifecycle", "pickup", "dateField", "period"])
      if (!choices[key].some(([id]) => id === r[key]))
        throw Error("Revisa las condiciones de " + view.name + ".");
    for (const key of ["pod", "punctual", "attention", "notice"])
      if (!choices.flag.some(([id]) => id === r[key]))
        throw Error("Revisa los pendientes de " + view.name + ".");
    for (const [key, max, length] of [
      ["statuses", 50, 100],
      ["clients", 100, 200],
    ]) {
      if (
        !Array.isArray(r[key]) ||
        r[key].length > max ||
        r[key].some(
          (v) => typeof v !== "string" || !v.trim() || v.length > length,
        )
      )
        throw Error("Revisa los clientes o estatus de " + view.name + ".");
      r[key] = [...new Map(r[key].map((v) => [textKey(v), v.trim()])).values()];
    }
    if (typeof r.search !== "string" || r.search.length > 200)
      throw Error("La búsqueda admite hasta 200 caracteres.");
    if (
      typeof r.start !== "string" ||
      typeof r.end !== "string" ||
      (r.start && !validDay(r.start)) ||
      (r.end && !validDay(r.end))
    )
      throw Error("Revisa las fechas de " + view.name + ".");
    if (
      r.period === "custom" &&
      ((!r.start && !r.end) || (r.start && r.end && r.end < r.start))
    )
      throw Error("Indica Desde o Hasta; Hasta no puede ser anterior a Desde.");
    if (
      view.sort !== null &&
      (!view.sort ||
        ![
          "load",
          "customer",
          "origin_city",
          "dest_city",
          "pickup_appt",
          "delivery_appt",
          "truck",
          "trailer",
          "status",
        ].includes(view.sort.col) ||
        ![1, -1].includes(view.sort.dir))
    )
      throw Error("El orden de la vista no es válido.");
  }
  if (BUILTIN_IDS.some((id) => !ids.has(id)))
    throw Error("Las vistas originales se pueden ocultar, pero no eliminar.");
  if (!result.items.some((v) => v.id === "all" && v.visible))
    throw Error(
      "Conserva Todas en el menú para poder regresar a una vista general.",
    );
  if (!result.items.some((v) => v.id === result.defaultId && v.visible))
    throw Error("Elige una vista visible para abrir al entrar.");
  return result;
}
/** Mantener los accesos anteriores del navegador como opciones editables del nuevo menú. */
export function initialConfig(saved, legacy = []) {
  if (saved && Object.keys(saved).length) return validateConfig(saved);
  const config = defaultConfig();
  if (!Array.isArray(legacy)) return config;
  for (const [index, old] of legacy.entries()) {
    if (config.items.length >= MAX_VIEWS || !old?.nombre) continue;
    const base =
      config.items.find((v) => v.id === old.filtro) || config.items[0];
    let name = String(old.nombre).trim().slice(0, 50);
    if (!name) continue;
    if (config.items.some((v) => textKey(v.name) === textKey(name)))
      name += " (guardada " + (index + 1) + ")";
    const sortKeys = {
      origin: "origin_city",
      dest: "dest_city",
      pickup: "pickup_appt",
      delivery: "delivery_appt",
    };
    const col = sortKeys[old.orden?.col] || old.orden?.col;
    config.items.push({
      ...structuredClone(base),
      id: "saved-" + index,
      name,
      layout: ["table", "cards"].includes(old.vista) ? old.vista : "keep",
      sort: [
        "load",
        "customer",
        "origin_city",
        "dest_city",
        "pickup_appt",
        "delivery_appt",
        "truck",
        "trailer",
        "status",
      ].includes(col)
        ? { col, dir: old.orden.dir === -1 ? -1 : 1 }
        : null,
      rules: {
        ...structuredClone(base.rules),
        clients: old.cliente ? [old.cliente] : [],
        search: String(old.busqueda || "").slice(0, 200),
      },
    });
  }
  return validateConfig(config);
}
const mexico = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** Comparar días del centro de México evita mover una carga a otro día por la zona del navegador. */
export function mexicoDay(value) {
  if (!value) return "";
  if (typeof value === "string" && datePattern.test(value))
    return validDay(value) ? value : "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(
    mexico.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return parts.year + "-" + parts.month + "-" + parts.day;
}
const addDays = (day, count) =>
  new Date(Date.parse(day + "T12:00:00Z") + count * 86400000)
    .toISOString()
    .slice(0, 10);
export function lifecycle(row) {
  const s = textKey(row.status).replace(/[.]+$/, "");
  if (
    s === "cancelado" ||
    s === "cancelada" ||
    (s === "tonu" && marked(row.recargos_vg))
  )
    return "closed";
  if (
    ["delivered", "completed", "entregado", "completado"].includes(s) &&
    marked(row.pod_sent)
  )
    return "delivered";
  return "open";
}
/** AND entre condiciones; los clientes/estatus seleccionados admiten cualquiera de los marcados. */
export function matchesView(row, rules, now = new Date(), searchText = "") {
  if (!row || row.archived === true) return false;
  const r = rules,
    today = mexicoDay(now),
    pickup = mexicoDay(row.pickup_appt);
  if (r.lifecycle !== "all" && lifecycle(row) !== r.lifecycle) return false;
  if (r.pickup === "through_today" && pickup && pickup > today) return false;
  if (r.pickup === "future" && (!pickup || pickup <= today)) return false;
  if (r.pickup === "today" && pickup !== today) return false;
  if (r.pickup === "missing" && pickup) return false;
  if (
    r.statuses.length &&
    !r.statuses.some((s) => textKey(s) === textKey(row.status))
  )
    return false;
  if (
    r.clients.length &&
    !r.clients.some((s) => textKey(s) === textKey(row.customer))
  )
    return false;
  if (r.period !== "any") {
    const day = mexicoDay(row[r.dateField]);
    if (!day) return false;
    if (r.period === "today" && day !== today) return false;
    if (r.period === "next7" && (day < today || day > addDays(today, 6)))
      return false;
    if (r.period === "next30" && (day < today || day > addDays(today, 29)))
      return false;
    if (r.period === "past" && day >= today) return false;
    if (
      r.period === "custom" &&
      ((r.start && day < r.start) || (r.end && day > r.end))
    )
      return false;
  }
  for (const [rule, field] of [
    ["pod", "pod_sent"],
    ["punctual", "punctual_pending"],
    ["attention", "needs_attention"],
    ["notice", "client_notify_pending"],
  ])
    if (r[rule] !== "any" && marked(row[field]) !== (r[rule] === "yes"))
      return false;
  const haystack =
    searchText ||
    [
      "load",
      "customer",
      "origin_city",
      "origin_state",
      "dest_city",
      "dest_state",
      "truck",
      "trailer",
      "work_order",
      "status",
      "eta_note",
      "siguiente_movimiento",
    ]
      .map((k) => row[k] || "")
      .join(" ");
  return !r.search || textKey(haystack).includes(textKey(r.search));
}
export function describeView(view) {
  const r = view.rules,
    parts = [];
  const label = (key, id) => choices[key].find(([value]) => value === id)?.[1];
  if (r.lifecycle !== "all") parts.push(label("lifecycle", r.lifecycle));
  if (r.pickup !== "any") parts.push("Pickup: " + label("pickup", r.pickup));
  if (r.period !== "any")
    parts.push(
      label("dateField", r.dateField) +
        ": " +
        (r.period === "custom"
          ? [r.start || "sin inicio", r.end || "sin límite"].join(" a ")
          : label("period", r.period)),
    );
  if (r.statuses.length) parts.push("Estatus: " + r.statuses.join(", "));
  if (r.clients.length) parts.push("Clientes: " + r.clients.join(", "));
  for (const [key, label] of [
    ["pod", "POD"],
    ["punctual", "Pendiente puntual"],
    ["attention", "Requiere atención"],
    ["notice", "Pendiente de avisar"],
  ])
    if (r[key] !== "any")
      parts.push(label + ": " + (r[key] === "yes" ? "sí" : "no"));
  if (r.search) parts.push("Contiene: " + r.search);
  return parts.join(" · ") || "Todas tus cargas, sin condiciones adicionales.";
}
