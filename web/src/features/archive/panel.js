import { escapeHtml as escape } from "../../ui/html.js";
import { createPanelController, formatDate } from "../../ui/panel.js";
import { fetchAll, unwrap } from "../../data/supabase.js";

export const createArchiveService = (client) => ({
  list: () =>
    fetchAll(
      () => client.from("loads").select("*").eq("archived", true).order("load"),
      "SQL 006",
    ),
  restore: (row) =>
    unwrap(
      client.rpc("ops_archive_load", {
        p_load: row.load,
        p_version: row.updated_at,
        p_archive: false,
      }),
      "SQL 006",
    ),
  finished: () => unwrap(client.rpc("ops_archive_finished"), "SQL 006"),
});

export function createArchivePanel({
  container,
  service,
  role,
  onError,
  onOpenLoad,
}) {
  const view = createPanelController(container, onError);
  let records = [];
  function open() {
    return view.load(service.list, (rows) => {
      records = rows;
      container.innerHTML = `<section class="card"><div class="toolbar"><h2>Archivo de cargas</h2><button id="archive-refresh">Actualizar</button>
      ${role === "admin" ? '<button id="archive-finished">Archivar cierres sin cambios desde hace 60 días</button>' : ""}</div>
      <p>El archivo conserva comentarios, incidencias e historial. Puedes abrir el expediente.</p><label>Buscar<input id="archive-search" type="search"></label><p id="archive-result"></p><ul id="archive-rows"></ul></section>`;
      container.querySelector("#archive-refresh").onclick = open;
      container.querySelector("#archive-search").oninput = renderRows;
      container
        .querySelector("#archive-finished")
        ?.addEventListener("click", (event) =>
          view.run(event.target, async () => {
            const total = await service.finished();
            await open();
            if (view.mounted)
              container.querySelector("#archive-result").textContent =
                `Se archivaron ${total} cargas.`;
          }),
        );
      renderRows();
    });
  }
  function renderRows() {
    const search = container
      .querySelector("#archive-search")
      .value.toLocaleLowerCase();
    container.querySelector("#archive-rows").innerHTML =
      records
        .filter((row) =>
          [row.load, row.customer, row.truck]
            .join(" ")
            .toLocaleLowerCase()
            .includes(search),
        )
        .map(
          (
            row,
          ) => `<li><strong>${escape(row.load)} · ${escape(row.customer)}</strong><p>${escape(row.status)} · ${escape(formatDate(row.archived_at))}</p>
        <button data-archive-open="${escape(row.load)}">Abrir expediente</button>${role === "admin" ? `<button data-restore="${escape(row.load)}">Restaurar carga</button>` : ""}</li>`,
        )
        .join("") || "<li>No hay cargas archivadas con este filtro.</li>";
    container
      .querySelectorAll("[data-archive-open]")
      .forEach(
        (button) =>
          (button.onclick = () => onOpenLoad(button.dataset.archiveOpen)),
      );
    container.querySelectorAll("[data-restore]").forEach(
      (button) =>
        (button.onclick = () =>
          view.run(button, async () => {
            await service.restore(
              records.find((row) => row.load === button.dataset.restore),
            );
            await open();
          })),
    );
  }
  return { open, dispose: view.dispose };
}
