import { escapeHtml as escape } from "../../ui/html.js";
import { createTeamService } from "../team/service.js";
import { fillTemplate } from "../team/templates.js";
import { unwrap } from "../../data/supabase.js";
import { statuses } from "../../load-rules.js";

/** Acciones adicionales del expediente; la versión impide sobreescribir una edición reciente. */
export async function mountLoadActions({
  container,
  row,
  client,
  role,
  userId,
  isCurrent,
  onSaved,
  onError,
}) {
  const writable = ["admin", "csr"].includes(role) && !row.archived;
  if (row.archived) {
    container.innerHTML =
      "<h3>Expediente archivado</h3><p>Este expediente está en consulta. Administración puede restaurarlo desde Archivo.</p>";
    return;
  }
  const [templates, following] = await Promise.all([
    createTeamService(client).templates(),
    unwrap(
      client
        .from("load_followers")
        .select("user_id")
        .eq("load", row.load)
        .eq("user_id", userId),
      "SQL 005",
    ),
  ]);
  if (!isCurrent()) return;
  container.innerHTML = `${
    writable
      ? `<h3>Redactar aviso</h3><p>Usa una plantilla para preparar el mensaje. Copiarlo permite enviarlo por tu medio habitual; publicar lo muestra al cliente autorizado en el portal.</p>
    <label>Plantilla<select id="load-template"><option value="">Escribir mensaje</option>${templates.map((record) => `<option value="${escape(record.id)}">${escape(record.title)}</option>`).join("")}</select></label>
    <form id="portal-message"><label>Mensaje para el cliente<textarea name="message" required maxlength="10000" rows="5"></textarea></label><button>Publicar en portal</button><button type="button" id="message-copy">Copiar mensaje</button></form>
    <p id="copy-result" role="status"></p><button id="load-follow">${following.length ? "Dejar de seguir esta carga" : "Seguir esta carga"}</button>`
      : ""
  }
    ${role === "admin" ? '<h3>Archivo</h3><p>Archivar retira la carga de la operación activa y del portal; conserva su expediente.</p><button id="load-archive">Archivar carga</button>' : ""}`;
  async function run(button, action) {
    if (button.disabled) return;
    button.disabled = true;
    onError("");
    try {
      await action();
    } catch (error) {
      if (isCurrent()) onError(error.message);
    } finally {
      button.disabled = false;
    }
  }
  container
    .querySelector("#load-template")
    ?.addEventListener("change", (event) => {
      const template = templates.find(
        (record) => record.id === event.target.value,
      );
      if (template)
        container.querySelector("textarea").value = fillTemplate(
          template.body,
          row,
        );
    });
  container
    .querySelector("#portal-message")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = new FormData(event.target).get("message").trim();
      run(event.target.querySelector("button"), async () => {
        await unwrap(
          client.rpc("ops_publish_portal_message", {
            p_load: row.load,
            p_version: row.updated_at,
            p_message: message,
          }),
          "SQL 006",
        );
        if (isCurrent()) await onSaved(row.load);
      });
    });
  container.querySelector("#message-copy")?.addEventListener("click", (event) =>
    run(event.target, async () => {
      const input = container.querySelector("textarea");
      try {
        await navigator.clipboard.writeText(input.value);
        if (isCurrent())
          container.querySelector("#copy-result").textContent =
            "Mensaje copiado.";
      } catch {
        if (isCurrent()) {
          input.focus();
          input.select();
          container.querySelector("#copy-result").textContent =
            "El navegador no permitió copiar. El texto está seleccionado; usa Ctrl+C o Copiar.";
        }
      }
    }),
  );
  container.querySelector("#load-follow")?.addEventListener("click", (event) =>
    run(event.target, async () => {
      await unwrap(
        client.rpc("ops_follow_load", {
          p_load: row.load,
          p_follow: !following.length,
        }),
        "SQL 005",
      );
      if (isCurrent()) await onSaved(row.load);
    }),
  );
  container.querySelector("#load-archive")?.addEventListener("click", (event) =>
    run(event.target, async () => {
      await unwrap(
        client.rpc("ops_archive_load", {
          p_load: row.load,
          p_version: row.updated_at,
          p_archive: true,
        }),
        "SQL 006",
      );
      if (isCurrent()) await onSaved(row.load);
    }),
  );
}

/** Una selección aplica un único campo; Supabase comprueba todas las versiones en una transacción. */
export function bulkEditor({
  container,
  items,
  client,
  onSaved,
  onError,
  isCurrent,
}) {
  if (items.length < 1 || items.length > 100)
    return onError("Selecciona entre 1 y 100 cargas.");
  container.innerHTML = `<div class="card"><h2>Cambiar ${items.length} cargas</h2><p>${escape(items.map((row) => row.load).join(", "))}</p><form id="bulk-editor">
    <label>Campo<select name="field"><option value="status">Estatus</option><option value="pod_sent">POD compartido</option><option value="recargos_vg">Recargos cobrados</option><option value="bol">BOL</option><option value="doda">DODA</option><option value="entry">Entry</option><option value="sobre_listo">Sobre listo</option><option value="color">Marca</option></select></label>
    <label>Valor<select name="value"></select></label><button>Aplicar a la selección</button></form></div>`;
  const form = container.querySelector("form");
  function choices() {
    const field = form.elements.field.value;
    const values =
      field === "status"
        ? statuses
            .filter(
              (status) =>
                ![
                  "Descompuesta",
                  "En resguardo",
                  "Patio permisionario",
                ].includes(status),
            )
            .map((value) => [value, value])
        : field === "color"
          ? [
              ["", "Sin marca"],
              ["critical", "Crítico"],
              ["warn", "Atención"],
              ["good", "En orden"],
              ["info", "Informativo"],
            ]
          : [
              ["true", "Sí"],
              ["false", "No"],
            ];
    form.elements.value.innerHTML = values
      .map(
        ([value, label]) =>
          `<option value="${escape(value)}">${escape(label)}</option>`,
      )
      .join("");
  }
  form.elements.field.onchange = choices;
  choices();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    if (button.disabled) return;
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      await unwrap(
        client.rpc("ops_bulk_loads", {
          p_items: items.map((row) => ({
            load: row.load,
            updated_at: row.updated_at,
          })),
          p_values: { [values.field]: values.value },
        }),
        "SQL 006",
      );
      if (isCurrent()) await onSaved();
    } catch (error) {
      if (isCurrent()) onError(error.message);
    } finally {
      button.disabled = false;
    }
  };
  container.scrollIntoView({ behavior: "smooth" });
}
