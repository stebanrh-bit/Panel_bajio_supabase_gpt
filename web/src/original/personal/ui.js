import * as domain from "./domain.js";
import { groupNotices } from "./notices.js";
import { exportSnapshot } from "./export.js";
import { reviewImport } from "./import-review.js";
import { personalDialog } from "./dialog.js";
import { field, select } from "../dialogs.js";
import { escapeHtml as esc, safeLink } from "../content.js";
export const APP_VERSION = "2026.10.27.3";
const kinds = [
  ["pod", "POD"],
  ["bol", "BOL"],
  ["doda", "DODA"],
  ["entry", "Entry"],
  ["other", "Otro"],
];
const time = (value) =>
  value
    ? new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Mexico_City",
      }).format(new Date(value))
    : "Sin registro";
/** Funciones personales cargadas bajo demanda; el servidor vuelve a comprobar permisos y versiones. */
export function mountPersonal(api, doc = document) {
  let owner = "",
    generation = 0,
    health = null,
    healthPromise = null,
    preferences = { calendar_hide_empty: true, show_crossings: false },
    completed = null,
    preferenceQueue = Promise.resolve(),
    preferenceRevision = 0;
  const call = async (name, ...args) => {
    const result = await api.methods[name](...args);
    if (result?.ok === false)
      throw Error(result.error || "No se completó la operación.");
    return result;
  };
  const notify = (name, detail) =>
    window.dispatchEvent(new CustomEvent(name, { detail }));
  const badge = doc.createElement("button");
  badge.id = "personal-site-status";
  badge.className = "personal-version";
  badge.type = "button";
  badge.textContent = "v" + APP_VERSION;
  (
    doc.querySelector("footer") ||
    doc.querySelector("header.top") ||
    doc.body
  ).append(badge);
  async function checkHealth(force = false) {
    if (health && !force) return health;
    if (healthPromise) return healthPromise;
    const stamp = generation;
    healthPromise = call("getEstadoSitio")
      .then((value) => {
        if (stamp !== generation) throw Error("La sesión cambió.");
        health = value;
        badge.textContent = "v" + APP_VERSION + " · Base " + value.schema;
        badge.classList.remove("needs-update");
        return value;
      })
      .catch((error) => {
        badge.textContent =
          "v" + APP_VERSION + " · Revisar actualización SQL 020";
        badge.classList.add("needs-update");
        throw error;
      })
      .finally(() => {
        healthPromise = null;
      });
    return healthPromise;
  }
  async function ensure() {
    const state = await checkHealth();
    if (state.schema < 20)
      throw Error("Instala la actualización SQL 020 para usar este módulo.");
    return state;
  }
  async function start() {
    const id = api.profile?.id;
    if (!id || id === owner) return;
    owner = id;
    generation++;
    health = null;
    completed = null;
    const stamp = generation;
    await Promise.allSettled([
      checkHealth(),
      call("getPreferenciasPersonales").then((result) => {
        if (stamp !== generation) return;
        preferences = {
          calendar_hide_empty: true,
          show_crossings: false,
          ...result.preferences,
        };
        notify("panel:personal-preferences", preferences);
      }),
      syncNoticeState(),
    ]);
  }
  function preference(patch) {
    const stamp = generation,
      revision = ++preferenceRevision;
    const request = preferenceQueue
      .catch(() => {})
      .then(async () => {
        if (stamp !== generation) throw Error("La sesión cambió.");
        await ensure();
        const result = await call("guardarPreferenciasPersonales", patch);
        if (stamp !== generation) throw Error("La sesión cambió.");
        if (revision === preferenceRevision) {
          preferences = {
            calendar_hide_empty: true,
            show_crossings: false,
            ...result.preferences,
          };
          notify("panel:personal-preferences", preferences);
        }
        return result.preferences;
      });
    preferenceQueue = request;
    return request;
  }
  async function syncNoticeState(changes = []) {
    if (!api.profile) return;
    const stamp = generation;
    const result = await call("sincronizarAvisosPersonales", changes);
    if (stamp === generation) notify("panel:notice-state", result.items);
    return result.items;
  }
  function messageError(error) {
    const target = doc.getElementById("personal-feedback");
    if (target) {
      target.textContent = error.message;
      target.hidden = false;
    }
  }
  async function renderDocuments(load, target) {
    target.textContent = "Cargando enlaces…";
    try {
      await ensure();
      const result = await call("getDocumentosCarga", load);
      if (!target.isConnected) return;
      target.innerHTML = `<div class="personal-section-head"><h3>Enlaces de documentos</h3><button type="button" data-document-add="${esc(load)}">Agregar enlace</button></div><p class="personal-help">El enlace conserva los permisos del sitio donde está guardado el archivo. Registrar el POD y agregar su enlace son acciones separadas.</p>${result.items.length ? result.items.map((row) => `<article class="personal-document"><div><b>${esc(kinds.find(([id]) => id === row.kind)?.[1] || row.kind)} · ${esc(row.label)}</b><small>${esc(time(row.created_at))}</small></div><a href="${esc(safeLink(row.url) || "#")}" target="_blank" rel="noopener noreferrer">Abrir</a><button type="button" data-document-edit="${esc(row.id)}">Editar</button><button type="button" data-document-remove="${esc(row.id)}">Retirar</button></article>`).join("") : "<p>Esta carga todavía no tiene enlaces registrados.</p>"}`;
      target.onclick = async (event) => {
        const add = event.target.closest("[data-document-add]"),
          edit = event.target.closest("[data-document-edit]"),
          remove = event.target.closest("[data-document-remove]");
        if (add || edit) {
          const row = edit
            ? result.items.find((r) => r.id === edit.dataset.documentEdit)
            : null;
          personalDialog(
            row ? "Editar enlace" : "Agregar enlace de documento",
            select("kind", "Documento", kinds, row?.kind || "pod") +
              field(
                "label",
                "Nombre",
                "text",
                row?.label || "",
                'required maxlength="200"',
              ) +
              field(
                "url",
                "Enlace HTTPS",
                "url",
                row?.url || "",
                'required maxlength="2000"',
              ) +
              "<p>Se conserva la referencia mientras exista la carga. Retirar el enlace deja un registro; no elimina el archivo de su sitio de origen.</p>",
            async (data) => {
              const url = new URL(data.get("url"));
              if (url.protocol !== "https:" || url.username || url.password)
                throw Error("Usa un enlace HTTPS sin usuario ni contraseña.");
              await call(
                "guardarDocumentoCarga",
                load,
                row?.id,
                row?.updated_at,
                {
                  kind: data.get("kind"),
                  label: data.get("label"),
                  url: url.href,
                },
              );
              await renderDocuments(load, target);
            },
          );
        }
        if (remove) {
          const row = result.items.find(
            (r) => r.id === remove.dataset.documentRemove,
          );
          remove.disabled = true;
          try {
            await call("quitarDocumentoCarga", row.id, row.updated_at);
            await renderDocuments(load, target);
          } catch (error) {
            messageError(error);
            remove.disabled = false;
          }
        }
      };
    } catch (error) {
      if (target.isConnected) target.textContent = error.message;
    }
  }
  async function renderCompleted(target) {
    target.hidden = false;
    target.textContent = "Cargando atendidos…";
    try {
      await ensure();
      if (!completed || Date.now() - completed.at > 30000)
        completed = {
          at: Date.now(),
          result: await call("getAtendidosPersonales"),
        };
      if (!target.isConnected) return;
      const rows = completed.result.items;
      target.innerHTML =
        '<h3>Atendidos recientes</h3><p class="personal-help">Últimos seguimientos, instrucciones, pendientes y tareas atendidas. Leer un aviso no aparece aquí como trabajo completado.</p>' +
        (rows.length
          ? rows
              .map(
                (row) =>
                  `<article class="personal-completed-row"><div><b>${esc(row.title)}</b><small>${esc(row.kind)} · ${esc(time(row.at))}${row.load ? " · Load " + esc(row.load) : ""}</small></div>${row.load ? `<button type="button" class="ws-btn" data-home-open="${esc(row.load)}">Abrir carga</button>` : '<button type="button" class="ws-btn" data-personal-history>Histórico de tareas</button>'}</article>`,
              )
              .join("")
          : "<p>No hay trabajos atendidos en el periodo consultado.</p>");
    } catch (error) {
      target.textContent = error.message;
    }
  }
  async function miles(target) {
    if (api.profile?.role !== "admin") {
      target.hidden = true;
      return;
    }
    target.hidden = false;
    target.textContent = "Consultando proceso de millas…";
    try {
      await ensure();
      const value = await call("getEstadoMillas");
      if (!target.isConnected) return;
      target.innerHTML = `<div class="personal-section-head"><h3>Proceso de millas</h3><button type="button" data-miles-refresh>Actualizar estado</button></div><div class="personal-stat-row"><span><b>${value.completed}</b> rutas con Google</span><span><b>${value.pending}</b> pendientes</span><span><b>${value.retry}</b> en reintento</span><span><b>${value.no_route}</b> sin ruta</span></div><p>Última ejecución: ${esc(time(value.last_run))} · ${esc(value.status || "Sin ejecución registrada")} · Último cálculo: ${esc(time(value.last_calculation))}.</p><p class="personal-help">Lote máximo: ${value.batch_limit} rutas por ejecución. Se conservan los cálculos guardados. Este estado no mide la cuota ni el consumo total del proyecto.</p>${value.paused_until ? "<p>Pausa por cuota hasta " + esc(time(value.paused_until)) + ".</p>" : ""}`;
      target.querySelector("[data-miles-refresh]").onclick = () =>
        miles(target);
    } catch (error) {
      target.textContent = error.message;
    }
  }
  async function statusDialog() {
    const { dialog } = personalDialog(
      "Versión y estado del panel",
      "<p>Cargando estado…</p>",
      null,
    );
    const target = dialog.querySelector(".personal-body");
    try {
      const value = await checkHealth(true);
      target.innerHTML = `<p><b>Sitio:</b> ${APP_VERSION} · <b>Base instalada:</b> ${value.schema}</p><p>Vistas, importación protegida, mensajes manuales, documentos y preferencias: ${value.schema >= 20 ? "disponibles" : "requieren SQL 020"}.</p>${api.profile?.role === "admin" ? `<fieldset><legend>Mi operación</legend><label class="personal-check"><input type="checkbox" data-setting-crossings ${preferences.show_crossings ? "checked" : ""}> Mostrar cruces históricos y sus indicadores</label><label class="personal-check"><input type="checkbox" data-setting-empty ${preferences.calendar_hide_empty ? "checked" : ""}> Ocultar días sin movimientos en el calendario</label><p class="personal-help">Activa cruces si sus fechas todavía llegan desde tu archivo. Las fechas anteriores se conservan.</p></fieldset><h3>Respaldo</h3><p>Descarga un respaldo completo cada semana y conserva una copia anterior. Antes de una limpieza, verifica una restauración en una base separada.</p><button type="button" data-personal-backup>Descargar respaldo completo</button>` : ""}<p class="personal-help">Las actualizaciones de HTML, SQL y Code.gs tienen instrucciones en la entrega. Un cambio del sitio no ejecuta SQL automáticamente.</p>`;
      target
        .querySelector("[data-setting-crossings]")
        ?.addEventListener("change", (event) =>
          preference({ show_crossings: event.target.checked }).catch(
            messageError,
          ),
        );
      target
        .querySelector("[data-setting-empty]")
        ?.addEventListener("change", (event) =>
          preference({ calendar_hide_empty: event.target.checked }).catch(
            messageError,
          ),
        );
      target
        .querySelector("[data-personal-backup]")
        ?.addEventListener("click", async (event) => {
          const button = event.target;
          button.disabled = true;
          try {
            const data = await call("getRespaldoCompleto"),
              url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              ),
              a = doc.createElement("a");
            a.href = url;
            a.download =
              "panel-bajio-respaldo-" +
              new Date().toISOString().slice(0, 10) +
              ".json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            button.textContent = "Respaldo descargado";
          } catch (error) {
            dialog.querySelector(".personal-error").textContent = error.message;
          } finally {
            button.disabled = false;
          }
        });
    } catch (error) {
      target.innerHTML = `<p class="personal-error">${esc(error.message)}</p><p>Esta versión requiere ejecutar SQL 020 de la entrega en Supabase y publicar los archivos actualizados en Apps Script.</p>`;
    }
  }
  badge.onclick = statusDialog;
  doc.addEventListener("click", (event) => {
    if (event.target.closest("[data-personal-history]"))
      doc.getElementById("sidebar-historico-btn")?.click();
    if (event.target.closest("[data-personal-status]")) statusDialog();
  });
  window.addEventListener("panel:identity", () =>
    start()
      .then(() => {
        // La identidad del panel se confirma después de restaurar Auth: aplicar también en ese momento.
        notify("panel:personal-preferences", preferences);
      })
      .catch(messageError),
  );
  window.addEventListener("panel:save", (event) => {
    if (event.detail?.phase === "success") completed = null;
    if (event.detail?.phase === "reset") {
      owner = "";
      generation++;
      health = null;
      healthPromise = null;
      completed = null;
      preferenceQueue = Promise.resolve();
      preferenceRevision++;
      preferences = { calendar_hide_empty: true, show_crossings: false };
    }
  });
  const feedback = doc.createElement("p");
  feedback.id = "personal-feedback";
  feedback.className = "personal-feedback";
  feedback.hidden = true;
  (doc.querySelector("header.top") || badge).after(feedback);
  return {
    domain,
    groupNotices,
    nextAction: domain.nextAction,
    exportSnapshot,
    reviewImport: (rows, name) => reviewImport(api, ensure, rows, name),
    ensure,
    start,
    preference,
    syncNoticeState,
    renderMiles: miles,
    renderDocuments,
    renderCompleted,
    statusDialog,
    get preferences() {
      return preferences;
    },
  };
}
