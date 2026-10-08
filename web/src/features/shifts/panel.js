import { escapeHtml as escape } from "../../ui/html.js";
import {
  createPanelController,
  personOptions,
  personName,
  formatDate,
} from "../../ui/panel.js";
import { localDateInput, toISO, attentionFor } from "../../load-rules.js";

const stateLabels = {
  open: "Pendiente",
  resolved: "Resuelto",
  cancelled: "Cancelado",
};
const colors = {
  "": "Sin marca",
  critical: "Crítico",
  warn: "Atención",
  good: "En orden",
  info: "Informativo",
  purple: "Morado",
  teal: "Turquesa",
  pink: "Rosa",
  brown: "Café",
  slate: "Gris",
};

/** Bitácora con asignación a personas o a quienes dan seguimiento a un operador. */
export function createShiftsPanel({
  container,
  service,
  loads,
  people,
  role,
  userId,
  onOpenLoad,
  onError,
}) {
  const view = createPanelController(container, onError);
  let tasks = [],
    closures = [],
    filter = "open";
  const writable = ["admin", "csr"].includes(role);

  function open() {
    return view.load(
      () => Promise.all([service.list(), service.closures()]),
      (data) => {
        [tasks, closures] = data;
        render();
      },
    );
  }
  function render() {
    const visible = tasks.filter(
      (task) => filter === "all" || task.state === filter,
    );
    container.innerHTML = `
      <section class="card"><div class="toolbar"><h2>Bitácora de turno</h2>
        ${writable ? '<button id="shift-new">Nuevo pendiente de turno</button><button id="closure-new">Preparar cierre</button>' : ""}
        <button id="shift-refresh">Actualizar</button></div>
        <div class="filters">${[
          ["open", "Pendientes"],
          ["resolved", "Resueltos"],
          ["cancelled", "Cancelados"],
          ["all", "Histórico"],
        ]
          .map(
            ([key, label]) =>
              `<button data-shift-filter="${key}" aria-pressed="${filter === key}">${label}</button>`,
          )
          .join("")}</div>
        <ul>${
          visible
            .map(
              (task) => `<li>
          <strong>${escape(task.load || "Nota general")} · ${stateLabels[task.state]}</strong>
          <p class="preserve-lines">${escape(task.note)}</p>
          <p>Asignado a: ${escape(task.assigned_to ? personName(people, task.assigned_to) : "Quien dé seguimiento a " + personName(people, task.assigned_csr))}</p>
          <small>${escape(task.shift)} · ${escape(formatDate(task.created_at))} · ${escape(personName(people, task.created_by))}</small>
          ${task.follow_up_at ? `<p class="${task.state === "open" && Date.parse(task.follow_up_at) <= Date.now() ? "badge warn" : ""}">Seguimiento: ${escape(formatDate(task.follow_up_at))}</p>` : ""}
          ${task.color ? `<span class="badge color-${escape(task.color)}">${colors[task.color]}</span>` : ""}
          <button data-task="${escape(task.id)}">Abrir pendiente</button>
        </li>`,
            )
            .join("") || "<li>No hay pendientes con este filtro.</li>"
        }</ul>
      </section><section id="shift-detail"></section>
      <section class="card"><h2>Cierres de turno</h2><ul>${
        closures
          .map(
            (closure) => `<li>
        <strong>${escape(personName(people, closure.created_by))} · ${escape(closure.shift)}</strong>
        <small class="block">${escape(formatDate(closure.created_at))}</small><p class="preserve-lines">${escape(closure.body)}</p>
      </li>`,
          )
          .join("") || "<li>Sin cierres registrados.</li>"
      }</ul></section>
    `;
    container.querySelector("#shift-refresh").onclick = open;
    container
      .querySelector("#shift-new")
      ?.addEventListener("click", () => editor());
    container
      .querySelector("#closure-new")
      ?.addEventListener("click", closureEditor);
    container.querySelectorAll("[data-shift-filter]").forEach(
      (button) =>
        (button.onclick = () => {
          filter = button.dataset.shiftFilter;
          render();
        }),
    );
    container
      .querySelectorAll("[data-task]")
      .forEach(
        (button) => (button.onclick = () => detail(button.dataset.task)),
      );
  }
  function detail(id) {
    return view.load(
      () => Promise.all([service.get(id), service.history(id)]),
      ([task, history]) => {
        const section = container.querySelector("#shift-detail");
        section.innerHTML = `<div class="card"><h2>${escape(task.load || "Nota general")}</h2>
        <p class="preserve-lines">${escape(task.note)}</p><p>${stateLabels[task.state]}</p>
        ${task.load ? '<button id="shift-open-load">Abrir carga</button>' : ""}
        ${
          writable && task.state !== "cancelled"
            ? `<div class="toolbar">
          ${task.state === "open" ? '<button id="shift-edit">Editar</button>' : ""}
          <button data-task-state="${task.state === "open" ? "resolved" : "open"}">${task.state === "open" ? "Marcar resuelto" : "Reabrir"}</button>
          <button data-task-state="cancelled">Cancelar pendiente</button>
        </div>`
            : ""
        }
        <h3>Historial</h3><ul>${history
          .map(
            (
              item,
            ) => `<li>${escape({ created: "Creado", edited: "Editado", open: "Reabierto", resolved: "Resuelto", cancelled: "Cancelado" }[item.event] || item.event)}
          <small class="block">${escape(formatDate(item.changed_at))} · ${escape(personName(people, item.actor))}</small></li>`,
          )
          .join("")}</ul></div>`;
        section
          .querySelector("#shift-edit")
          ?.addEventListener("click", () => editor(task));
        section
          .querySelector("#shift-open-load")
          ?.addEventListener("click", () => onOpenLoad(task.load));
        section.querySelectorAll("[data-task-state]").forEach(
          (button) =>
            (button.onclick = () =>
              view.run(button, async () => {
                await service.setState(task, button.dataset.taskState);
                filter = button.dataset.taskState;
                await open();
              })),
        );
        section.scrollIntoView({ behavior: "smooth" });
      },
    );
  }
  function editor(previous = null) {
    view.invalidate();
    const section = container.querySelector("#shift-detail");
    section.innerHTML = `<div class="card"><h2>${previous ? "Editar pendiente" : "Nuevo pendiente de turno"}</h2>
      <form id="shift-editor"><label>Nota<textarea name="note" required maxlength="9500">${escape(previous?.note)}</textarea></label>
        <div class="grid"><label>Asignar a persona<select name="assigned_to">${personOptions(people, previous?.assigned_to, "Sin asignación directa")}</select></label>
          <label>O para quien dé seguimiento a este operador<select name="assigned_csr">${personOptions(people, previous?.assigned_csr, "Sin operador de seguimiento")}</select></label>
          <label>Marca<select name="color">${Object.entries(colors)
            .map(
              ([key, label]) =>
                `<option value="${key}" ${key === previous?.color ? "selected" : ""}>${label}</option>`,
            )
            .join("")}</select></label>
          <label>Fecha de seguimiento<input name="follow_up_at" type="datetime-local" value="${localDateInput(previous?.follow_up_at)}"></label>
        </div>
        <label>${previous ? "Carga" : "Cargas (opcional; puedes seleccionar varias)"}<select name="${previous ? "load" : "loads"}" ${previous ? "" : "multiple"}>
          ${previous ? '<option value="">Nota general</option>' : ""}
          ${previous?.load && !loads.some((load) => load.load === previous.load) ? `<option value="${escape(previous.load)}" selected>${escape(previous.load)} · Expediente archivado</option>` : ""}
          ${loads.map((load) => `<option value="${escape(load.load)}" ${load.load === previous?.load ? "selected" : ""}>${escape(load.load)} · ${escape(load.customer)}</option>`).join("")}
        </select></label><button>Guardar pendiente</button>
      </form></div>`;
    section.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const values = Object.fromEntries(formData);
      values.note = values.note.trim();
      // Lee la selección múltiple explícitamente; al editar se usa el campo load.
      values.loads = [
        ...(event.target.elements.loads?.selectedOptions || []),
      ].map((option) => option.value);
      if (!values.assigned_to && !values.assigned_csr)
        return onError("Selecciona a quién asignar el pendiente.");
      view.run(event.target.querySelector("button"), async () => {
        if (values.follow_up_at === localDateInput(previous?.follow_up_at))
          values.follow_up_at = previous?.follow_up_at || null;
        else values.follow_up_at = toISO(values.follow_up_at) || null;
        await service.save(values, previous);
        filter = "open";
        await open();
      });
    };
    section.scrollIntoView({ behavior: "smooth" });
  }
  function closureEditor() {
    view.invalidate();
    const relevant = loads.filter((load) => attentionFor(load));
    const lines = relevant.map(
      (load) =>
        `${load.load} · ${load.customer} · ${load.status}\n${attentionFor(load)}`,
    );
    const body = `Cierre de turno · ${personName(people, userId)}\n\n${lines.join("\n\n") || "Sin cargas pendientes de atención."}`;
    const section = container.querySelector("#shift-detail");
    section.innerHTML = `<div class="card"><h2>Preparar cierre de turno</h2><p>Revisa y ajusta el resumen antes de guardarlo.</p>
      <form><label>Resumen<textarea name="body" required maxlength="20000" rows="12">${escape(body)}</textarea></label><button>Guardar cierre</button></form></div>`;
    section.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const text = new FormData(event.target).get("body").trim();
      view.run(event.target.querySelector("button"), async () => {
        await service.saveClosure(text);
        await open();
      });
    };
    section.scrollIntoView({ behavior: "smooth" });
  }
  return { open, dispose: view.dispose };
}
