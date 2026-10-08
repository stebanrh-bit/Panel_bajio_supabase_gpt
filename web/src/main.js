import { createClient } from "@supabase/supabase-js";
import {
  statuses,
  stages,
  booleanFields,
  dateFields,
  marked,
  stageIndex,
  alertFor,
  attentionFor,
  localDateInput,
  historyDiff,
  reminderStatuses,
  prepareLoadValues,
} from "./load-rules.js";
import { escapeHtml as escape } from "./ui/html.js";
import { createPendingLoadsService } from "./features/pending-loads/service.js";
import { createPendingLoadsPanel } from "./features/pending-loads/panel.js";
import { createReservedLoadsService } from "./features/reserved-loads/service.js";
import { createReservedLoadsPanel } from "./features/reserved-loads/panel.js";
import { createTeamService } from "./features/team/service.js";
import { createTeamPanel } from "./features/team/panel.js";
import { createTemplatesPanel } from "./features/team/templates.js";
import { createAccountPanel } from "./features/team/account.js";
import { createShiftsService } from "./features/shifts/service.js";
import { createShiftsPanel } from "./features/shifts/panel.js";
import { createPortalService } from "./features/portal/service.js";
import { createPortalPanel } from "./features/portal/panel.js";
import { fetchAll } from "./data/supabase.js";
import { createImportsPanel } from "./features/imports/panel.js";
import { createImportsService } from "./features/imports/service.js";
import {
  createArchivePanel,
  createArchiveService,
} from "./features/archive/panel.js";
import {
  createOverviewPanel,
  createOverviewService,
} from "./features/overview/panel.js";
import { createRadarPanel } from "./features/radar/panel.js";
import { createRadarService } from "./features/radar/service.js";
import { mountLoadActions, bulkEditor } from "./features/loads/actions.js";
import { bindIncidentForm } from "./features/incidents/form.js";
import { appShellMarkup } from "./ui/app-shell.js";
import {
  operationMarkup,
  loadCardsMarkup,
  loadRowsMarkup,
  matchesOperationFilter,
} from "./features/loads/presentation.js";
import {
  mountLoadWorkspace,
  mountEditorWorkspace,
} from "./features/loads/workspace.js";
import "./style.css";
import "./theme/original.css";
import "./theme/adaptation.css";
const root = document.querySelector("#app");
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let client,
  session,
  profile,
  loads = [],
  activeLoad = null,
  filter = "all",
  generation = 0;
let secondaryPanel = null;
let currentModule = "home";
let loadView = "cards";
const fields = {
  load: "Número de carga",
  customer: "Cliente",
  origin_city: "Ciudad de origen",
  origin_state: "Estado de origen",
  origin_address: "Dirección de origen",
  dest_city: "Ciudad de destino",
  dest_state: "Estado de destino",
  dest_address: "Dirección de destino",
  truck: "Unidad",
  trailer: "Remolque",
  status: "Estatus",
  pickup_appt: "Cita de recolección",
  pickup_actual: "Recolección real",
  delivery_appt: "Cita de entrega",
  delivery_actual: "Entrega real",
  salida_mexico_fecha: "Salida de planta",
  cruce_usa_fecha: "Cruce de aduana",
  cruce_confirmado: "Cruce confirmado",
  bol: "BOL listo",
  doda: "DODA listo",
  entry: "Entry listo",
  sobre_listo: "Sobre listo",
  pod_sent: "POD compartido",
  recargos_vg: "Recargos VG cobrados",
  recordatorio_fecha: "Recordatorio / despacho",
  next_review_at: "Próxima revisión",
  next_review_note: "Nota de próxima revisión",
  tracking_link: "Enlace de seguimiento",
  eta_note: "Nota de ETA",
  work_order: "Orden de trabajo",
  doc_status: "Estado de documentos",
  exportacion: "Exportación",
  importacion: "Importación",
  pedimentos: "Pedimentos",
  regresos: "Regresos",
  loaded_miles: "Millas cargadas",
  empty_miles: "Millas vacías",
  rpm: "Tarifa por milla",
  charges: "Cargos",
  pickup_delta_min: "Desfase recolección (minutos)",
  delivery_delta_min: "Desfase entrega (minutos)",
  operacion_pais: "País de operación",
  siguiente_movimiento: "Siguiente movimiento",
  color: "Marca operativa",
};
const writable = () => ["admin", "csr"].includes(profile?.role);
const formatDate = (value) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString()
    : String(value || "—");
const formatField = (field, value) =>
  booleanFields.includes(field)
    ? marked(value)
      ? "Sí"
      : "No"
    : dateFields.includes(field)
      ? formatDate(value)
      : String(value ?? "") || "—";
function error(message) {
  const el =
    document.querySelector("#workspace-message") ||
    document.querySelector("#message");
  if (el) {
    el.textContent = message;
    el.setAttribute("role", "alert");
  }
}
async function request(query) {
  const { data, error: err } = await query;
  if (err) {
    if (["PGRST205", "PGRST202", "42P01", "42703"].includes(err.code))
      throw Error(
        "Falta aplicar la actualización completa de la base de datos. Consulta la guía de instalación del sitio.",
      );
    throw err;
  }
  return data;
}
function shell(content) {
  disposeSecondaryPanel();
  document.documentElement.classList.remove("ws-open");
  root.innerHTML = appShellMarkup({
    content,
    session,
    profile,
    module: currentModule,
    attentionCount: loads.filter(
      (row) => attentionFor(row) || marked(row.client_notify_pending),
    ).length,
  });
  root.querySelectorAll("[data-module]").forEach((button) => {
    button.onclick = () => navigateModule(button.dataset.module);
  });
  document
    .querySelector("#header-refresh")
    ?.addEventListener("click", () => navigateModule(currentModule));
  const showNotices = async () => {
    await dashboard();
    filter = "attention";
    renderRows();
  };
  document
    .querySelector("#header-avisos")
    ?.addEventListener("click", showNotices);
  document
    .querySelector("#mobile-avisos")
    ?.addEventListener("click", showNotices);
  document.querySelector("#mobile-more")?.addEventListener("click", (event) => {
    const open = document
      .querySelector("#sidebar")
      .classList.toggle("abierta-movil");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  document.querySelector("#logout")?.addEventListener("click", async () => {
    try {
      const { error: err } = await client.auth.signOut();
      if (err) throw err;
      clearSession();
      login();
    } catch (err) {
      error(err.message);
    }
  });
}
/** Cada botón conserva su módulo de Supabase; solo cambia la presentación. */
function navigateModule(name) {
  if (name === "loads") return dashboard();
  if (name === "pending") return showPendingLoads();
  if (name === "reserved") return showReservedLoads();
  if (["home", "calendar", "metrics"].includes(name))
    return showSecondaryModule(
      name,
      (options) => createOverviewPanel({ ...options, mode: name }),
      createOverviewService,
    );
  const modules = {
    shifts: [createShiftsPanel, createShiftsService],
    team: [createTeamPanel, createTeamService],
    templates: [createTemplatesPanel, createTeamService],
    account: [createAccountPanel, createTeamService],
    radar: [createRadarPanel, createRadarService],
    archive: [createArchivePanel, createArchiveService],
    imports: [createImportsPanel, createImportsService],
  };
  if (modules[name]) return showSecondaryModule(name, ...modules[name]);
}
/** Detiene respuestas del módulo anterior cuando se cambia de pantalla o se cierra sesión. */
function disposeSecondaryPanel() {
  secondaryPanel?.dispose();
  secondaryPanel = null;
}
function clearSession() {
  disposeSecondaryPanel();
  generation++;
  session = null;
  profile = null;
  loads = [];
  activeLoad = null;
}

/** Los módulos comparten sesión, navegación y protección contra respuestas tardías. */
async function showSecondaryModule(moduleName, createPanel, createService) {
  if (
    !session ||
    !profile ||
    ["pending", "client"].includes(profile.role) ||
    profile.active === false
  )
    return;
  const current = ++generation;
  currentModule = moduleName;
  activeLoad = null;
  shell('<div id="secondary-module"></div>');
  try {
    const [people, nextLoads] = await Promise.all([
      fetchAll(
        () => client.from("profiles").select("*").order("id"),
        "SQL 005",
      ),
      fetchAll(() =>
        client
          .from("loads")
          .select("*,incidents(count)")
          .eq("archived", false)
          .order("load"),
      ),
    ]);
    if (current !== generation || !session) return;
    loads = nextLoads.map((row) => ({
      ...row,
      incidenciasCount: row.incidents?.[0]?.count || 0,
    }));
    secondaryPanel = createPanel({
      container: document.querySelector("#secondary-module"),
      service: createService(client),
      loads,
      userId: session.user.id,
      role: profile.role,
      people,
      client,
      onNavigate: navigateModule,
      onError: (message) => {
        if (current === generation && session) error(message);
      },
      onOpenLoad: async (loadNumber) => {
        if (current !== generation || !session) return;
        await refreshLoad(loadNumber);
      },
    });
    await secondaryPanel.open();
  } catch (err) {
    if (current !== generation || !session) return;
    shell(
      '<section class="card"><h2>No se pudo abrir el módulo</h2><button id="module-retry">Reintentar</button></section>',
    );
    error(err.message);
    document.querySelector("#module-retry").onclick = () =>
      showSecondaryModule(moduleName, createPanel, createService);
  }
}
function showPendingLoads() {
  return showSecondaryModule(
    "pending",
    createPendingLoadsPanel,
    createPendingLoadsService,
  );
}
function showReservedLoads() {
  return showSecondaryModule(
    "reserved",
    createReservedLoadsPanel,
    createReservedLoadsService,
  );
}
/** Entrada con Supabase Auth; el panel nunca guarda una contraseña en sus tablas. */
function login() {
  shell(
    `<section class="card narrow"><h2>Entrar al panel</h2><p>Usa la cuenta que te asignó el administrador.</p><form id="login"><label>Correo<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button>Iniciar sesión</button></form></section>`,
  );
  document.querySelector("#login").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const values = new FormData(event.target);
      const { data, error: err } = await client.auth.signInWithPassword({
        email: values.get("email"),
        password: values.get("password"),
      });
      if (err) throw err;
      session = data.session;
      await dashboard({ openHome: true });
    } catch (err) {
      error(err.message);
    } finally {
      button.disabled = false;
    }
  });
}
/** Comprueba el perfil primero; clientes entran al portal antes de consultar tablas internas. */
async function dashboard({ openHome = false } = {}) {
  if (!session) return login();
  disposeSecondaryPanel();
  currentModule = "loads";
  const current = ++generation;
  try {
    const nextProfile = await request(
      client.from("profiles").select("*").eq("id", session.user.id).single(),
    );
    if (current !== generation || !session) return;
    profile = nextProfile;
    if (profile.role === "pending" || profile.active === false) {
      shell(
        profile.active === false
          ? '<section class="card"><h2>Acceso desactivado</h2><p>Solicita a tu administrador que reactive tu acceso.</p></section>'
          : '<section class="card"><h2>Acceso pendiente</h2><p>Tu administrador debe asignarte un rol antes de que puedas consultar cargas.</p></section>',
      );
      return;
    }
    if (profile.role === "client") {
      currentModule = "portal";
      shell('<div id="client-portal"></div>');
      secondaryPanel = createPortalPanel({
        container: document.querySelector("#client-portal"),
        service: createPortalService(client),
        onError: (message) => {
          if (current === generation && session) error(message);
        },
      });
      await secondaryPanel.open();
      return;
    }
    const nextLoads = [];
    for (let offset = 0; ; offset += 500) {
      const batch = await request(
        client
          .from("loads")
          .select("*,incidents(count)")
          .eq("archived", false)
          .order("load")
          .range(offset, offset + 499),
      );
      if (current !== generation || !session) return;
      nextLoads.push(
        ...batch.map((row) => ({
          ...row,
          incidenciasCount: row.incidents?.[0]?.count || 0,
        })),
      );
      if (batch.length < 500) break;
    }
    loads = nextLoads;
    activeLoad = null;
    if (openHome) return navigateModule("home");
    shell(operationMarkup(loads, writable()));
    renderRows();
    document
      .querySelector("#search")
      .addEventListener("input", () => renderRows());
    document.querySelectorAll("[data-filter]").forEach(
      (button) =>
        (button.onclick = () => {
          filter = button.dataset.filter;
          renderRows();
        }),
    );
    document.querySelector("#customer-filter").onchange = renderRows;
    document.querySelector("#view-toggle").onclick = () => {
      loadView = loadView === "cards" ? "table" : "cards";
      renderRows();
    };
    document
      .querySelector("#refresh")
      .addEventListener("click", () => dashboard());
    document.querySelector("#new")?.addEventListener("click", () => editor());
    document.querySelector("#bulk")?.addEventListener("click", () =>
      bulkEditor({
        container: document.querySelector("#detail"),
        client,
        onError: error,
        onSaved: dashboard,
        isCurrent: () => current === generation && Boolean(session),
        items: [
          ...new Set(
            [...document.querySelectorAll("[data-load-select]:checked")].map(
              (input) => input.dataset.loadSelect,
            ),
          ),
        ].map((id) => loads.find((row) => row.load === id)),
      }),
    );
  } catch (err) {
    if (current !== generation || !session) return;
    shell(
      '<section class="card"><h2>No se pudieron cargar los datos</h2><button id="retry">Reintentar</button></section>',
    );
    error(err.message);
    document.querySelector("#retry").onclick = dashboard;
  }
}
/** La vista de tarjetas y la tabla comparten exactamente los mismos filtros. */
function renderRows() {
  if (!document.querySelector("#rows")) return;
  const search = document.querySelector("#search").value.toLocaleLowerCase();
  const customer = document.querySelector("#customer-filter").value;
  const filtered = loads.filter(
    (row) =>
      [
        row.load,
        row.customer,
        row.origin_city,
        row.dest_city,
        row.truck,
        row.trailer,
        row.work_order,
      ].some((value) =>
        String(value ?? "")
          .toLocaleLowerCase()
          .includes(search),
      ) &&
      (!customer || row.customer === customer) &&
      matchesOperationFilter(row, filter),
  );
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === filter;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("active", active);
  });
  const cards = document.querySelector("#cards-view"),
    table = document.querySelector("#table-view");
  cards.innerHTML = loadCardsMarkup(filtered, writable());
  document.querySelector("#rows").innerHTML = loadRowsMarkup(
    filtered,
    writable(),
  );
  cards.hidden = loadView !== "cards";
  table.hidden = loadView !== "table";
  document.querySelector("#view-toggle").textContent =
    loadView === "cards" ? "Vista tabla" : "Vista tarjetas";
  document.querySelectorAll("[data-load]").forEach((button) => {
    button.onclick = () =>
      detail(button.dataset.load, button.dataset.workspaceTab || "operacion");
  });
}
async function refreshLoad(id, initialTab = "operacion") {
  // Actualiza los contadores y las alertas antes de volver a abrir la carga.
  await dashboard();
  if (session && document.querySelector("#detail"))
    await detail(id, initialTab);
}
/** Expediente con consultas independientes y control de la pantalla que inició la petición. */
async function detail(id, initialTab = "operacion") {
  const current = generation;
  activeLoad = id;
  try {
    const row = await request(
      client.from("loads").select("*").eq("load", id).single(),
    );
    const [comments, incidents, history, communications] = await Promise.all([
      request(
        client
          .from("comments")
          .select("*")
          .eq("load", id)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      request(
        client
          .from("incidents")
          .select("*")
          .eq("load", id)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      request(
        client
          .from("load_history")
          .select("*")
          .eq("load", id)
          .order("changed_at", { ascending: false })
          .limit(10),
      ),
      request(
        client
          .from("communications")
          .select("*")
          .eq("load", id)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
    ]);
    if (activeLoad !== id || current !== generation || !session) return;
    const section = document.querySelector("#detail");
    if (!section) return;
    const canEdit = writable() && !row.archived;
    const stage = stageIndex(row),
      attention = attentionFor({ ...row, incidenciasCount: incidents.length });
    const updates = history
      .map((h) => {
        if (!h.before_data)
          return `<li><strong>Carga creada</strong><small class="block">${escape(formatDate(h.changed_at))}</small></li>`;
        const changes = historyDiff(h.before_data, h.after_data).filter(
          (change) => fields[change.key],
        );
        return `<li><small>${escape(formatDate(h.changed_at))}</small>${changes.length ? `<ul>${changes.map((change) => `<li>${fields[change.key]}: ${escape(formatField(change.key, change.before))} → ${escape(formatField(change.key, change.after))}</li>`).join("")}</ul>` : "<p>Actualización de seguimiento y comunicación.</p>"}</li>`;
      })
      .join("");
    section.innerHTML = `<div class="card"><div class="toolbar"><h2>Carga ${escape(id)}</h2>${canEdit ? '<button id="edit">Editar</button><button id="review">Ya revisé</button>' : ""}</div><ol class="timeline" aria-label="Etapas del recorrido">${stages.map((label, index) => `<li class="${index < stage ? "done" : index === stage ? "current" : ""}" ${index === stage ? 'aria-current="step"' : ""}>${label}</li>`).join("")}</ol>${attention ? `<p class="badge warn">${escape(attention)}</p>` : ""}${marked(row.client_notify_pending) ? `<p class="badge warn">Pendiente de avisar: ${escape(row.client_notify_reason)}</p>` : ""}<dl>${Object.entries(
      fields,
    )
      .map(
        ([field, label]) =>
          `<div data-field="${field}"><dt>${label}</dt><dd>${escape(formatField(field, row[field]))}</dd></div>`,
      )
      .join(
        "",
      )}</dl><h3>Comunicaciones con el cliente</h3><p>Registra aquí los avisos que ya enviaste por otro medio.</p>${canEdit ? '<form id="notice"><div class="grid"><label>Canal<select name="channel"><option>WhatsApp</option><option>Correo</option><option>Teléfono</option><option>Otro</option></select></label><label>Tipo de aviso<input name="notice_type" placeholder="Cambio de cita, cruce, retraso…" required maxlength="200"></label></div><button>Registrar aviso enviado</button></form>' : ""}<ul>${communications.map((item) => `<li><strong>${item.event_type === "NOTIFICADO" ? "Aviso registrado" : "Pendiente de avisar"}</strong> ${escape(item.channel)} ${escape(item.notice_type)}<p>${escape(item.reason)}</p><small>${escape(formatDate(item.created_at))}</small></li>`).join("") || "<li>Sin comunicaciones registradas.</li>"}</ul><h3>Comentarios</h3><ul>${comments.map((c) => `<li>${escape(c.body)}<small class="block">${escape(formatDate(c.created_at))}</small></li>`).join("") || "<li>Sin comentarios.</li>"}</ul>${canEdit ? '<form id="comment"><label>Nuevo comentario<textarea name="body" required maxlength="10000"></textarea></label><button>Agregar comentario</button></form>' : ""}<h3>Incidencias</h3><ul>${incidents.map((i) => `<li><strong>${escape(i.category)} · ${escape(i.severity)}</strong><p>${escape(i.description)}</p><p>${escape(i.action_taken)}</p></li>`).join("") || "<li>Sin incidencias.</li>"}</ul>${canEdit ? '<form id="incident"><label>Categoría<select name="category" required><option value="">Selecciona una categoría</option><option>Documentación</option><option>Operador</option><option>Unidad</option><option>Aduana</option><option>Cliente</option><option>Otro</option></select></label><label>Severidad<select name="severity"><option value="baja">Informativa</option><option value="media">Media</option><option value="alta">Crítica</option></select></label><label>Descripción<textarea name="description" required maxlength="10000"></textarea></label><label>Acción tomada<textarea name="action_taken" maxlength="10000"></textarea></label><button>Registrar incidencia</button></form>' : ""}<div id="load-extra-actions"></div><h3>Últimos cambios</h3><ul>${updates || "<li>Sin cambios registrados.</li>"}</ul></div>`;
    mountLoadWorkspace(section, {
      row,
      initialTab,
      onClose: () => {
        activeLoad = null;
        section.replaceChildren();
      },
    });
    document
      .querySelector("#edit")
      ?.addEventListener("click", () => editor(row));
    document
      .querySelector("#review")
      ?.addEventListener("click", async (event) => {
        event.target.disabled = true;
        try {
          await request(
            client.rpc("review_load", {
              p_load: id,
              p_version: row.updated_at,
            }),
          );
          await refreshLoad(id);
        } catch (err) {
          error(err.message);
        } finally {
          event.target.disabled = false;
        }
      });
    document
      .querySelector("#notice")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = event.target.querySelector("button");
        button.disabled = true;
        try {
          const values = Object.fromEntries(new FormData(event.target));
          await request(
            client.rpc("confirm_client_notice", {
              p_load: id,
              p_version: row.updated_at,
              p_channel: values.channel,
              p_notice_type: values.notice_type.trim(),
            }),
          );
          await refreshLoad(id);
        } catch (err) {
          error(err.message);
        } finally {
          button.disabled = false;
        }
      });
    const incidentForm = document.querySelector("#incident");
    if (incidentForm)
      bindIncidentForm({
        form: incidentForm,
        loadNumber: id,
        saveIncident: (values) =>
          request(client.from("incidents").insert(values)),
        onSaved: () => refreshLoad(id, "incidencias"),
        onError: error,
        isCurrent: () =>
          activeLoad === id && current === generation && Boolean(session),
      });
    for (const [formId, table] of [["comment", "comments"]]) {
      document
        .querySelector(`#${formId}`)
        ?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const button = event.target.querySelector("button");
          button.disabled = true;
          try {
            const values = Object.fromEntries(
              [...new FormData(event.target)].map(([k, v]) => [k, v.trim()]),
            );
            await request(client.from(table).insert({ ...values, load: id }));
            await refreshLoad(id);
          } catch (err) {
            error(err.message);
          } finally {
            button.disabled = false;
          }
        });
    }
    await mountLoadActions({
      container: section.querySelector("#load-extra-actions"),
      row,
      client,
      role: profile.role,
      userId: session.user.id,
      isCurrent: () =>
        activeLoad === id && current === generation && Boolean(session),
      onSaved: refreshLoad,
      onError: error,
    });
  } catch (err) {
    if (current === generation && session) error(err.message);
  }
}
/** Envía solo los cambios y exige la versión que el operador vio al abrir el formulario. */
function editor(row = {}) {
  activeLoad = null;
  const section = document.querySelector("#detail");
  const statusChoices = [...new Set([...statuses, row.status].filter(Boolean))];
  const inputs = Object.entries(fields)
    .map(([field, label]) => {
      if (booleanFields.includes(field))
        return `<label class="checkbox"><input type="checkbox" name="${field}" ${marked(row[field]) ? "checked" : ""}>${label}</label>`;
      if (field === "status")
        return `<label>${label}<select name="status">${statusChoices.map((status) => `<option ${status === (row.status || "Cargando") ? "selected" : ""}>${escape(status)}</option>`).join("")}</select></label>`;
      if (dateFields.includes(field))
        return `<label>${label}<input type="datetime-local" name="${field}" value="${localDateInput(row[field])}"></label>`;
      return `<label>${label}<input name="${field}" value="${escape(row[field])}" ${field === "load" ? `required ${row.load ? "readonly" : ""}` : ""} ${field === "tracking_link" ? 'type="url" maxlength="2000"' : ""}></label>`;
    })
    .join("");
  section.innerHTML = `<div class="card"><h2>${row.load ? "Editar carga" : "Nueva carga"}</h2><p>Las fechas se muestran en tu zona horaria: ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}. En tránsito se agenda una revisión cada tres horas.</p><form id="editor"><div class="grid">${inputs}</div><button>Guardar</button> <button type="button" id="cancel">Cancelar</button></form></div>`;
  mountEditorWorkspace(
    section,
    row.load ? `Editar load ${row.load}` : "Nueva carga",
    () => section.replaceChildren(),
  );
  const form = document.querySelector("#editor");
  const reminder = form.elements.recordatorio_fecha;
  const updateRequired = () => {
    reminder.required = reminderStatuses.includes(form.elements.status.value);
  };
  form.elements.status.addEventListener("change", updateRequired);
  updateRequired();
  document.querySelector("#cancel").onclick = () => {
    document.documentElement.classList.remove("ws-open");
    section.replaceChildren();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      // Envía solo cambios: conserva los segundos de las fechas y los textos importados.
      const { values, changes: changed } = prepareLoadValues(
        Object.fromEntries(new FormData(form)),
        Object.fromEntries(
          booleanFields.map((field) => [field, form.elements[field].checked]),
        ),
        row,
      );
      if (row.load) {
        if (Object.keys(changed).length) {
          const data = await request(
            client
              .from("loads")
              .update(changed)
              .eq("load", row.load)
              .eq("updated_at", row.updated_at)
              .select("load"),
          );
          if (!data.length)
            throw Error(
              "La carga cambió desde que la abriste. Actualiza y revisa los cambios antes de guardar.",
            );
        }
      } else await request(client.from("loads").insert(values));
      await refreshLoad(values.load);
    } catch (err) {
      error(err.message);
    } finally {
      button.disabled = false;
    }
  };
}
if (!url || !key) {
  shell(
    '<section class="card narrow"><h2>Conecta tu proyecto Supabase</h2><p>La conexión aún no está configurada. Sigue la guía README.md del repositorio para preparar el proyecto e iniciar el panel.</p></section>',
  );
} else {
  try {
    client = createClient(url, key);
    const { data, error: err } = await client.auth.getSession();
    if (err) throw err;
    session = data.session;
    if (session) await dashboard({ openHome: true });
    else login();
    client.auth.onAuthStateChange((event, newSession) => {
      session = newSession;
      if (event === "SIGNED_OUT") {
        clearSession();
        login();
      }
    });
  } catch (err) {
    shell(
      '<section class="card"><h2>No se pudo iniciar la conexión</h2></section>',
    );
    error(err.message);
  }
}
