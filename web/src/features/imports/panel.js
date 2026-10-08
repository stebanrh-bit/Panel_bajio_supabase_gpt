import { escapeHtml as escape } from "../../ui/html.js";
import { createPanelController, formatDate } from "../../ui/panel.js";
import { parseLoadFile } from "./parser.js";

export function createImportsPanel({ container, service, role, onError }) {
  const view = createPanelController(container, onError);
  let batches = [],
    records = [],
    preview = [],
    fileName = "";
  function open() {
    if (role !== "admin") {
      container.innerHTML =
        '<section class="card"><h2>Importación y respaldos</h2><p>Disponible para administración.</p></section>';
      return;
    }
    return view.load(service.list, (rows) => {
      batches = rows;
      render();
    });
  }
  function render() {
    container.innerHTML = `<section class="card"><h2>Importar cargas</h2>
      <p>Selecciona .xlsx o .csv (hasta 1000 cargas, 10 MB). Los campos vacíos conservan datos existentes; el estatus, el POD y las marcas manuales se mantienen.</p>
      <p>Fechas de CSV: AAAA-MM-DD HH:MM. Las horas sin zona se interpretan en ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}.</p>
      <form id="import-form"><label>Archivo<input type="file" name="file" accept=".xlsx,.csv" required></label><button>Preparar vista previa</button></form>
      <div id="import-preview"></div></section>
      <section class="card"><h2>Historial de importaciones</h2><p>Deshacer conserva el historial y rechaza cargas modificadas después de la importación.</p>
        <ul>${
          batches
            .map(
              (
                batch,
              ) => `<li>${escape(batch.file_name)} · ${escape(formatDate(batch.created_at))} · ${batch.state === "applied" ? "Aplicada" : "Deshecha"}
          ${batch.state === "applied" ? `<button data-undo="${escape(batch.id)}">Deshacer importación</button>` : ""}</li>`,
            )
            .join("") || "<li>Aún no hay importaciones.</li>"
        }</ul></section>
      <section class="card"><h2>Respaldo de datos</h2><p>Descarga una copia JSON para conservarla. El respaldo de contraseñas y usuarios Auth se administra en Supabase. Esta exportación recorre las tablas; realiza el respaldo fuera del turno de edición.</p><button id="data-backup">Descargar respaldo</button><p id="backup-result"></p></section>`;
    container.querySelector("#import-form").onsubmit = (event) => {
      event.preventDefault();
      const file = event.target.elements.file.files[0];
      view.run(event.target.querySelector("button"), async () => {
        const parsed = await parseLoadFile(file);
        const checked = await service.preview(parsed);
        if (!view.mounted) return;
        records = parsed;
        preview = checked;
        fileName = file.name;
        renderPreview();
      });
    };
    container.querySelectorAll("[data-undo]").forEach(
      (button) =>
        (button.onclick = () =>
          view.run(button, async () => {
            await service.undo(
              batches.find((batch) => batch.id === button.dataset.undo),
            );
            await open();
          })),
    );
    container.querySelector("#data-backup").onclick = (event) =>
      view.run(event.target, async () => {
        const data = await service.backup();
        if (!view.mounted) return;
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = `panel-bajio-${data.exported_at.slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        container.querySelector("#backup-result").textContent =
          "Se preparó el archivo de respaldo.";
      });
  }
  function renderPreview() {
    const section = container.querySelector("#import-preview");
    section.innerHTML = `<h3>Vista previa: ${escape(fileName)}</h3><p>${preview.filter((row) => row.new).length} nuevas; ${preview.filter((row) => !row.new && row.changes.length).length} con cambios; ${preview.filter((row) => !row.new && !row.changes.length).length} sin cambios.</p>
      <div class="scroll"><table><thead><tr><th>Carga</th><th>Acción</th><th>Campos que cambian</th></tr></thead><tbody>${preview.map((row) => `<tr><td>${escape(row.load)}</td><td>${row.new ? "Crear" : row.changes.length ? "Actualizar" : "Conservar"}</td><td>${escape(row.changes.join(", "))}</td></tr>`).join("")}</tbody></table></div><button id="import-apply">Aplicar esta importación</button>`;
    section.querySelector("button").onclick = (event) =>
      view.run(event.target, async () => {
        await service.apply(records, preview, fileName);
        await open();
      });
  }
  return { open, dispose: view.dispose };
}
