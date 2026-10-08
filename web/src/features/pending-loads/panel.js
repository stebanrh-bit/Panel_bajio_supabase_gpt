import { escapeHtml } from "../../ui/html.js";
import {
  canEditPendingLoad,
  matchingLoads,
  preparePendingLoad,
} from "./rules.js";

const stateLabels = {
  pending: "Pendientes",
  linked: "Vinculados",
  cancelled: "Cancelados",
};

/**
 * Pantalla de solicitudes sin número de carga.
 * Recibe el servicio de datos y callbacks; no crea una segunda sesión Supabase.
 * dispose() impide que respuestas tardías repinten la página al salir o cambiar de módulo.
 */
export function createPendingLoadsPanel(options) {
  const { container, service, loads, userId, role, onOpenLoad, onError } =
    options;
  let isMounted = true;
  let requestNumber = 0;
  let selectedState = "pending";
  let records = [];

  const canCreate = ["admin", "csr"].includes(role);
  const canEdit = (record) => canEditPendingLoad(record, userId, role);
  const formatDate = (value) =>
    value ? new Date(value).toLocaleString() : "—";

  /** Ejecuta una acción una sola vez y presenta los errores sin perder el formulario. */
  async function runAction(button, action) {
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      if (isMounted) onError(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function open() {
    if (!isMounted) return;
    const currentRequest = ++requestNumber;
    container.innerHTML =
      '<section class="card"><h2>Solicitudes pendientes</h2><p>Cargando…</p></section>';
    try {
      const result = await service.list(selectedState);
      if (!isMounted || currentRequest !== requestNumber) return;
      records = result;
      renderPage();
    } catch (error) {
      if (!isMounted || currentRequest !== requestNumber) return;
      container.innerHTML =
        '<section class="card"><h2>Solicitudes pendientes</h2><button id="pending-retry">Reintentar</button></section>';
      container.querySelector("#pending-retry").onclick = open;
      onError(error.message);
    }
  }

  /** Renderiza la lista; los valores del usuario siempre pasan por escapeHtml. */
  function renderPage() {
    container.innerHTML = `
      <section class="card">
        <div class="toolbar">
          <h2>Solicitudes sin número de carga</h2>
          ${canCreate ? '<button id="pending-new">Nueva solicitud</button>' : ""}
          <button id="pending-refresh">Actualizar</button>
        </div>
        <p>Registra aquí las solicitudes que todavía no tienen una carga confirmada.</p>
        <div class="filters">
          ${Object.entries(stateLabels)
            .map(
              ([state, label]) => `
            <button data-pending-state="${state}" aria-pressed="${state === selectedState}">${label}</button>
          `,
            )
            .join("")}
        </div>
        <label>Buscar cliente, ruta o nota<input id="pending-search" type="search" placeholder="Buscar…"></label>
        <div class="scroll">
          <table>
            <thead><tr><th>Cliente</th><th>Ruta</th><th>Fecha estimada</th><th>Nota</th><th></th></tr></thead>
            <tbody id="pending-rows"></tbody>
          </table>
        </div>
      </section>
      <section id="pending-detail"></section>
    `;
    container
      .querySelector("#pending-new")
      ?.addEventListener("click", () => renderEditor());
    container.querySelector("#pending-refresh").onclick = open;
    container
      .querySelector("#pending-search")
      .addEventListener("input", renderRows);
    container.querySelectorAll("[data-pending-state]").forEach((button) => {
      button.onclick = () => {
        selectedState = button.dataset.pendingState;
        open();
      };
    });
    renderRows();
  }

  function renderRows() {
    const search = container
      .querySelector("#pending-search")
      .value.toLocaleLowerCase("es");
    const visible = records.filter((record) =>
      [record.customer, record.origin, record.destination, record.note].some(
        (value) => String(value).toLocaleLowerCase("es").includes(search),
      ),
    );

    container.querySelector("#pending-rows").innerHTML =
      visible
        .map(
          (record) => `
      <tr>
        <td>${escapeHtml(record.customer)}</td>
        <td>${escapeHtml(record.origin)} → ${escapeHtml(record.destination)}</td>
        <td>${escapeHtml(record.estimated_date || "—")}</td>
        <td class="pending-note">${escapeHtml(record.note)}</td>
        <td><button data-pending-id="${escapeHtml(record.id)}">Abrir</button></td>
      </tr>
    `,
        )
        .join("") ||
      '<tr><td colspan="5">No hay solicitudes para mostrar.</td></tr>';

    container.querySelectorAll("[data-pending-id]").forEach((button) => {
      button.onclick = () => showDetail(button.dataset.pendingId);
    });
  }

  async function showDetail(id) {
    if (!isMounted) return;
    const currentRequest = ++requestNumber;
    try {
      const [record, comments] = await Promise.all([
        service.get(id),
        service.comments(id),
      ]);
      if (!isMounted || currentRequest !== requestNumber) return;
      renderDetail(record, comments);
    } catch (error) {
      if (isMounted && currentRequest === requestNumber) onError(error.message);
    }
  }

  function renderDetail(record, comments) {
    const editable = canEdit(record);
    const candidates = matchingLoads(record, loads);
    const detail = container.querySelector("#pending-detail");
    detail.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h2>${escapeHtml(record.customer)}</h2>
          ${editable ? '<button id="pending-edit">Editar solicitud</button><button id="pending-cancel">Cancelar solicitud</button>' : ""}
        </div>
        <dl>
          <div><dt>Estado</dt><dd>${stateLabels[record.state]}</dd></div>
          <div><dt>Origen</dt><dd>${escapeHtml(record.origin || "—")}</dd></div>
          <div><dt>Destino</dt><dd>${escapeHtml(record.destination || "—")}</dd></div>
          <div><dt>Fecha estimada</dt><dd>${escapeHtml(record.estimated_date || "—")}</dd></div>
          <div><dt>Creación</dt><dd>${escapeHtml(formatDate(record.created_at))}</dd></div>
        </dl>
        <h3>Nota de la solicitud</h3><p class="preserve-lines">${escapeHtml(record.note || "Sin nota.")}</p>
        ${record.linked_load ? `<p>Carga vinculada: <strong>${escapeHtml(record.linked_load)}</strong> <button id="pending-open-load">Abrir carga</button></p>` : ""}
        <h3>Comentarios</h3>
        <ul>${comments.map((comment) => `<li class="preserve-lines">${escapeHtml(comment.body)}<small class="block">${escapeHtml(formatDate(comment.created_at))}</small></li>`).join("") || "<li>Sin comentarios.</li>"}</ul>
        ${
          editable
            ? `
          <form id="pending-comment">
            <label>Nuevo comentario<textarea name="body" required maxlength="10000"></textarea></label>
            <button>Guardar comentario</button>
          </form>
          <h3>Vincular con una carga confirmada</h3>
          <p>La nota y los comentarios se conservarán en el historial de la carga.</p>
          ${
            candidates.length
              ? `
            <form id="pending-link">
              <label>Carga del mismo cliente
                <select name="load" required><option value="">Selecciona una carga…</option>
                  ${candidates.map((load) => `<option value="${escapeHtml(load.load)}">${escapeHtml(load.load)} · ${escapeHtml(load.origin_city)} → ${escapeHtml(load.dest_city)}</option>`).join("")}
                </select>
              </label>
              <button>Vincular y cerrar solicitud</button>
            </form>
          `
              : "<p>Aún no hay una carga activa del mismo cliente. Créala en Cargas y vuelve a abrir esta solicitud.</p>"
          }
        `
            : ""
        }
      </div>
    `;

    detail
      .querySelector("#pending-edit")
      ?.addEventListener("click", () => renderEditor(record));
    detail
      .querySelector("#pending-open-load")
      ?.addEventListener("click", () => onOpenLoad(record.linked_load));
    detail
      .querySelector("#pending-cancel")
      ?.addEventListener("click", (event) => {
        // Cancelar cambia el estado; no elimina notas ni comentarios anteriores.
        if (
          !window.confirm(
            "¿Cancelar esta solicitud? Su registro y comentarios se conservarán.",
          )
        )
          return;
        runAction(event.target, async () => {
          await service.cancel(record);
          await open();
        });
      });
    detail
      .querySelector("#pending-comment")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const body = new FormData(event.target).get("body").trim();
        if (!body) return onError("Escribe un comentario antes de guardar.");
        runAction(event.target.querySelector("button"), async () => {
          await service.addComment(record.id, body);
          await showDetail(record.id);
        });
      });
    detail
      .querySelector("#pending-link")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const loadNumber = new FormData(event.target).get("load");
        runAction(event.target.querySelector("button"), async () => {
          await service.link(record, loadNumber);
          if (isMounted) await onOpenLoad(loadNumber);
        });
      });
    detail.scrollIntoView({ behavior: "smooth" });
  }

  /** El mismo formulario sirve para alta y edición; nunca permite escribir autor ni estado. */
  function renderEditor(record = null) {
    if (!isMounted) return;
    requestNumber++;
    const detail = container.querySelector("#pending-detail");
    detail.innerHTML = `
      <div class="card">
        <h2>${record ? "Editar solicitud" : "Nueva solicitud pendiente"}</h2>
        <form id="pending-editor">
          <div class="grid">
            <label>Cliente<input name="customer" required maxlength="200" value="${escapeHtml(record?.customer)}"></label>
            <label>Origen<input name="origin" maxlength="250" value="${escapeHtml(record?.origin)}"></label>
            <label>Destino<input name="destination" maxlength="250" value="${escapeHtml(record?.destination)}"></label>
            <label>Fecha estimada<input name="estimated_date" type="date" value="${escapeHtml(record?.estimated_date)}"></label>
          </div>
          <label>Nota<textarea name="note" maxlength="9500">${escapeHtml(record?.note)}</textarea></label>
          <button>Guardar solicitud</button><button type="button" id="pending-editor-cancel">Volver</button>
        </form>
      </div>
    `;
    detail.querySelector("#pending-editor-cancel").onclick = () => {
      if (record) showDetail(record.id);
      else detail.innerHTML = "";
    };
    detail.querySelector("#pending-editor").onsubmit = (event) => {
      event.preventDefault();
      runAction(
        event.target.querySelector('button[type="submit"], button:not([type])'),
        async () => {
          const values = preparePendingLoad(
            Object.fromEntries(new FormData(event.target)),
          );
          const saved = record
            ? await service.update(record, values)
            : await service.create(values);
          // Una solicitud guardada sigue abierta. Mostrar Pendientes evita que parezca
          // perdida cuando se crea desde las pestañas Vinculados o Cancelados.
          selectedState = "pending";
          await open();
          if (isMounted) await showDetail(saved.id);
        },
      );
    };
    detail.scrollIntoView({ behavior: "smooth" });
  }

  function dispose() {
    isMounted = false;
    requestNumber++;
  }

  return { open, dispose };
}
