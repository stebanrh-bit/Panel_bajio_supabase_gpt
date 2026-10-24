import { escapeHtml as esc } from "../content.js";

export const instructionStages = (flow) =>
  flow === "import"
    ? [
        ["origin", "Cliente de origen"],
        ["transit", "Tránsito en USA"],
        ["us_yard", "Yarda USA"],
        ["customs", "Agente aduanal"],
        ["mx_yard", "Yarda MX después del cruce"],
        ["destination", "Cliente final"],
      ]
    : [
        ["origin", "Planta del cliente"],
        ["mx_yard", "Patio permisionario / Yarda MX"],
        ["us_yard", "Yarda USA"],
        ["destination", "Cliente final"],
      ];
export const requirementLabels = {
  bol: "BOL",
  doda: "DODA",
  entry: "Entry",
  sobre_listo: "Sobre de documentos",
  cruce_confirmado: "Cruce confirmado",
  condition: "Condición de la etapa",
  special_status: "Resolver el estatus especial de la carga",
};
export const instructionStateLabels = {
  ready: "Por atender",
  waiting: "En espera",
  undefined: "Instrucción por definir",
  waiting_date: "Falta fecha de atención",
  completed: "Atendida",
  stage_unconfirmed: "Etapa por confirmar",
  route_changed: "Revisar cambio de ruta",
  no_template: "Instructivo por definir",
  finished: "Seguimiento finalizado",
};

/** La campana solo considera la instrucción vigente y respeta la fecha de atención. */
export function instructionNotice(record, now = Date.now()) {
  const context = record.instruction_context || {};
  if (context.state === "no_template") {
    const route = [
      record.customer,
      record.origin_city,
      record.origin_state,
      record.dest_city,
      record.dest_state,
    ]
      .map((v) =>
        String(v || "")
          .trim()
          .toLowerCase(),
      )
      .join("|");
    return {
      id: "instruction-missing:" + route,
      tipo: "instruction",
      sev: "warn",
      load: String(record.load),
      tab: "operacion",
      titulo: "Instructivo por definir · " + (record.customer || "Ruta"),
      detalle:
        "Registra las instrucciones una vez para esta ruta: " +
        (record.origin_city || "Origen") +
        " → " +
        (record.dest_city || "Destino"),
    };
  }
  if (
    ![
      "ready",
      "waiting",
      "undefined",
      "stage_unconfirmed",
      "route_changed",
    ].includes(context.state) ||
    context.mode === "next"
  )
    return null;
  if (
    context.notify_at &&
    (!Number.isFinite(Date.parse(context.notify_at)) ||
      Date.parse(context.notify_at) > now)
  )
    return null;
  return {
    id:
      "instruction:" +
      record.load +
      ":" +
      (context.event_key || context.changed_at || context.state),
    tipo: "instruction",
    sev: "warn",
    load: String(record.load),
    tab: "operacion",
    titulo: instructionStateLabels[context.state] + " · Carga " + record.load,
    detalle: context.action || "Abre la carga para revisar qué sigue.",
  };
}
const button = (record, action, text) =>
  '<button type="button" class="file-btn file-btn-sec" data-instruction-action="' +
  action +
  '" data-instruction-load="' +
  esc(record.load) +
  '" data-instruction-key="' +
  esc(record.instruction_context?.stage_key || "") +
  '">' +
  text +
  "</button>";
export function instructionLine(record) {
  const c = record.instruction_context || {};
  if (!c.state || ["no_template", "finished", "completed"].includes(c.state))
    return "";
  return (
    '<button type="button" class="instruction-list-line" data-instruction-open="' +
    esc(record.load) +
    '"><strong>' +
    esc(
      c.mode === "next"
        ? "Próximo punto"
        : instructionStateLabels[c.state] || "Siguiente acción",
    ) +
    ":</strong> " +
    esc(c.action || c.stage_label || "Revisar instructivo") +
    "</button>"
  );
}
function instructionDate(value) {
  return Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Mexico_City",
      }).format(new Date(value))
    : "Fecha por confirmar";
}
export function instructionCard(record) {
  const c = record.instruction_context || {},
    state = c.state || "no_template";
  if (state === "finished") return "";
  if (state === "no_template")
    return (
      '<details class="instruction-card instruction-empty"><summary>Instructivo por definir</summary><p>Registra las instrucciones una vez por cliente y ruta. Las cargas siguientes las recibirán automáticamente.</p><div class="instruction-actions">' +
      button(record, "propose", "Crear instructivo para esta ruta") +
      button(record, "apply", "Buscar instructivo aprobado") +
      "</div></details>"
    );
  const blockers = (c.missing || []).map(
    (key) => requirementLabels[key] || "Requisito por confirmar",
  );
  return (
    '<section class="instruction-card state-' +
    esc(state) +
    '"><div class="instruction-heading"><h3>Qué hacer ahora</h3><span>' +
    esc(instructionStateLabels[state] || state) +
    '</span></div><p class="instruction-stage">' +
    esc(
      (c.mode === "next" ? "Al llegar a: " : "Etapa: ") +
        (c.stage_label || "Por confirmar"),
    ) +
    "</p>" +
    '<p class="instruction-action">' +
    esc(c.action || "Faltan instrucciones aprobadas para este punto.") +
    "</p>" +
    (c.condition
      ? "<p><strong>Para avanzar:</strong> " + esc(c.condition) + "</p>"
      : "") +
    (blockers.length
      ? '<p class="instruction-blockers"><strong>Pendiente:</strong> ' +
        esc(blockers.join(" · ")) +
        "</p>"
      : "") +
    (c.on_issue
      ? "<details><summary>Si ocurre un problema</summary><p>" +
        esc(c.on_issue) +
        "</p>" +
        "</details>"
      : "") +
    (c.contact
      ? "<p><strong>Contacto / referencia:</strong> " + esc(c.contact) + "</p>"
      : "") +
    (c.notify_at
      ? '<p class="instruction-source">Avisarme: ' +
        esc(instructionDate(c.notify_at)) +
        "</p>"
      : "") +
    (c.exception
      ? '<p class="instruction-exception"><strong>Excepción de esta carga:</strong> ' +
        esc(c.exception) +
        "</p>"
      : "") +
    '<div class="instruction-actions">' +
    button(record, "open", "Ver recorrido") +
    (state === "ready" && c.mode !== "next"
      ? button(record, "complete", "Marcar atendida")
      : "") +
    (state === "completed"
      ? button(record, "reopen", "Reabrir seguimiento")
      : "") +
    (c.condition && (c.missing || []).includes("condition")
      ? button(record, "condition", "Confirmar condición")
      : "") +
    '</div><p class="instruction-source">Instructivo: ' +
    esc(c.template || "Ruta") +
    "</p></section>"
  );
}
