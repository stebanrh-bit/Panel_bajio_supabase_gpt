import { escapeHtml as escape } from "../../ui/html.js";
import { createPanelController } from "../../ui/panel.js";

/** Las plantillas pertenecen al usuario y se reutilizan al redactar avisos de cargas. */
export function createTemplatesPanel({ container, service, role, onError }) {
  const view = createPanelController(container, onError);
  const writable = ["admin", "csr"].includes(role);
  let templates = [];
  function open() {
    return view.load(service.templates, (rows) => {
      templates = rows;
      container.innerHTML = `<section class="card"><div class="toolbar"><h2>Mis plantillas</h2>${writable ? '<button id="template-new">Nueva plantilla</button>' : ""}</div>
        <p>Variables disponibles: {load}, {customer}, {status}, {origin}, {destination}, {truck}, {trailer}, {delivery}.</p>
        <ul>${
          templates
            .map(
              (
                record,
              ) => `<li><strong>${escape(record.title)}</strong><p class="preserve-lines">${escape(record.body)}</p>
          ${writable ? `<button data-template-edit="${escape(record.id)}">Editar</button><button data-template-delete="${escape(record.id)}">Eliminar</button>` : ""}</li>`,
            )
            .join("") || "<li>Aún no tienes plantillas.</li>"
        }</ul>
      </section><section id="template-detail"></section>`;
      container
        .querySelector("#template-new")
        ?.addEventListener("click", () => editor());
      container
        .querySelectorAll("[data-template-edit]")
        .forEach(
          (button) =>
            (button.onclick = () =>
              editor(
                templates.find(
                  (record) => record.id === button.dataset.templateEdit,
                ),
              )),
        );
      container.querySelectorAll("[data-template-delete]").forEach(
        (button) =>
          (button.onclick = () =>
            view.run(button, async () => {
              await service.deleteTemplate(
                templates.find(
                  (record) => record.id === button.dataset.templateDelete,
                ),
              );
              await open();
            })),
      );
    });
  }
  function editor(previous = null) {
    view.invalidate();
    const section = container.querySelector("#template-detail");
    section.innerHTML = `<div class="card"><h2>${previous ? "Editar plantilla" : "Nueva plantilla"}</h2><form>
      <label>Título<input name="title" required maxlength="100" value="${escape(previous?.title)}"></label>
      <label>Mensaje<textarea name="body" required maxlength="10000" rows="8">${escape(previous?.body)}</textarea></label>
      <button>Guardar plantilla</button></form></div>`;
    section.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      view.run(event.target.querySelector("button"), async () => {
        await service.saveTemplate(values.title.trim(), values.body, previous);
        await open();
      });
    };
    section.scrollIntoView({ behavior: "smooth" });
  }
  return { open, dispose: view.dispose };
}

/** Sustituye únicamente variables conocidas; conserva otras llaves literales del texto. */
export function fillTemplate(body, load) {
  const values = {
    load: load.load,
    customer: load.customer,
    status: load.status,
    origin: [load.origin_city, load.origin_state].filter(Boolean).join(", "),
    destination: [load.dest_city, load.dest_state].filter(Boolean).join(", "),
    truck: load.truck,
    trailer: load.trailer,
    delivery: load.delivery_appt
      ? new Date(load.delivery_appt).toLocaleString()
      : "Por confirmar",
  };
  return String(body).replace(
    /\{(load|customer|status|origin|destination|truck|trailer|delivery)\}/g,
    (_, key) => String(values[key] || "Por confirmar"),
  );
}
