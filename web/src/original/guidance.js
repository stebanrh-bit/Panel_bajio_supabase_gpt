/** Presentación de fechas. Vencer cambia la prioridad; nunca borra una tarea o sus datos. */
export function reminderEntries(rows, now, config) {
  const entries = [];
  const marked = (value) =>
    !["", "false", "0", "no", "null"].includes(
      String(value ?? "")
        .toLowerCase()
        .trim(),
    );
  for (const row of rows) {
    if (
      row.archived ||
      (config.DONE_STATUSES.includes(row.status) && marked(row.pod_sent)) ||
      /^cancelad/i.test(row.status) ||
      (row.status === "TONU" && marked(row.recargos_vg))
    )
      continue;
    function add(kind, label, when, note = "") {
      const time = Date.parse(when);
      const state = Number.isFinite(time)
        ? time <= now
          ? "vencido"
          : "programado"
        : "sinfecha";
      entries.push({
        row,
        kind,
        label,
        when,
        note,
        state,
        needsAction: state !== "programado",
        time: Number.isFinite(time) ? time : -Infinity,
      });
    }
    if (config.AUTO_REVIEW_STATUSES.includes(row.status))
      add("transit", "Revisión de tránsito", row.recordatorio_fecha);
    else if (config.REMINDER_STATUSES.includes(row.status))
      add(
        "status",
        row.status === "Patio permisionario"
          ? "Despacho estimado"
          : "Recordatorio por estatus",
        row.recordatorio_fecha,
      );
    if (row.next_review_at)
      add(
        "personal",
        "Seguimiento programado por ti",
        row.next_review_at,
        row.next_review_note,
      );
  }
  return entries.sort(
    (a, b) => Number(b.needsAction) - Number(a.needsAction) || a.time - b.time,
  );
}

/** Un aviso del servidor puede quedar en caché. Solo sigue vigente para el mismo plazo pendiente. */
export function currentLoadReviewAlert(alert, record, now, config) {
  if (
    !record ||
    alert.kind !== "load_review" ||
    String(alert.load) !== String(record.load) ||
    !alert.recipient
  )
    return null;
  return (
    reminderEntries([record], now, config).find((entry) => {
      if (
        !Number.isFinite(Date.parse(entry.when)) ||
        Date.parse(entry.when) > now
      )
        return false;
      const kind =
        entry.kind === "personal"
          ? "seguimiento_personal"
          : "revision_operativa";
      return (
        alert.dedupe_key ===
        `review:${record.load}:${kind}:${entry.when}:${alert.recipient}`
      );
    }) || null
  );
}

/** Nombres visibles junto a los iconos; conserva los eventos y destinos originales. */
export function mountGuidance(doc) {
  const labels = [
    ['[data-page="home"]', "Inicio"],
    ['[data-page="operation"]', "Cargas"],
    ['[data-page="calendario"]', "Calendario"],
    ['[data-page="indicadores"]', "Indicadores"],
    ['[data-page-scroll="home:group-pendientes"]', "Solicitudes"],
    ['[data-page-scroll="home:group-bitacora"]', "Tareas de turno"],
    ['[data-page="apartados"]', "Apartados"],
    ['[data-page="radar"]', "Radar"],
    ["#who-toggle-btn", "Mi vista"],
    ["#sidebar-historico-btn", "Histórico de tareas"],
    ["#sidebar-manage-csr-btn", "Administrar"],
  ];
  for (const [selector, label] of labels) {
    const button = doc.querySelector("#sidebar " + selector);
    if (!button || button.querySelector(".nav-label")) continue;
    const text = doc.createElement("span");
    text.className = "nav-label";
    text.textContent = label;
    button.append(text);
    button.setAttribute("aria-label", label);
  }
  doc.querySelectorAll("[data-kpi-detail]").forEach((button) => {
    if (button.dataset.keyboardReady) return;
    button.dataset.keyboardReady = "true";
    button.tabIndex = 0;
    button.setAttribute("role", "button");
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        button.click();
      }
    });
  });
}
