import { escapeHtml as escape } from "../../ui/html.js";

const tabs = {
  operacion: "Operación",
  tracking: "Tracking",
  comunicacion: "Comunicación",
  documentos: "Documentos",
  incidencias: "Incidencias",
  historial: "Historial",
};
const documents = new Set([
  "bol",
  "doda",
  "entry",
  "sobre_listo",
  "pod_sent",
  "recargos_vg",
  "doc_status",
  "exportacion",
  "importacion",
  "pedimentos",
]);
const tracking = new Set([
  "tracking_link",
  "eta_note",
  "loaded_miles",
  "empty_miles",
  "rpm",
]);

/** Organiza el expediente existente en las seis pestañas del workspace original. */
export function mountLoadWorkspace(
  section,
  { row, initialTab = "operacion", onClose },
) {
  const source = section.firstElementChild;
  const toolbar = source.querySelector(".toolbar");
  const content = document.createElement("div");
  content.className = "workspace-body";
  const panels = {};
  for (const key of Object.keys(tabs)) {
    const panel = document.createElement("section");
    panel.dataset.workspacePanel = key;
    panel.className = "workspace-content";
    panel.setAttribute("role", "tabpanel");
    panel.id = "workspace-panel-" + key;
    panels[key] = panel;
    content.append(panel);
  }
  let destination = "operacion";
  for (const node of [...source.children]) {
    if (node === toolbar) continue;
    if (node.tagName === "H3")
      destination =
        {
          "Comunicaciones con el cliente": "comunicacion",
          Comentarios: "comunicacion",
          Incidencias: "incidencias",
          "Últimos cambios": "historial",
        }[node.textContent] || destination;
    if (node.id === "load-extra-actions") {
      panels.comunicacion.append(node);
      continue;
    }
    if (node.tagName === "DL") {
      const groups = {};
      for (const field of [...node.children]) {
        const key = documents.has(field.dataset.field)
          ? "documentos"
          : tracking.has(field.dataset.field)
            ? "tracking"
            : "operacion";
        groups[key] ??= document.createElement("dl");
        groups[key].className = "workspace-field-grid";
        groups[key].append(field);
      }
      for (const [key, group] of Object.entries(groups))
        panels[key].append(group);
    } else panels[destination].append(node);
  }
  const dialog = document.createElement("dialog");
  dialog.className = "workspace-backdrop";
  dialog.id = "load-workspace";
  dialog.setAttribute("aria-labelledby", "workspace-title");
  dialog.innerHTML = `<aside class="workspace-panel"><div class="workspace-head"><div class="workspace-head-row"><div><div class="workspace-kicker">Load Workspace</div><h2 class="workspace-title" id="workspace-title">Load ${escape(row.load)}</h2><div class="workspace-route">${escape(row.customer)} · ${escape(row.origin_city)} → ${escape(row.dest_city)}</div></div><div id="workspace-actions" class="workspace-follow"></div><button type="button" class="workspace-close" aria-label="Cerrar expediente">×</button></div></div><div class="workspace-tabs" role="tablist" aria-label="Secciones de la carga">${Object.entries(
    tabs,
  )
    .map(
      ([key, label]) =>
        `<button type="button" class="workspace-tab" role="tab" data-workspace-tab="${key}" id="workspace-tab-${key}" aria-controls="workspace-panel-${key}">${label}</button>`,
    )
    .join("")}</div><p id="workspace-message" role="alert"></p></aside>`;
  toolbar.querySelector("h2")?.remove();
  dialog.querySelector("#workspace-actions").append(...toolbar.children);
  dialog.querySelector("aside").append(content);
  section.replaceChildren(dialog);
  function selectTab(key) {
    for (const [name, panel] of Object.entries(panels)) {
      panel.hidden = name !== key;
      panel.setAttribute("aria-labelledby", "workspace-tab-" + name);
    }
    dialog.querySelectorAll('[role="tab"]').forEach((button) => {
      const selected = button.dataset.workspaceTab === key;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }
  const close = () => {
    dialog.close();
    document.documentElement.classList.remove("ws-open");
    onClose();
  };
  dialog.querySelector(".workspace-close").onclick = close;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog
    .querySelectorAll('[role="tab"]')
    .forEach(
      (button) =>
        (button.onclick = () => selectTab(button.dataset.workspaceTab)),
    );
  dialog
    .querySelector('[role="tablist"]')
    .addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const buttons = [...dialog.querySelectorAll('[role="tab"]')];
      const current = buttons.indexOf(document.activeElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (current +
                (event.key === "ArrowRight" ? 1 : -1) +
                buttons.length) %
              buttons.length;
      selectTab(buttons[next].dataset.workspaceTab);
      buttons[next].focus();
    });
  selectTab(tabs[initialTab] ? initialTab : "operacion");
  document.documentElement.classList.add("ws-open");
  dialog.showModal();
}

/** El editor conserva sus controles, pero se presenta dentro del mismo panel lateral. */
export function mountEditorWorkspace(section, title, onClose) {
  const editor = section.firstElementChild;
  const dialog = document.createElement("dialog");
  dialog.className = "workspace-backdrop";
  dialog.innerHTML = `<aside class="workspace-panel"><div class="workspace-head"><div class="workspace-head-row"><div><div class="workspace-kicker">Load Workspace</div><h2 class="workspace-title">${escape(title)}</h2></div><button type="button" class="workspace-close" aria-label="Cerrar editor">×</button></div></div><p id="workspace-message" role="alert"></p><div class="workspace-body"></div></aside>`;
  dialog.querySelector(".workspace-body").append(editor);
  section.replaceChildren(dialog);
  const close = () => {
    dialog.close();
    document.documentElement.classList.remove("ws-open");
    onClose();
  };
  dialog.querySelector(".workspace-close").onclick = close;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  document.documentElement.classList.add("ws-open");
  dialog.showModal();
}
