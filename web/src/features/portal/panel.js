import { escapeHtml as escape } from "../../ui/html.js";
import { createPanelController, formatDate } from "../../ui/panel.js";
import { stages, stageIndex, alertFor, marked } from "../../load-rules.js";

/** Pantalla de clientes con consulta y búsqueda, sin cargar tablas internas en el navegador. */
export function createPortalPanel({ container, service, onError }) {
  const view = createPanelController(container, onError);
  let records = [];
  function open() {
    return view.load(service.list, (rows) => {
      records = rows;
      container.innerHTML = `<section class="card"><div class="toolbar"><h2>Mis embarques</h2><button id="portal-refresh">Actualizar</button></div>
        <label>Buscar carga o ruta<input id="portal-search" type="search"></label>
        <div class="scroll"><table><thead><tr><th>Carga</th><th>Ruta</th><th>Estatus</th><th>Entrega prevista</th><th></th></tr></thead><tbody id="portal-rows"></tbody></table></div>
      </section><section id="portal-detail"></section>`;
      container.querySelector("#portal-refresh").onclick = open;
      container.querySelector("#portal-search").oninput = renderRows;
      renderRows();
    });
  }
  function renderRows() {
    const search = container
      .querySelector("#portal-search")
      .value.toLocaleLowerCase("es");
    container.querySelector("#portal-rows").innerHTML =
      records
        .filter((record) =>
          [record.load, record.origin_city, record.dest_city].some((value) =>
            String(value).toLocaleLowerCase("es").includes(search),
          ),
        )
        .map(
          (
            record,
          ) => `<tr><td>${escape(record.load)}</td><td>${escape(record.origin_city)} → ${escape(record.dest_city)}</td>
        <td>${escape(record.status)}<small class="block">${stages[stageIndex(record)]}</small></td><td>${escape(formatDate(record.delivery_appt))}</td>
        <td><button data-portal-load="${escape(record.load)}">Ver embarque</button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5">No hay embarques para mostrar.</td></tr>';
    container
      .querySelectorAll("[data-portal-load]")
      .forEach(
        (button) => (button.onclick = () => detail(button.dataset.portalLoad)),
      );
  }
  function detail(load) {
    return view.load(
      () => service.get(load),
      (record) => {
        const alert = alertFor(record);
        const section = container.querySelector("#portal-detail");
        section.innerHTML = `<div class="card"><h2>Embarque ${escape(record.load)}</h2>
        <ol class="timeline">${stages.map((label, index) => `<li class="${index === stageIndex(record) ? "current" : index < stageIndex(record) ? "done" : ""}">${label}</li>`).join("")}</ol>
        <p class="badge ${alert.level === "critical" ? "critical" : alert.level === "warn" ? "warn" : ""}">${escape(alert.message)}</p>
        <dl>${Object.entries({
          customer: "Cliente",
          origin_city: "Origen",
          dest_city: "Destino",
          truck: "Unidad",
          trailer: "Remolque",
          status: "Estatus",
        })
          .map(
            ([key, label]) =>
              `<div><dt>${label}</dt><dd>${escape(record[key] || "—")}</dd></div>`,
          )
          .join("")}
          <div><dt>Recolección</dt><dd>${escape(formatDate(record.pickup_appt))}</dd></div><div><dt>Entrega</dt><dd>${escape(formatDate(record.delivery_appt))}</dd></div></dl>
        <h3>Documentación</h3><ul>${Object.entries({
          bol: "BOL",
          doda: "DODA",
          entry: "Entry",
          sobre_listo: "Sobre",
          pod_sent: "POD",
        })
          .map(
            ([key, label]) =>
              `<li>${label}: ${marked(record[key]) ? "Listo" : "Pendiente"}</li>`,
          )
          .join("")}</ul>
        <h3>Mensajes del equipo</h3><ul>${record.messages.map((message) => `<li class="preserve-lines">${escape(message.message)}<small class="block">${escape(formatDate(message.created_at))}</small></li>`).join("") || "<li>Sin mensajes publicados.</li>"}</ul>
        <h3>Incidencias</h3><ul>${record.incidents.map((incident) => `<li><strong>${escape(incident.category)} · ${escape(incident.severity)}</strong><p>${escape(incident.description)}</p><p>${escape(incident.action_taken)}</p></li>`).join("") || "<li>Sin incidencias.</li>"}</ul>
      </div>`;
        section.scrollIntoView({ behavior: "smooth" });
      },
    );
  }
  return { open, dispose: view.dispose };
}
