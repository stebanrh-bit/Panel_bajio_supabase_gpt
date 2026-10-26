import { escapeHtml as esc } from "../content.js";
import { field, select } from "../dialogs.js";
import { validateForm } from "../validation.js";
import {
  MAX_VIEWS,
  BUILTIN_IDS,
  choices,
  defaultConfig,
  emptyRules,
  textKey,
  validateConfig,
  matchesView,
  describeView,
} from "./rules.js";

/** Un borrador por diálogo. Cancelar no guarda; un rechazo conserva todos los campos. */
export function editMenu({
  config,
  clients,
  statuses,
  getRows,
  save,
  initialId,
  doc = document,
}) {
  return new Promise((resolve) => {
    let draft = structuredClone(config),
      selected = initialId || draft.defaultId,
      busy = false;
    const previous = doc.activeElement,
      dialog = doc.createElement("dialog");
    dialog.className = "load-views-dialog";
    const title = "load-views-" + crypto.randomUUID();
    dialog.setAttribute("aria-labelledby", title);
    dialog.innerHTML = `<form novalidate data-managed-validation><header><div><h2 id="${title}">Configurar Mostrar</h2><p>Elige una opción y define qué cargas debe mostrar.</p></div><button type="button" data-close aria-label="Cerrar configuración">×</button></header><div class="load-views-layout"><aside><div class="load-views-list" role="group" aria-label="Vistas del menú"></div><button type="button" data-add-view>+ Agregar nueva</button></aside><section class="load-view-editor"></section></div><p class="load-views-error" role="alert"></p><footer><button type="button" data-close>Cancelar</button><button type="submit">Guardar menú</button></footer></form>`;
    const form = dialog.querySelector("form"),
      editor = dialog.querySelector(".load-view-editor"),
      list = dialog.querySelector(".load-views-list"),
      error = dialog.querySelector('[role="alert"]');
    const current = () => draft.items.find((v) => v.id === selected);
    const checkbox = (name, label, checked, attrs = "") =>
      `<label class="load-view-check"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} ${attrs}>${esc(label)}</label>`;
    const checks = (name, label, options, values) =>
      `<fieldset class="load-view-checks"><legend>${esc(label)}</legend><p>Sin marcar = todos.</p><div>${
        options
          .map((value) =>
            checkbox(
              name,
              value,
              values.some((v) => textKey(v) === textKey(value)),
              `value="${esc(value)}"`,
            ),
          )
          .join("") || "<span>No hay opciones registradas.</span>"
      }</div></fieldset>`;
    const options = (supplied, saved) =>
      [
        ...new Map(
          [...supplied, ...saved]
            .filter(Boolean)
            .map((value) => [textKey(value), value]),
        ).values(),
      ].sort((a, b) => a.localeCompare(b, "es"));
    function drawList() {
      // Reutilizar botones evita perder el clic al salir del campo Nombre.
      const existing = new Map(
        [...list.children].map((button) => [button.dataset.editView, button]),
      );
      let position = 0;
      for (const view of draft.items) {
        let button = existing.get(view.id);
        if (!button) {
          button = doc.createElement("button");
          button.type = "button";
          button.dataset.editView = view.id;
          button.append(doc.createElement("span"), doc.createElement("small"));
        }
        button.setAttribute("aria-pressed", String(view.id === selected));
        button.querySelector("span").textContent = view.name || "Sin nombre";
        button.querySelector("small").textContent =
          view.id === draft.defaultId
            ? "Al entrar"
            : view.visible
              ? "Visible"
              : "Oculta";
        if (list.children[position] !== button)
          list.insertBefore(button, list.children[position] || null);
        position++;
        existing.delete(view.id);
      }
      for (const button of existing.values()) button.remove();
      dialog.querySelector("[data-add-view]").disabled =
        draft.items.length >= MAX_VIEWS;
    }
    function drawEditor() {
      const v = current(),
        r = v.rules;
      editor.innerHTML = `<div class="load-view-top">${field("name", "Nombre", "text", v.name, 'required maxlength="60"')}<div class="load-view-order"><button type="button" data-move-view="-1" aria-label="Subir esta vista">↑</button><button type="button" data-move-view="1" aria-label="Bajar esta vista">↓</button></div></div><div class="load-view-toggles">${checkbox("visible", "Mostrar en el menú", v.visible)}${checkbox("default", "Abrir esta vista al entrar", v.id === draft.defaultId)}</div><div class="load-view-grid">${select("lifecycle", "Qué cargas incluir", choices.lifecycle, r.lifecycle)}${select("pickup", "Fecha de Pickup", choices.pickup, r.pickup)}${select("layout", "Presentación", choices.layout, v.layout)}</div><details class="load-view-more"><summary>Estatus y clientes</summary><div class="load-view-grid">${checks("statuses", "Estatus", options(statuses, r.statuses), r.statuses)}${checks("clients", "Clientes", options(clients, r.clients), r.clients)}</div></details><details class="load-view-more" ${r.period !== "any" ? "open" : ""}><summary>Periodo de Pickup, entrega o cruce</summary><div class="load-view-grid">${select("dateField", "Fecha a revisar", choices.dateField, r.dateField)}${select("period", "Periodo", choices.period, r.period)}<div class="load-view-dates">${field("start", "Desde", "date", r.start)}${field("end", "Hasta", "date", r.end)}</div></div></details><details class="load-view-more"><summary>Pendientes, POD y búsqueda</summary><div class="load-view-grid">${select("pod", "POD registrado", choices.flag, r.pod)}${select("punctual", "Pendiente puntual", choices.flag, r.punctual)}${select("attention", "Necesita atención", choices.flag, r.attention)}${select("notice", "Pendiente de avisar al cliente", choices.flag, r.notice)}${field("search", "Texto que debe contener", "text", r.search, 'maxlength="200"')}</div></details><div class="load-view-preview" role="status"></div><div class="load-view-tools">${BUILTIN_IDS.includes(v.id) ? '<button type="button" data-reset-view>Restaurar esta opción</button>' : '<button type="button" data-delete-view>Eliminar esta opción</button>'}</div>`;
      editor.querySelector('[name="visible"]').disabled = v.id === "all";
      editor.querySelector('[data-move-view="-1"]').disabled =
        draft.items.indexOf(v) === 0;
      editor.querySelector('[data-move-view="1"]').disabled =
        draft.items.indexOf(v) === draft.items.length - 1;
      preview();
    }
    function collect() {
      const v = current(),
        data = new FormData(form);
      v.name = String(data.get("name") || "").trim();
      v.visible = v.id === "all" || data.has("visible");
      v.layout = data.get("layout");
      for (const key of [
        "lifecycle",
        "pickup",
        "dateField",
        "period",
        "start",
        "end",
        "pod",
        "punctual",
        "attention",
        "notice",
        "search",
      ])
        v.rules[key] = String(
          ["start", "end"].includes(key)
            ? editor.querySelector('[name="' + key + '"]').value
            : data.get(key) || "",
        );
      v.rules.statuses = data.getAll("statuses");
      v.rules.clients = data.getAll("clients");
      if (data.has("default")) {
        v.visible = true;
        draft.defaultId = v.id;
        editor.querySelector('[name="visible"]').checked = true;
      } else if (draft.defaultId === v.id) draft.defaultId = "all";
      if (
        !draft.items.some((item) => item.id === draft.defaultId && item.visible)
      )
        draft.defaultId = "all";
      return v;
    }
    function preview() {
      const v = collect(),
        custom = v.rules.period === "custom";
      editor.querySelector(".load-view-dates").hidden = !custom;
      for (const field of editor.querySelectorAll(".load-view-dates input"))
        field.disabled = !custom;
      const rows = getRows(),
        count = rows.filter((row) =>
          matchesView(row, v.rules, new Date(), row.view_search_text),
        ).length;
      const box = editor.querySelector(".load-view-preview");
      box.replaceChildren();
      const strong = doc.createElement("strong");
      strong.textContent = count + " de " + rows.length + " cargas coinciden";
      const text = doc.createElement("p");
      text.textContent = describeView(v);
      box.append(strong, text);
    }
    function ready() {
      collect();
      if (!validateForm(form)) return false;
      try {
        validateConfig(draft);
        error.textContent = "";
        return true;
      } catch (err) {
        error.textContent = err.message;
        return false;
      }
    }
    const resetListener = (event) => {
      if (event.detail?.phase === "reset") close(null, true);
    };
    function close(result = null, force = false) {
      if (busy && !force) return;
      window.removeEventListener("panel:save", resetListener);
      dialog.close();
      dialog.remove();
      if (previous?.isConnected) previous.focus();
      resolve(result);
    }
    dialog
      .querySelectorAll("[data-close]")
      .forEach((button) => (button.onclick = () => close()));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    editor.addEventListener("input", preview);
    editor.addEventListener("change", () => {
      preview();
      drawList();
    });
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-edit-view]");
      if (!button || busy || !ready()) return;
      selected = button.dataset.editView;
      drawList();
      drawEditor();
    });
    dialog.addEventListener("click", (event) => {
      if (busy) return;
      if (event.target.closest("[data-add-view]")) {
        if (!ready() || draft.items.length >= MAX_VIEWS) return;
        let number = 1;
        while (
          draft.items.some(
            (v) => textKey(v.name) === textKey("Nueva vista " + number),
          )
        )
          number++;
        const v = {
          id: "view-" + crypto.randomUUID(),
          name: "Nueva vista " + number,
          visible: true,
          rules: emptyRules(),
          layout: "keep",
          sort: null,
        };
        draft.items.push(v);
        selected = v.id;
        drawList();
        drawEditor();
        editor.querySelector('[name="name"]').select();
      }
      const move = event.target.closest("[data-move-view]");
      if (move && ready()) {
        const index = draft.items.findIndex((v) => v.id === selected),
          destination = index + Number(move.dataset.moveView);
        if (destination < 0 || destination >= draft.items.length) return;
        const [item] = draft.items.splice(index, 1);
        draft.items.splice(destination, 0, item);
        drawList();
        drawEditor();
      }
      if (event.target.closest("[data-reset-view]")) {
        const original = defaultConfig().items.find((v) => v.id === selected);
        draft.items[draft.items.findIndex((v) => v.id === selected)] = original;
        error.textContent = "";
        drawList();
        drawEditor();
      }
      if (event.target.closest("[data-delete-view]")) {
        draft.items = draft.items.filter((v) => v.id !== selected);
        if (draft.defaultId === selected) draft.defaultId = "all";
        selected = draft.defaultId;
        error.textContent = "";
        drawList();
        drawEditor();
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || !ready()) return;
      busy = true;
      const controls = [...dialog.querySelectorAll("button,input,select")],
        disabled = controls.map((c) => c.disabled);
      controls.forEach((c) => (c.disabled = true));
      try {
        const result = await save(validateConfig(draft));
        busy = false;
        close(result);
      } catch (err) {
        if (!dialog.isConnected) return;
        error.textContent = err.message;
        busy = false;
        controls.forEach((c, i) => (c.disabled = disabled[i]));
      }
    });
    drawList();
    drawEditor();
    doc.body.append(dialog);
    dialog.showModal();
    window.addEventListener("panel:save", resetListener);
    editor.querySelector('[name="name"]').focus();
  });
}
