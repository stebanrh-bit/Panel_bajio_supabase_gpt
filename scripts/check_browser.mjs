import { formatMoment } from "../web/src/original/usability.js";
import { readPanelSource } from "./panel_source.mjs";
/**
 * Comprobación de la presentación prevista y el HTML entregable con datos independientes.
 * Inicio fue simplificado a petición del usuario; el patrón interno usa esa presentación nueva.
 * Todas las peticiones Supabase se interceptan: esta prueba nunca escribe en producción.
 * Ejecutar después de build + package_site.py. Necesita Chromium y playwright-core externo.
 */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { originalPage } from "../web/src/original/page.js";
import config from "../web/src/original/config.js";
import { loadHistoryItems } from "../web/src/original/history.js";
const { chromium } = await import(
  pathToFileURL(
    (process.env.PANEL_BROWSER_TOOLS || "/tmp/panel-browser-tools") +
      "/node_modules/playwright-core/index.mjs",
  ).href
);
const { PNG } = await import(
  pathToFileURL(
    (process.env.PANEL_BROWSER_TOOLS || "/tmp/panel-browser-tools") +
      "/node_modules/pngjs/lib/png.js",
  ).href
);
const base =
  process.env.PANEL_PREVIEW_URL || "http://127.0.0.1:5182/index-sitio.html";
const legacyXls = process.argv.includes("--legacy-xls");
const legacyLibrary = legacyXls
  ? await readFile(
      process.env.PANEL_SHEETJS_FILE || "/tmp/panel-audit-sheetjs.js",
    )
  : null;
const root = new URL("../", import.meta.url),
  read = (file) => readFile(new URL(file, root), "utf8");
const now = new Date("2026-10-08T18:00:00Z"),
  future = "2026-10-09T18:00:00Z",
  past = "2026-10-08T16:00:00Z";
const adminId = "11111111-1111-4111-8111-111111111111",
  csrId = "22222222-2222-4222-8222-222222222222";
const profiles = [
  { id: adminId, display_name: "Esteban", role: "admin", active: true },
  { id: csrId, display_name: "Ana", role: "csr", active: true },
  {
    id: "33333333-3333-4333-8333-333333333333",
    display_name: "Abraham",
    role: "admin",
    active: true,
  },
];
const stamp = "2026-10-08T17:00:00Z";
const rawLoads = [
  {
    load: "VISUAL-001",
    customer: "ACME",
    origin_city: "Monterrey",
    origin_state: "NL",
    dest_city: "Laredo",
    dest_state: "TX",
    truck: "T-102",
    trailer: "R-210",
    status: "En transito",
    pickup_appt: stamp,
    delivery_appt: future,
    recordatorio_fecha: future,
    next_review_at: past,
    next_review_note: "Confirmar llegada",
    updated_at: stamp,
    updated_by: csrId,
    client_notify_pending: "true",
    client_notify_reason: "Cambio de cita",
    client_notify_since: stamp,
    bol: "true",
    doda: "true",
    entry: "false",
    pod_sent: "false",
    archived: false,
  },
  {
    load: "VISUAL-002",
    customer: "ACME",
    origin_city: "Bajío",
    dest_city: "Dallas",
    status: "Cargando",
    updated_at: stamp,
    archived: false,
    pod_sent: "false",
  },
  {
    load: "VISUAL-003",
    customer: "ACME",
    origin_city: "Bajío",
    dest_city: "Laredo",
    status: "DELIVERED",
    pod_sent: "true",
    updated_at: stamp,
    archived: false,
  },
];
const name = (id) =>
  profiles.find((row) => row.id === id)?.display_name || id || "";
const rawHistory = [
  {
    id: "h-create",
    load: "VISUAL-001",
    actor: adminId,
    changed_at: "2026-10-07T18:00:00Z",
    before_data: null,
    after_data: { status: "Cargando", trailer: "R-210" },
  },
  {
    id: "h-change",
    load: "VISUAL-001",
    actor: csrId,
    changed_at: stamp,
    before_data: {
      status: "Cargando",
      trailer: "R-210",
      pod_sent: false,
      charges: 0,
      next_review_at: "",
      truck_source: "archivo",
      next_review_note: "",
    },
    after_data: {
      status: "En transito",
      trailer: "TRAILER-COMPLETO-12345678901234567890",
      pod_sent: true,
      charges: 125,
      next_review_at: future,
      truck_source: "manual",
      next_review_note: "<img src=x onerror=alert(1)>",
    },
  },
];
const legacyLoads = rawLoads.map((raw, index) => ({
  ...raw,
  updated_by: name(raw.updated_by),
  bol: raw.bol === "true",
  doda: raw.doda === "true",
  entry: false,
  pod_sent: raw.pod_sent === "true",
  client_notify_pending: raw.client_notify_pending === "true",
  stageIndex: [6, 0, 9][index],
  stageKey: ["en_transito", "programado", "pod"][index],
  stageLabel: ["En tránsito", "Programado", "POD"][index],
  alertLevel: "good",
  alertMessage: "En tiempo.",
  incidenciasCount: 0,
}));
const pendingRow = {
  id: "33333333-3333-4333-8333-333333333333",
  customer: "ACME",
  origin: "Monterrey",
  destination: "Laredo",
  estimated_date: future,
  note: "Pendiente de confirmar",
  state: "pending",
  created_by: csrId,
  created_at: stamp,
  updated_at: stamp,
};
const taskRow = {
  id: "44444444-4444-4444-8444-444444444444",
  load: "VISUAL-001",
  note: "Confirmar llegada",
  state: "open",
  assigned_to: adminId,
  assigned_csr: null,
  color: "warn",
  shift: "07:00–16:00",
  created_by: csrId,
  created_at: stamp,
  updated_at: stamp,
  follow_up_at: future,
};
const reservedRow = {
  id: "55555555-5555-4555-8555-555555555555",
  load: "APARTADO-001",
  csr_owner: "Ana",
  origin: "Laredo",
  destination: "Dallas",
  crossing_at: future,
  own_load: "MI-CARGA",
  review_hours: 3,
  state: "cruce",
  next_review_at: future,
  note: "Regreso confirmado",
  created_by: adminId,
  updated_by: adminId,
  created_at: stamp,
  updated_at: stamp,
};
const legacyPending = {
  id: pendingRow.id,
  cliente: "ACME",
  origen: "Monterrey",
  destino: "Laredo",
  fecha_estimada: future,
  nota: pendingRow.note,
  creado_por: "Ana",
  creado_en: stamp,
};
const legacyTask = {
  id: taskRow.id,
  turno: taskRow.shift,
  nota: taskRow.note,
  load: taskRow.load,
  asignado_a: "Esteban",
  asignado_csr: "",
  creado_por: "Ana",
  creado_en: stamp,
  resuelto: false,
  resuelto_en: "",
  color: "warn",
  fecha_seguimiento: future,
};
const legacyReserved = {
  id: reservedRow.id,
  load: reservedRow.load,
  csr_dueno: "Ana",
  origen: "Laredo",
  destino: "Dallas",
  fecha_cruce: future,
  fecha_entrega: "",
  mi_carga: "MI-CARGA",
  fecha_mi_carga: "",
  frecuencia_horas: 3,
  proxima_revision: future,
  estado: "cruce",
  nota: reservedRow.note,
  creado_por: "Esteban",
  creado_en: stamp,
  actualizado_por: "Esteban",
  actualizado_en: stamp,
  historial: [],
};
const fixtures = {
  getPersonas: JSON.stringify(
    profiles.map((row) => ({
      nombre: row.display_name,
      rol: row.role === "admin" ? "Supervisor" : "CSR",
      correo: "",
      passwordSet: true,
      sigueA: [],
    })),
  ),
  getAsignaciones: JSON.stringify([{ cliente: "ACME", csr: "Ana" }]),
  getLoadSeguimientos: "[]",
  getUltimosComentarios: "{}",
  getDetalleCarga: { ok: true, record: legacyLoads[0] },
  getLoadsDelta: {
    ok: true,
    full: true,
    ts: now.getTime(),
    loads: legacyLoads,
  },
  getPendientes: JSON.stringify([legacyPending]),
  getBitacoraTurno: JSON.stringify([legacyTask]),
  getBitacoraHistorico: { ok: true, items: [legacyTask] },
  getApartados: { ok: true, items: [legacyReserved] },
  getCierresTurnoRecibidos: { ok: true, items: [] },
  getSlaComunicacion: { ok: true, pairs: [] },
  getMisPlantillas: { ok: true, templates: {}, labels: {} },
  getImportInfo: { lastImportAt: "", deshacerDisponibleDesde: "" },
  verifyIdentityLogin: { ok: true, token: "supabase-session" },
  checkCsrPassword: { ok: true },
  getPortalClientes: { ok: true, items: [] },
  getBloqueos: { ok: true, items: [] },
  getBitacoraAdmin: { ok: true, items: [] },
  getComments: "[]",
  getIncidencias: "[]",
  getHistorialLoad: {
    ok: true,
    items: loadHistoryItems([...rawHistory].reverse(), "VISUAL-001", name),
  },
  getComunicaciones: { ok: true, items: [] },
  getComunicacionesPorCliente: { ok: true, items: [] },
  getRadarExcel: { ok: true, excel: null },
  getCoordenadas: { ok: true, items: {} },
  getDirecciones: { ok: true, items: {} },
  getDistancias: { ok: true, items: {} },
  getBusquedasDirecciones: { ok: true, items: [] },
};
fixtures.getPanelCambios = {
  ok: true,
  marcas: {},
  datos: {
    loads: fixtures.getLoadsDelta,
    personas: fixtures.getPersonas,
    asignaciones: fixtures.getAsignaciones,
    seguimientos: "[]",
    comentarios: "{}",
    pendientes: fixtures.getPendientes,
    bitacora: fixtures.getBitacoraTurno,
    apartados: fixtures.getApartados,
    cierres: fixtures.getCierresTurnoRecibidos,
  },
};
fixtures.getLoadsForCliente = legacyLoads;
fixtures.getLoadDetailForCliente = {
  ...legacyLoads[0],
  documentos: { bol: true, doda: true, entry: false, sobreListo: false },
  incidencias: [],
  avisos: [],
};
fixtures.getLoadsParaVista = legacyLoads.map((row) => ({
  ...row,
  csr: "Ana",
  needsAction: false,
  sobre_listo: "",
}));
fixtures.getIncidenciasParaVista = "[]";
const original = originalPage({
  template: await read("web/src/original/index.template.html"),
  styles:
    (await read("web/src/original/panel-styles.css")) +
    "\n" +
    (await read("web/src/original/guidance.css")) +
    "\n" +
    (await read("web/src/original/usability.css")) +
    "\n" +
    (await read("web/src/original/organization.css")),
  script: await readPanelSource(),
  config,
});
const helperSource = (
  (await read("web/src/original/guidance.js")) +
  "\n" +
  (await read("web/src/original/people.js")) +
  "\n" +
  (await read("web/src/original/usability.js")) +
  "\n" +
  (await read("web/src/original/history.js")) +
  "\n" +
  (await read("web/src/original/calendar.js"))
).replace(/^export /gm, "");
const newHelpers = (
  await Promise.all(
    [
      ["content", "escapeHtml,csvCell,safeLink", "panelContent"],
      ["rendering", "renderKeyed,reset", "panelRendering"],
      ["network", "fetchExternal,cancel", "panelNetwork"],
    ].map(
      async ([file, exports, key]) =>
        "<script>(function(){" +
        (await read("web/src/original/" + file + ".js")).replace(
          /^export /gm,
          "",
        ) +
        ";window." +
        key +
        "={" +
        exports +
        "};})()</script>",
    ),
  )
).join("");
const organizationHelpers =
  "<script>(function(){const esc=window.panelContent.escapeHtml;" +
  (await read("web/src/original/dialogs.js"))
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "") +
  (await read("web/src/original/organization.js"))
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "") +
  ";mountOrganization(window.panelApi,document);})()</script>";
const goldenHtml =
  "<!doctype html><html><head>" +
  original.head +
  "</head><body>" +
  original.body +
  "<script>(function(){" +
  helperSource +
  ";window.panelGuidance={reminderEntries,mountGuidance};window.panelPeople={canOperate,isOperational};window.panelUsability={attentionGroups,formatMoment,mountUsability,pendingChange};window.panelHistory={presentHistoryChange};window.panelCalendar={calendarClientKey,reservationCalendarClient,filterCalendarEvents};window.panelUsability.mountUsability(document);})()</script>" +
  newHelpers +
  original.scripts.map((script) => "<script>" + script + "</script>").join("") +
  "<script>window.panelGuidance.mountGuidance(document);</script>" +
  organizationHelpers +
  "</body></html>";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [],
  requests = [],
  screenshots = [];
await mkdir("/tmp/panel-original-comparison", { recursive: true });
let incidentSaves = 0;
let importPreviews = 0,
  importSaves = 0,
  previewedRecords = [];
const usabilityLayouts = [];
const incidents = [];
const customerAssignments = [
  {
    customer: "ACME",
    customer_key: "acme",
    owner_id: csrId,
    updated_at: stamp,
  },
];
async function newPage(
  golden = false,
  viewport = { width: 1440, height: 1024 },
  view = "internal",
  identity = profiles[0],
) {
  const page = await browser.newPage({
    viewport,
    timezoneId: "America/Mexico_City",
  });
  await page.clock.setFixedTime(now);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /^(No se completó|Error al mostrar la respuesta)/.test(message.text())
    )
      errors.push(message.text());
  });
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  if (legacyXls)
    await page
      .context()
      .route(
        "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
        (route) =>
          route.fulfill({
            contentType: "application/javascript",
            body: legacyLibrary,
          }),
      );
  // Los servicios externos se prueban por separado; no dependen de una ubicación real aquí.
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.route(
    "https://pwqibuunekrzfcztcfju.supabase.co/**",
    async (route) => {
      requests.push(route.request().url());
      const request = route.request(),
        url = new URL(request.url()),
        table = url.pathname.split("/").at(-1);
      let result = [];
      if (table === "user")
        result = { id: identity.id, email: "prueba@local.test" };
      else if (table === "profiles")
        result = url.searchParams.has("id")
          ? {
              ...identity,
              role:
                view === "client"
                  ? "client"
                  : view === "manager"
                    ? "manager"
                    : "admin",
            }
          : profiles;
      else if (table === "loads") {
        const load = url.searchParams.get("load")?.slice(3);
        if (request.method() === "PATCH") {
          const row = rawLoads.find((item) => item.load === load);
          Object.assign(row, request.postDataJSON(), {
            updated_at: "2026-10-08T18:00:01Z",
          });
          result = [row];
        } else
          result = load ? rawLoads.find((row) => row.load === load) : rawLoads;
      } else if (table === "load_history")
        result = [...rawHistory].sort(
          (a, b) =>
            Date.parse(b.changed_at) - Date.parse(a.changed_at) ||
            String(b.id).localeCompare(String(a.id)),
        );
      else if (table === "customer_assignments") result = customerAssignments;
      else if (table === "ops_assign_customer") {
        const input = request.postDataJSON();
        assert.equal(input.p_owner, adminId);
        Object.assign(customerAssignments[0], {
          owner_id: input.p_owner,
          updated_at: "2026-10-08T18:00:01Z",
        });
        result = null;
      } else if (table === "ops_preview_import") {
        importPreviews += 1;
        previewedRecords = request.postDataJSON().p_records;
        result = previewedRecords.map((record) => ({
          load: record.load,
          new: !rawLoads.some((item) => item.load === record.load),
          version: null,
          changes: Object.keys(record).filter((key) => key !== "load"),
        }));
      } else if (table === "ops_apply_import") {
        importSaves += 1;
        const input = request.postDataJSON();
        assert.deepEqual(input.p_records, previewedRecords);
        assert.equal(input.p_preview.length, input.p_records.length);
        for (const record of input.p_records)
          rawLoads.push({
            ...record,
            status: "Cargando",
            archived: false,
            updated_at: stamp,
            updated_by: adminId,
          });
        result = {
          id: "import-local",
          file_name: input.p_file_name,
          created_at: stamp,
        };
      } else if (table === "pending_loads") result = [pendingRow];
      else if (table === "shift_tasks") result = [taskRow];
      else if (table === "reserved_loads") result = [reservedRow];
      else if (table === "incidents") {
        if (request.method() === "POST") {
          incidentSaves += 1;
          const record = {
            ...request.postDataJSON(),
            id: `incident-${incidentSaves}`,
            created_at: now.toISOString(),
            created_by: adminId,
          };
          incidents.push(record);
          result = record;
        } else result = incidents;
      } else if (table === "ops_portal_loads") result = rawLoads;
      else if (table === "ops_portal_detail")
        result = { ...rawLoads[0], incidents: [], messages: [] };
      else if (table === "ops_original_marks")
        result = {
          ok: true,
          marcas: Object.fromEntries(
            [
              "loads",
              "personas",
              "comentarios",
              "pendientes",
              "bitacora",
              "apartados",
              "cierres",
            ].map((key) => [key, "fixture-" + incidents.length]),
          ),
        };
      else if (table === "ops_loads_delta") {
        const input = request.postDataJSON();
        result = {
          ok: true,
          full: !input.p_after,
          revision: 100 + incidents.length,
          items: rawLoads.map((row) => ({
            ...row,
            incidenciasCount: incidents.filter((i) => i.load === row.load)
              .length,
          })),
          removed: [],
          next: null,
        };
      } else if (
        [
          "ops_latest_comments",
          "ops_places_by_keys",
          "ops_visible_alerts",
        ].includes(table)
      )
        result = [];
      else if (table === "ops_customer_communications") result = [];
      else if (table === "ops_original_import_info")
        result = fixtures.getImportInfo;
      else if (table === "panel-accounts") {
        const action = request.postDataJSON().action;
        if (action === "directory")
          result = { ok: true, items: JSON.parse(fixtures.getPersonas) };
        else if (["verifyAdmin", "clients", "lockouts"].includes(action))
          result = { ok: true, items: [] };
        else throw Error(`Acción de cuenta sin fixture: ${action}`);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    },
  );
  await page.addInitScript(
    ({ id, displayName, fixtures, golden, view }) => {
      const claims = {
        sub: id,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 86400,
      };
      const token =
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
        "." +
        btoa(JSON.stringify(claims)) +
        ".dummy";
      localStorage.setItem(
        "sb-pwqibuunekrzfcztcfju-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "local-test-only",
          expires_at: claims.exp,
          expires_in: 86400,
          token_type: "bearer",
          user: {
            id,
            email: "prueba@local.test",
            aud: "authenticated",
            role: "authenticated",
          },
        }),
      );
      localStorage.setItem("bajio_view", "cards");
      localStorage.setItem(
        "bajio_inicio_turno_" + displayName,
        new Date().toDateString(),
      );
      localStorage.setItem("bajio_identity_nombre", displayName);
      localStorage.setItem("bajio_identity_token", "supabase-session");
      if (view === "client")
        localStorage.setItem(
          "portalClienteSesion",
          JSON.stringify({
            usuario: "acme",
            nombre: "Cliente",
            cliente: "ACME",
            token: "supabase-session",
          }),
        );
      if (view === "manager")
        localStorage.setItem("vistaGerenciaSesion", "vg_supabase-session");
      if (golden) {
        function runner(success, failure) {
          return new Proxy(
            {},
            {
              get(_, name) {
                if (name === "withSuccessHandler")
                  return (fn) => runner(fn, failure);
                if (name === "withFailureHandler")
                  return (fn) => runner(success, fn);
                return (...args) =>
                  setTimeout(() => {
                    if (name === "getDetalleCarga") {
                      success?.({
                        ok: true,
                        record: fixtures.getLoadsDelta.loads.find(
                          (r) => String(r.load) === String(args[0]),
                        ),
                      });
                      return;
                    }
                    if (name in fixtures) success?.(fixtures[name]);
                    else if (failure) failure(Error(`Sin fixture: ${name}`));
                    else console.error(`No se completó ${name}`);
                  }, 0);
              },
            },
          );
        }
        window.panelApi = { run: runner(), profile: { role: "admin" } };
      }
    },
    {
      id: identity.id,
      displayName: identity.display_name,
      fixtures,
      golden,
      view,
    },
  );
  let html = goldenHtml;
  if (view !== "internal") {
    const pageData = originalPage({
      template: await read(`web/src/original/${view}.template.html`),
      config,
      view,
    });
    html =
      "<!doctype html><html><head>" +
      pageData.head +
      "</head><body>" +
      pageData.body +
      "<script>window.panelFormatting={formatMoment:" +
      formatMoment.toString() +
      "};</script>" +
      pageData.scripts
        .map((script) => "<script>" + script + "</script>")
        .join("") +
      "</body></html>";
  }
  const filename = `golden-${view}.html`;
  if (golden)
    await page.route(`**/${filename}`, (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
  const target = new URL(base);
  if (view !== "internal")
    target.pathname = target.pathname.replace(
      "index-sitio.html",
      view === "client" ? "index-cliente.html" : "index-gerencia.html",
    );
  await page.goto(golden ? new URL(filename, base).href : target.href);
  if (view === "internal") {
    await page
      .locator("#identity-backdrop.show")
      .waitFor({ state: "hidden" })
      .catch(async (error) => {
        console.error(
          JSON.stringify({
            golden,
            errors,
            identity: await page.locator("#identity-backdrop").innerText(),
            lastRequests: requests.slice(-10),
          }),
        );
        throw error;
      });
    await page
      .locator("#home-cierres")
      .filter({ hasText: "Sin cierres" })
      .waitFor({ state: "attached" });
  } else await page.locator("#shipments-tbody tr").first().waitFor();
  return page;
}
const importsOnly = process.argv.includes("--imports-only");
const pages = importsOnly
  ? [await newPage()]
  : [await newPage(true), await newPage()];
async function both(operation) {
  for (const page of pages) await operation(page);
}
async function compare(name, options = {}) {
  await both((page) => page.waitForTimeout(500));
  await both((page) =>
    page.evaluate(() =>
      document
        .querySelectorAll("#toast-container .toast")
        .forEach((el) => el.remove()),
    ),
  );
  const imageOptions = { animations: "disabled", caret: "hide", ...options };
  const originalImage = await pages[0].screenshot(imageOptions),
    adaptedImage = await pages[1].screenshot(imageOptions);
  await writeFile(
    `/tmp/panel-original-comparison/${name}-original.png`,
    originalImage,
  );
  await writeFile(
    `/tmp/panel-original-comparison/${name}-supabase.png`,
    adaptedImage,
  );
  // Los mismos datos deben producir exactamente la misma imagen, no solo texto parecido.
  const a = PNG.sync.read(originalImage),
    b = PNG.sync.read(adaptedImage);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let differences = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    if (
      [0, 1, 2].some(
        (channel) =>
          Math.abs(a.data[index + channel] - b.data[index + channel]) > 1,
      )
    )
      differences += 1;
  }
  // Chromium puede variar el suavizado de unos píxeles en los bordes de una insignia.
  // Un cambio de posición, texto, tamaño o color de un control supera este margen.
  assert.ok(
    differences <= 50,
    `Diferencia visual en ${name}: ${differences} píxeles; revisar las dos capturas.`,
  );
  screenshots.push(name);
}
try {
  if (!importsOnly) {
    await compare("inicio");
    await both((page) => page.locator("[data-home-tab=turno]").click());
    await compare("mi-turno");
    // Los tres desplegables y las ventanas de alta comparten una presentación legible.
    for (const id of ["pendientes", "bitacora-asignados", "bitacora"]) {
      await both((page) => page.locator(`#${id}-toggle`).click());
      await both(async (page) => {
        assert.equal(
          await page.locator(`#${id}-toggle`).getAttribute("aria-expanded"),
          "false",
        );
        assert.equal(await page.locator(`#${id}-list`).isVisible(), false);
      });
    }
    await compare("turno-secciones-cerradas");
    for (const id of ["pendientes", "bitacora-asignados", "bitacora"])
      await both((page) => page.locator(`#${id}-toggle`).click());
    await both((page) => page.locator("#pendiente-add-btn").click());
    await compare("nueva-solicitud");
    await both((page) => page.locator("#pendiente-close").click());
    await both((page) => page.locator("#bitacora-add-btn").click());
    await compare("nueva-tarea");
    await both((page) => page.locator("#bitacora-close").click());
    await both((page) => page.locator("[data-page=operation]").click());
    await both((page) =>
      page.locator("[data-workspace-load=VISUAL-001]").first().waitFor(),
    );
    await compare("operacion");
    for (const tab of [
      "operacion",
      "tracking",
      "comunicacion",
      "documentos",
      "incidencias",
      "historial",
    ]) {
      if (tab === "operacion")
        await both((page) =>
          page.locator("[data-workspace-load=VISUAL-001]").first().click(),
        );
      else
        await both((page) =>
          page.locator(`[data-workspace-tab=${tab}]`).click(),
        );
      await both((page) => page.waitForTimeout(80));
      await compare(`workspace-${tab}`);
    }
    await both((page) => page.locator("#workspace-close").click());
    await both((page) =>
      page.locator("[data-comments-load=VISUAL-001]").first().click(),
    );
    await compare("comentarios");
    await both((page) => page.locator("#comments-close").click());
    await both((page) =>
      page
        .locator("#page-operation [data-incidencias-load=VISUAL-001]")
        .first()
        .click(),
    );
    await compare("incidencias");
    await both((page) => page.locator("#incidencia-close").click());
    await both((page) => page.locator("#view-toggle-btn").click());
    await compare("tabla");
    await both((page) => page.locator("[data-page=calendario]").click());
    await compare("calendario");
    await both((page) => page.locator("[data-page=indicadores]").click());
    await compare("indicadores");
    await both((page) => page.locator("[data-page=apartados]").click());
    await compare("apartados");
    await both((page) => page.locator("[data-page=radar]").click());
    await compare("radar");
    await both((page) => page.locator("#sidebar-historico-btn").click());
    await compare("historico");
    await both((page) => page.locator("#who-toggle-btn").click());
    await compare("selector-usuario");
    await both((page) => page.locator("#who-drawer-close").click());
    await both((page) => page.locator("#ux-account-menu > summary").click());
    await both((page) => page.locator("#session-change-pw-btn").click());
    await compare("cambiar-contrasena");
    await both((page) => page.locator("#identity-close").click());
    await both((page) => page.locator("#sidebar-manage-csr-btn").click());
    await compare("clave-administracion");
    await both((page) =>
      page.locator("#csr-pw-input").fill("Solo-prueba-local"),
    );
    await both((page) => page.locator("#csr-pw-submit").click());
    await both((page) => page.locator("#csr-backdrop.show").waitFor());
    // El administrador mantiene sus permisos y también puede operar como CSR.
    // Su selector se verifica funcionalmente; las demás ventanas conservan comparación visual.
    assert.equal(
      await pages[1].locator("#session-chip").getAttribute("title"),
      "Admin",
    );
    assert.equal(
      await pages[1]
        .locator('[data-rol-nombre="Esteban"] option:checked')
        .textContent(),
      "Admin",
    );
    assert.equal(
      await pages[1]
        .locator('#csr-new-rol option[value="Supervisor"]')
        .textContent(),
      "Admin",
    );
    assert.equal(
      await pages[1]
        .locator('[data-rol-nombre="Abraham"] option:checked')
        .textContent(),
      "Supervisor",
    );
    assert.equal(
      await pages[1].locator('#csr-asig-csr option[value="Esteban"]').count(),
      1,
    );
    await pages[1].screenshot({
      path: "/tmp/panel-original-comparison/administracion-supabase.png",
    });
    await both((page) => page.locator("#csr-close").click());
    // Comprobar también las ventanas secundarias completas, aunque no haya datos seleccionados.
    for (const modal of [
      "kpi-detail",
      "pendiente",
      "bitacora",
      "vincular",
      "recordatorio",
      "apartado",
      "multimsg",
      "confirmar",
    ]) {
      await both((page) =>
        page.evaluate(
          (id) =>
            document.getElementById(id + "-backdrop").classList.add("show"),
          modal,
        ),
      );
      await compare(`ventana-${modal}`);
      await both((page) =>
        page.evaluate(
          (id) =>
            document.getElementById(id + "-backdrop").classList.remove("show"),
          modal,
        ),
      );
    }
    // Validación usando la UI entregada y el SDK real contra el transporte interceptado.
    const page = pages[1];
    await page.locator("[data-page=operation]").click();
    await page.locator("#view-toggle-btn").click();
    await page
      .locator("#page-operation [data-incidencias-load=VISUAL-001]")
      .first()
      .click();
    await page
      .locator("#incidencia-descripcion")
      .fill("Incidencia de prueba local");
    await page.evaluate(() => {
      const select = document.getElementById("incidencia-categoria");
      select.add(new Option("Sin categoría", ""));
      select.value = "";
    });
    await page.locator("#incidencia-submit").click();
    await page
      .locator("#ux-save-feedback")
      .filter({
        hasText: "Ingresa una categoría para registrar la incidencia.",
      })
      .waitFor();
    assert.equal(incidentSaves, 0);
    await page.locator("#incidencia-categoria").selectOption("Unidad");
    await page.locator("#incidencia-submit").click();
    await page
      .locator("#incidencia-list")
      .filter({ hasText: "Incidencia de prueba local" })
      .waitFor();
    assert.equal(incidentSaves, 1);
    await page.reload();
    await page.locator("[data-page=operation]").click();
    await page
      .locator("#page-operation [data-incidencias-load=VISUAL-001]")
      .first()
      .click();
    await page
      .locator("#incidencia-list")
      .filter({ hasText: "Incidencia de prueba local" })
      .waitFor();
    // Diseño móvil: la comparación usa el mismo ancho y los controles originales.
    await both((page) => page.setViewportSize({ width: 390, height: 844 }));
    await both((page) =>
      page.evaluate(() => {
        document
          .querySelectorAll(".modal-backdrop,.who-drawer-backdrop")
          .forEach((el) => el.classList.remove("show"));
      }),
    );
    await both((page) => page.locator("[data-movil=home]").click());
    // La incidencia creada cambia sus datos; comparar móvil con una pareja nueva limpia.
    incidents.length = 0;
    await both((page) => page.reload());
    await both((page) =>
      page
        .locator("#home-cierres")
        .filter({ hasText: "Sin cierres" })
        .waitFor({ state: "attached" }),
    );
    await compare("movil-inicio");
    // Salir debe limpiar la sesión y mostrar el selector de identidad sin errores.
    await pages[1].setViewportSize({ width: 1440, height: 1024 });
    await pages[1].locator("#ux-account-menu > summary").click();
    await pages[1].locator("#session-logout-btn").click();
    await pages[1].locator("#identity-backdrop.show").waitFor();
    assert.equal(
      await pages[1].evaluate(() =>
        localStorage.getItem("bajio_identity_token"),
      ),
      null,
    );
    for (const view of ["client", "manager"]) {
      await both((page) => page.close());
      pages.splice(
        0,
        pages.length,
        await newPage(true, { width: 1440, height: 1024 }, view),
        await newPage(false, { width: 1440, height: 1024 }, view),
      );
      await compare(`${view}-dashboard`);
      await both((page) => page.locator("#shipments-tbody tr").first().click());
      await both((page) => page.locator("#detail-screen").waitFor());
      await compare(`${view}-detalle`);
      await both((page) => page.setViewportSize({ width: 390, height: 844 }));
      await compare(`${view}-movil`);
    }
    // El mismo administrador puede asignarse clientes y alternar su vista de CSR.
    // Es una extensión solicitada del original: se prueba funcionalmente, sin alterar el patrón visual.
    await both((page) => page.close());
    rawLoads[1].customer = "OTRO CLIENTE";
    const own = await newPage(false);
    pages.splice(0, pages.length, own);
    await own
      .locator("#home-cierres")
      .filter({ hasText: "Sin cierres" })
      .waitFor({ state: "attached" });
    await own.locator("#sidebar-manage-csr-btn").click();
    await own.locator("#csr-pw-input").fill("Solo-prueba-local");
    await own.locator("#csr-pw-submit").click();
    await own.locator("#csr-backdrop.show").waitFor();
    await own.locator('[data-admin-section="customers"]').click();
    await own.locator("#csr-asig-csr").selectOption("Esteban");
    await own.locator("#csr-asig-cliente").selectOption("ACME");
    await own.locator("#csr-asignar-btn").click();
    await own
      .getByText("Cliente asignado: ACME → Esteban", { exact: true })
      .waitFor();
    await own.locator("#csr-close").click();
    assert.equal(
      await own.evaluate(() => window.panelApi.profile.role),
      "admin",
    );
    await own.reload();
    await own
      .locator("#home-cierres")
      .filter({ hasText: "Sin cierres" })
      .waitFor({ state: "attached" });
    await own.locator("[data-page=operation]").click();
    await own.locator("#who-toggle-btn").click();
    await own.locator('[data-who-csr="Esteban"]').click();
    await own
      .locator("#panel-owner-name")
      .filter({ hasText: "Esteban · CSR" })
      .waitFor();
    const ownLoads = await own
      .locator("#page-operation .card[data-load]:visible")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.load).sort());
    // VISUAL-003 ya tiene POD y está finalizada: el filtro En curso no la muestra.
    assert.deepEqual(ownLoads, ["VISUAL-001"]);
    assert.equal(
      await own.locator("#sidebar-manage-csr-btn").isVisible(),
      true,
    );
    await own.screenshot({
      path: "/tmp/panel-original-comparison/supervisor-csr.png",
    });
    await own.locator("#who-toggle-btn").click();
    await own.locator("[data-who-all]").click();
    assert.equal(
      await own.locator("#page-operation .card[data-load]:visible").count(),
      2,
    );
    assert.equal(
      await own.evaluate(() => window.panelApi.profile.role),
      "admin",
    );
  }
  // Cambiar el puesto visible de Abraham no debe cambiar su identidad ni sus permisos.
  const supervisorPage = await newPage(
    false,
    undefined,
    "internal",
    profiles[2],
  );
  try {
    assert.equal(
      await supervisorPage.locator("#session-chip-name").textContent(),
      "Abraham",
    );
    assert.equal(
      await supervisorPage.locator("#session-chip").getAttribute("title"),
      "Supervisor",
    );
    assert.equal(
      await supervisorPage.evaluate(() => window.panelApi.profile.role),
      "admin",
    );
    assert.equal(
      await supervisorPage.locator("#sidebar-manage-csr-btn").isVisible(),
      true,
    );
  } finally {
    await supervisorPage.close();
  }
  // Calendario real con dos clientes: los filtros ocultan los demás eventos y no alteran datos.
  const previousCalendarData = {
    crossing: rawLoads[0].cruce_usa_fecha,
    delivery: rawLoads[1].delivery_appt,
    own: reservedRow.own_load,
  };
  rawLoads[0].cruce_usa_fecha = future;
  rawLoads[1].delivery_appt = future;
  reservedRow.own_load = "VISUAL-001";
  const calendarPage = await newPage(false);
  try {
    await calendarPage.locator('[data-page="calendario"]').click();
    await calendarPage.locator("[data-cal-apartado]").waitFor();
    assert.equal(await calendarPage.locator("#cal-grid .cal-chip").count(), 5);
    for (const [type, count] of [
      ["pickup", 1],
      ["cruce", 1],
      ["entrega", 2],
      ["apartado", 1],
    ]) {
      await calendarPage.locator(`[data-cal-type="${type}"]`).click();
      assert.equal(
        await calendarPage.locator("#cal-grid .cal-chip").count(),
        count,
      );
      assert.equal(
        await calendarPage.locator(`#cal-grid .t-${type}`).count(),
        count,
      );
      assert.equal(
        await calendarPage
          .locator(`[data-cal-type="${type}"]`)
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await calendarPage
          .locator('[data-cal-type][aria-pressed="true"]')
          .count(),
        1,
      );
    }
    await calendarPage.locator("#cal-cliente").selectOption({ label: "ACME" });
    assert.equal(
      await calendarPage.locator("#cal-grid [data-cal-apartado]").count(),
      1,
    );
    await calendarPage.locator('[data-cal-type="entrega"]').click();
    assert.deepEqual(
      await calendarPage
        .locator("#cal-grid [data-cal-load]")
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.calLoad)),
      ["VISUAL-001"],
    );
    await calendarPage.locator("#cal-next").click();
    assert.equal(await calendarPage.locator("#cal-grid .cal-chip").count(), 0);
    assert.equal(
      await calendarPage.locator("#cal-no-results").isVisible(),
      true,
    );
    assert.equal(
      await calendarPage.locator("#cal-cliente").inputValue(),
      "client:acme",
    );
    assert.equal(
      await calendarPage
        .locator('[data-cal-type="entrega"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    await calendarPage.locator("#cal-hoy").click();
    assert.equal(await calendarPage.locator("#cal-grid .cal-chip").count(), 1);
    await calendarPage.locator("#cal-prev").click();
    assert.equal(await calendarPage.locator("#cal-grid .cal-chip").count(), 0);
    await calendarPage.locator("#cal-next").click();
    assert.equal(await calendarPage.locator("#cal-grid .cal-chip").count(), 1);
    await calendarPage.evaluate(() =>
      document
        .querySelectorAll("#toast-container .toast")
        .forEach((node) => node.remove()),
    );
    await calendarPage.screenshot({
      path: "/tmp/panel-original-comparison/calendario-cliente-entrega.png",
    });
    await calendarPage.locator("#cal-grid [data-cal-load]").click();
    await calendarPage.locator("#workspace-backdrop.show").waitFor();
    await calendarPage.locator("#workspace-close").click();
    await calendarPage
      .locator("#cal-cliente")
      .selectOption({ label: "OTRO CLIENTE" });
    assert.deepEqual(
      await calendarPage
        .locator("#cal-grid [data-cal-load]")
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.calLoad)),
      ["VISUAL-002"],
    );
    await calendarPage.locator("#cal-reset").click();
    assert.equal(await calendarPage.locator("#cal-grid .cal-chip").count(), 5);
    // Un apartado sin relación identificable no se mezcla con los clientes conocidos.
    reservedRow.own_load = "Sin referencia";
    await calendarPage.reload();
    await calendarPage.locator('[data-page="calendario"]').click();
    await calendarPage.locator("[data-cal-apartado]").waitFor();
    await calendarPage
      .locator("#cal-cliente")
      .selectOption({ label: "Sin cliente identificado" });
    assert.equal(
      await calendarPage.locator("#cal-grid [data-cal-apartado]").count(),
      1,
    );
    assert.equal(
      await calendarPage.locator("#cal-grid [data-cal-load]").count(),
      0,
    );
    await calendarPage.locator("#cal-grid [data-cal-apartado]").click();
    assert.equal(
      await calendarPage.locator("#page-apartados").isVisible(),
      true,
    );
    await calendarPage.locator('[data-page="calendario"]').click();
    await calendarPage.locator("#cal-reset").click();
    for (const width of [390, 360]) {
      await calendarPage.setViewportSize({ width, height: 844 });
      const pickup = calendarPage.locator('[data-cal-type="pickup"]');
      await pickup.focus();
      await calendarPage.keyboard.press("Space");
      assert.equal(
        await calendarPage.locator("#cal-grid .cal-chip").count(),
        1,
      );
      assert.equal(
        await calendarPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await calendarPage.locator("#cal-reset").click();
      await calendarPage.evaluate(() =>
        document
          .querySelectorAll("#toast-container .toast")
          .forEach((node) => node.remove()),
      );
      await calendarPage.screenshot({
        path: `/tmp/panel-original-comparison/calendario-movil-${width}.png`,
        fullPage: true,
      });
    }
  } finally {
    if (previousCalendarData.crossing === undefined)
      delete rawLoads[0].cruce_usa_fecha;
    else rawLoads[0].cruce_usa_fecha = previousCalendarData.crossing;
    if (previousCalendarData.delivery === undefined)
      delete rawLoads[1].delivery_appt;
    else rawLoads[1].delivery_appt = previousCalendarData.delivery;
    reservedRow.own_load = previousCalendarData.own;
    await calendarPage.close();
  }
  // El CSR de un apartado es texto de VG, independiente de las personas y asignaciones del panel.
  const reservedPage = await newPage(false);
  let reservedRecords = [reservedRow],
    reservedSaves = [];
  try {
    await reservedPage.route("**/rest/v1/reserved_loads**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(reservedRecords),
      }),
    );
    await reservedPage.route(
      "**/rest/v1/rpc/ops_save_reserved_details",
      async (route) => {
        const input = route.request().postDataJSON();
        reservedSaves.push(input);
        const record = {
          ...reservedRow,
          ...input.p_values,
          id:
            input.p_id ||
            `77777777-7777-4777-8777-${String(reservedSaves.length).padStart(12, "0")}`,
          created_by: adminId,
          updated_by: adminId,
        };
        reservedRecords = [
          ...reservedRecords.filter((row) => row.id !== record.id),
          record,
        ];
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(record),
        });
      },
    );
    await reservedPage.locator('[data-page="apartados"]').click();
    await reservedPage.locator("#apartado-nuevo").click();
    assert.equal(await reservedPage.locator("#ap-csr").inputValue(), "");
    assert.equal(
      await reservedPage.locator("#ap-csr").getAttribute("list"),
      null,
    );
    assert.equal(await reservedPage.locator("#ap-csr-lista").count(), 0);
    await reservedPage.locator("#ap-load").fill("VG-EXTERNO-001");
    await reservedPage.locator("#ap-csr").fill("Alicia Vanguard externa");
    await reservedPage.locator("#ap-origen").fill("Laredo, TX");
    await reservedPage.locator("#ap-destino").fill("Dallas, TX");
    await reservedPage.locator("#apartado-guardar").click();
    await reservedPage
      .locator("#apartado-backdrop.show")
      .waitFor({ state: "hidden" });
    assert.equal(
      reservedSaves[0].p_values.csr_owner,
      "Alicia Vanguard externa",
    );
    assert.equal(reservedSaves[0].p_id, null);
    await reservedPage.reload();
    await reservedPage.locator('[data-page="apartados"]').click();
    const newId = reservedRecords.at(-1).id;
    await reservedPage
      .locator(`[data-apartado-id="${newId}"]`)
      .filter({ hasText: "CSR en VG: Alicia Vanguard externa" })
      .waitFor();
    await reservedPage
      .locator(`[data-ap-accion="editar"][data-ap-id="${newId}"]`)
      .click();
    assert.equal(
      await reservedPage.locator("#ap-csr").inputValue(),
      "Alicia Vanguard externa",
    );
    await reservedPage.evaluate(() =>
      document
        .querySelectorAll("#toast-container .toast")
        .forEach((node) => node.remove()),
    );
    await reservedPage.screenshot({
      path: "/tmp/panel-original-comparison/apartado-csr-vg-manual.png",
    });
    await reservedPage.locator("#apartado-cerrar").click();
    // Desde Radar tampoco debe proponer el CSR que tiene asignado el cliente en el panel.
    await reservedPage.route("https://router.project-osrm.org/**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: "Ok",
          routes: [{ distance: 1609.344, duration: 60 }],
        }),
      }),
    );
    await reservedPage.locator('[data-page="radar"]').click();
    await reservedPage.locator("#radar-ver").selectOption("todas");
    await reservedPage.locator("#radar-origen").fill("Laredo, TX");
    await reservedPage.locator("#radar-calcular").click();
    await reservedPage.locator('[data-radar-apartar="VISUAL-001"]').click();
    assert.equal(
      await reservedPage.locator("#ap-load").inputValue(),
      "VISUAL-001",
    );
    assert.equal(await reservedPage.locator("#ap-csr").inputValue(), "");
    await reservedPage.locator("#ap-csr").fill("Roberto equipo VG");
    await reservedPage.locator("#apartado-guardar").click();
    await reservedPage
      .locator("#apartado-backdrop.show")
      .waitFor({ state: "hidden" });
    assert.equal(reservedSaves[1].p_values.csr_owner, "Roberto equipo VG");
    assert.equal(
      await reservedPage.evaluate(() => window.panelApi.profile.display_name),
      "Esteban",
    );
  } finally {
    await reservedPage.close();
  }
  // Los dos accesos laterales tienen destinos distintos y abren las secciones guardadas cerradas.
  // Las entregas sin POD tampoco se ofrecen para vincular: terminar el viaje no depende del POD.
  const originalLoadCount = rawLoads.length;
  rawLoads.push(
    ...[
      "DELIVERED",
      "COMPLETED",
      "Entregado",
      "Completado",
      "Cancelado.",
      "TONU",
    ].map((status, index) => ({
      load: "FINALIZADA-" + index,
      customer: "ACME",
      status,
      archived: false,
      pod_sent: "false",
      recargos_vg: "true",
      updated_at: stamp,
    })),
    {
      load: "ARCHIVADA",
      customer: "ACME",
      status: "Cargando",
      archived: true,
      updated_at: stamp,
    },
  );
  const navigationPage = await newPage(false);
  try {
    await navigationPage.locator('[data-home-tab="turno"]').click();
    for (const id of ["pendientes", "bitacora-asignados", "bitacora"])
      await navigationPage.locator(`#${id}-toggle`).click();
    await navigationPage.locator('[data-page="operation"]').click();
    const requestsButton = navigationPage.locator(
      '[data-page-scroll="home:group-pendientes"]',
    );
    const tasksButton = navigationPage.locator(
      '[data-page-scroll="home:group-bitacora"]',
    );
    await requestsButton.click();
    assert.equal(await requestsButton.getAttribute("aria-current"), "page");
    assert.equal(
      await navigationPage
        .locator("#pendientes-toggle")
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      await navigationPage.locator("#group-pendientes").isVisible(),
      true,
    );
    assert.equal(
      await navigationPage.locator("#group-bitacora").isVisible(),
      false,
    );
    assert.equal(
      await navigationPage.locator("#shift-brief").isVisible(),
      false,
    );
    await navigationPage
      .locator(`[data-vincular-pendiente="${pendingRow.id}"]`)
      .click();
    const available = await navigationPage
      .locator("#vincular-load-select option")
      .evaluateAll((options) => options.map((option) => option.value));
    assert.deepEqual(available.sort(), ["VISUAL-001", "VISUAL-002"]);
    await navigationPage.locator("#vincular-load-search").fill("FINALIZADA");
    assert.equal(
      await navigationPage.locator("#vincular-load-select").inputValue(),
      "",
    );
    assert.equal(
      await navigationPage.locator("#vincular-submit").isDisabled(),
      true,
    );
    await navigationPage.locator("#vincular-load-search").fill("VISUAL-002");
    assert.equal(
      await navigationPage.locator("#vincular-submit").isEnabled(),
      true,
    );
    // Es una lista (size=8): el usuario debe elegir una opción, no se selecciona por filtrar.
    await navigationPage
      .locator("#vincular-load-select")
      .selectOption("VISUAL-002");
    await navigationPage.locator("#vincular-load-search").fill("VISUAL");
    assert.equal(
      await navigationPage.locator("#vincular-load-select").inputValue(),
      "VISUAL-002",
    );
    await navigationPage.locator("#vincular-close").click();
    await tasksButton.click();
    assert.equal(await tasksButton.getAttribute("aria-current"), "page");
    assert.equal(await requestsButton.getAttribute("aria-current"), null);
    assert.equal(
      await navigationPage.locator("#group-pendientes").isVisible(),
      false,
    );
    for (const id of ["bitacora-asignados", "bitacora"]) {
      assert.equal(
        await navigationPage.locator(`#group-${id}`).isVisible(),
        true,
      );
      assert.equal(
        await navigationPage
          .locator(`#${id}-toggle`)
          .getAttribute("aria-expanded"),
        "true",
      );
    }
    await navigationPage.locator("#bitacora-add-btn").click();
    await navigationPage
      .getByRole("combobox", { name: "Asignar a:", exact: true })
      .waitFor();
    assert.equal(
      await navigationPage
        .getByRole("combobox", { name: "Asignar a:", exact: true })
        .isVisible(),
      true,
    );
    assert.deepEqual(
      await navigationPage
        .locator("[data-bitacora-load-option]")
        .evaluateAll((options) =>
          options.map((option) => option.dataset.bitacoraLoadOption).sort(),
        ),
      ["VISUAL-001", "VISUAL-002"],
    );
    await navigationPage.locator("#bitacora-close").click();
    await navigationPage.locator('[data-home-tab="turno"]').click();
    for (const id of ["group-pendientes", "group-bitacora", "shift-brief"])
      assert.equal(await navigationPage.locator(`#${id}`).isVisible(), true);
    await navigationPage.setViewportSize({ width: 360, height: 844 });
    await navigationPage.locator('[data-movil="mas"]').click();
    await requestsButton.click();
    assert.equal(
      await navigationPage.locator("#group-pendientes").isVisible(),
      true,
    );
    assert.equal(
      await navigationPage.locator("#group-bitacora").isVisible(),
      false,
    );
    assert.equal(
      await navigationPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  } finally {
    await navigationPage.close();
    rawLoads.splice(originalLoadCount);
  }
  // Regresión de usabilidad: los controles desplazados siguen operando y no pierden datos.
  const ux = await newPage(false);
  try {
    await ux.locator('[data-home-tab="turno"]').click();
    assert.equal(await ux.locator("#count-bitacora").innerText(), "0");
    assert.equal(
      await ux.locator("#count-bitacora-asignados").innerText(),
      "1",
    );
    // Cerrar con teclado y recargar conserva la preferencia y permite volver a abrir.
    await ux.locator("#pendientes-toggle").focus();
    await ux.keyboard.press("Enter");
    await ux.reload();
    await ux.locator('[data-home-tab="turno"]').click();
    assert.equal(
      await ux.locator("#pendientes-toggle").getAttribute("aria-expanded"),
      "false",
    );
    await ux.locator("#pendientes-toggle").click();
    assert.equal(await ux.locator("#pendientes-list").isVisible(), true);
    assert.doesNotMatch(
      await ux.locator("#pendientes-list").innerText(),
      /T18:00:00Z/,
    );
    let submittedRequest = null,
      submittedTask = null;
    await ux.route("**/rest/v1/pending_loads**", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      submittedRequest = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...pendingRow,
          ...submittedRequest,
          id: "request-ui-only",
        }),
      });
    });
    await ux.route("**/rest/v1/rpc/ops_save_tasks", async (route) => {
      submittedTask = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          { ...taskRow, id: "task-ui-only", created_by: adminId },
        ]),
      });
    });
    await ux.locator("#pendiente-add-btn").click();
    await ux.locator("#pendiente-submit").click();
    assert.equal(submittedRequest, null); // Un cliente vacío no dispara un guardado.
    await ux
      .locator("#pendiente-backdrop")
      .getByLabel("Cliente", { exact: true })
      .fill("Cliente de prueba");
    await ux
      .locator("#pendiente-backdrop")
      .getByLabel("Origen", { exact: true })
      .fill("León, Guanajuato");
    await ux
      .locator("#pendiente-backdrop")
      .getByLabel("Destino", { exact: true })
      .fill("Laredo, Texas");
    await ux.locator("#pendiente-fecha").fill("2026-10-09");
    await ux
      .locator("#pendiente-nota")
      .fill("Esperar confirmación del cliente");
    await ux.locator("#pendiente-submit").click();
    await ux.locator("#pendiente-backdrop.show").waitFor({ state: "hidden" });
    assert.equal(submittedRequest.customer, "Cliente de prueba");
    assert.equal(submittedRequest.origin, "León, Guanajuato");
    assert.equal(submittedRequest.destination, "Laredo, Texas");
    // La edición conserva el responsable y la carga originales; cerrarla no cambia datos.
    await ux.locator(`[data-edit-bitacora="${taskRow.id}"]`).click();
    assert.equal(
      await ux.locator("#bitacora-asignado-wrap").isVisible(),
      false,
    );
    assert.equal(
      await ux.locator("#bitacora-asignado-fixed").innerText(),
      "Esteban",
    );
    assert.equal(await ux.locator("#bitacora-nota").inputValue(), taskRow.note);
    await ux.locator("#bitacora-close").click();
    await ux.locator("#bitacora-add-btn").click();
    await ux.locator("#bitacora-submit").click();
    assert.equal(submittedTask, null); // Se conserva la validación de la descripción.
    await ux.locator("#bitacora-nota").fill("Confirmar documentos");
    await ux.locator("#bitacora-load-search").fill("VISUAL-001");
    await ux.locator('[data-bitacora-load-option="VISUAL-001"]').click();
    await ux.locator('#bitacora-color-swatches [data-color="warn"]').click();
    await ux.locator("#bitacora-fecha-seguimiento").fill("2026-10-09");
    await ux.locator("#bitacora-asignado").selectOption("Ana");
    await ux.locator("#bitacora-submit").click();
    await ux.locator("#bitacora-backdrop.show").waitFor({ state: "hidden" });
    assert.equal(submittedTask.p_values.note, "Confirmar documentos");
    assert.deepEqual(submittedTask.p_values.loads, ["VISUAL-001"]);
    assert.equal(submittedTask.p_values.assigned_to, csrId);
    assert.equal(submittedTask.p_values.color, "warn");
    for (const width of [390, 360]) {
      await ux.setViewportSize({ width, height: 844 });
      for (const [trigger, overlay, close] of [
        ["pendiente-add-btn", "pendiente-backdrop", "pendiente-close"],
        ["bitacora-add-btn", "bitacora-backdrop", "bitacora-close"],
      ]) {
        await ux.locator(`#${trigger}`).click();
        const layout = await ux
          .locator(`#${overlay} .modal-box`)
          .evaluate((box) => ({
            width: box.clientWidth,
            scroll: box.scrollWidth,
            height: box.getBoundingClientRect().height,
            page: document.documentElement.scrollWidth,
            screen: innerWidth,
          }));
        assert.ok(
          layout.scroll <= layout.width,
          `${overlay}: desbordamiento a ${width}px`,
        );
        assert.ok(layout.height <= 844 && layout.page <= layout.screen);
        await ux
          .locator(`#${overlay} .turno-form-actions button`)
          .scrollIntoViewIfNeeded();
        assert.equal(
          await ux
            .locator(`#${overlay} .turno-form-actions button`)
            .isVisible(),
          true,
        );
        assert.equal(
          await ux
            .locator(`#${overlay} .turno-form-actions button`)
            .evaluate((button) => {
              const rect = button.getBoundingClientRect();
              const top = document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              );
              return button === top || button.contains(top);
            }),
          true,
          "Guardar debe poder pulsarse sin que los avisos de fondo lo tapen",
        );
        await ux.screenshot({
          path: `/tmp/panel-original-comparison/${overlay}-${width}.png`,
        });
        await ux.locator(`#${close}`).click();
      }
    }
    await ux.setViewportSize({ width: 1440, height: 1024 });
    await ux.locator('[data-home-tab="ahora"]').click();
    assert.equal(
      await ux.locator('[data-attention-load="VISUAL-001"]').count(),
      1,
    );
    await ux.locator('[data-attention-filter="notify"]').click();
    assert.equal(
      await ux.locator('[data-attention-load="VISUAL-001"]').count(),
      1,
    );
    await ux.locator('[data-attention-filter="all"]').click();
    await ux.locator('[data-page="operation"]').click();
    const openComments = ux
      .locator('#page-operation [data-comments-load="VISUAL-001"]')
      .first();
    await openComments.click();
    await ux.locator("#comments-textarea").focus();
    for (let i = 0; i < 8; i++) {
      await ux.keyboard.press("Tab");
      assert.equal(
        await ux.evaluate(() =>
          document
            .getElementById("comments-backdrop")
            .contains(document.activeElement),
        ),
        true,
      );
    }
    await ux.keyboard.press("Shift+Tab");
    assert.equal(
      await ux.evaluate(() =>
        document
          .getElementById("comments-backdrop")
          .contains(document.activeElement),
      ),
      true,
    );
    await ux.keyboard.press("Escape");
    await ux.locator("#comments-backdrop.show").waitFor({ state: "hidden" });
    assert.equal(
      await ux.evaluate(() =>
        document.activeElement.getAttribute("data-comments-load"),
      ),
      "VISUAL-001",
    );
    // El expediente también es modal; un comentario abierto desde él debe quedar encima.
    await ux
      .locator('#page-operation [data-workspace-load="VISUAL-001"]')
      .first()
      .click();
    await ux.locator('#workspace-backdrop[aria-hidden="false"]').waitFor();
    await ux.locator("#workspace-close").focus();
    for (let i = 0; i < 8; i++) {
      await ux.keyboard.press("Tab");
      assert.equal(
        await ux.evaluate(() =>
          document
            .getElementById("workspace-backdrop")
            .contains(document.activeElement),
        ),
        true,
      );
    }
    await ux.locator('[data-ws-comments="VISUAL-001"]').click();
    await ux.locator("#ws-inline-comment-text").waitFor();
    await ux.locator("[data-inline-close=ws-inline-comment]").click();
    await ux.locator("#workspace-close").focus();
    await ux.keyboard.press("n");
    await ux.locator("#comments-backdrop.show").waitFor();
    assert.equal(
      await ux.evaluate(
        () =>
          Number(
            getComputedStyle(document.getElementById("comments-backdrop"))
              .zIndex,
          ) >
          Number(
            getComputedStyle(document.getElementById("workspace-backdrop"))
              .zIndex,
          ),
      ),
      true,
    );
    await ux.keyboard.press("Escape");
    await ux.locator("#comments-backdrop.show").waitFor({ state: "hidden" });
    assert.equal(
      await ux.evaluate(() =>
        document
          .getElementById("workspace-backdrop")
          .contains(document.activeElement),
      ),
      true,
    );
    await ux.locator('[data-workspace-tab="historial"]').click();
    const history = ux.locator("#workspace-historial-cambios");
    await history.filter({ hasText: "POD enviado al cliente" }).waitFor();
    const podEvent = history
      .locator(".comm-history-event")
      .filter({ hasText: "POD enviado al cliente" });
    assert.deepEqual(await podEvent.locator("dd").allTextContents(), [
      "No enviado",
      "Enviado",
    ]);
    assert.equal(
      await history
        .locator(".comm-history-event")
        .filter({ hasText: "Cargos" })
        .locator("dd")
        .first()
        .textContent(),
      "0",
    );
    assert.doesNotMatch(
      await history.innerText(),
      /truck_source|next_review_at|valor_anterior/,
    );
    assert.equal(await history.locator("img").count(), 0);
    assert.match(await history.innerText(), /<img src=x/);
    await ux.screenshot({
      path: "/tmp/panel-original-comparison/historial-legible.png",
    });
    await ux.keyboard.press("Escape");
    await ux.locator("#workspace-backdrop.show").waitFor({ state: "hidden" });
    const card = ux.locator('#page-operation .card[data-load="VISUAL-001"]');
    assert.equal(await card.locator(".card-extra").getAttribute("open"), null);
    await card.locator(".card-extra > summary").click();
    const dateLabel = await card
      .locator("[data-pickup-appt-load]")
      .getAttribute("aria-labelledby");
    assert.ok(dateLabel);
    assert.match(
      await ux.locator("#" + dateLabel).textContent(),
      /recolección/,
    );
    const oldTruck = rawLoads[0].truck;
    const saved = ux.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/loads?"),
    );
    await card.locator('[data-truck-load="VISUAL-001"]').fill("T-UX");
    await card.locator('[data-truck-load="VISUAL-001"]').press("Tab");
    await saved;
    await ux.locator('#ux-save-feedback[data-state="saved"]').waitFor();
    assert.equal(rawLoads[0].truck, "T-UX");
    await ux.reload();
    await ux.locator('[data-page="operation"]').click();
    await ux
      .locator('#page-operation .card[data-load="VISUAL-001"] .card-commitment')
      .filter({ hasText: "T-UX" })
      .waitFor();
    await ux
      .locator(
        '#page-operation .card[data-load="VISUAL-001"] .card-extra > summary',
      )
      .click();
    // Un fallo real del transporte de prueba permanece visible y no modifica el registro.
    await ux.route("**/rest/v1/loads?*", (route) => {
      if (route.request().method() === "PATCH")
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            message: "El registro cambió. Revisa antes de guardar.",
          }),
        });
      return route.fallback();
    });
    const field = ux.locator('#page-operation [data-truck-load="VISUAL-001"]');
    await field.fill("NO-GUARDAR");
    await field.press("Tab");
    await ux.locator('#ux-save-feedback[data-state="error"]').waitFor();
    await ux.waitForTimeout(3000);
    assert.equal(
      await ux.locator('#ux-save-feedback[data-state="error"]').isVisible(),
      true,
    );
    assert.equal(rawLoads[0].truck, "T-UX");
    await ux.locator("#ux-save-feedback button").click();
    await ux.unroute("**/rest/v1/loads?*");
    // El identificador completo se lee fuera del editor y persiste al volver a cargar.
    const oldTrailer = rawLoads[0].trailer;
    const longTrailer = "TRAILER-BAJIO-123456789012345678901234567890";
    await ux.locator("#view-toggle-btn").click();
    const trailerCell = ux.locator(
      '#table-body tr[data-load="VISUAL-001"] .t-trailer',
    );
    await trailerCell.locator("summary").click();
    const trailerSaved = ux.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/loads?"),
    );
    await trailerCell.locator("input").fill(longTrailer);
    await trailerCell.locator("input").press("Tab");
    await trailerSaved;
    assert.equal(rawLoads[0].trailer, longTrailer);
    await ux.reload();
    await ux.locator('[data-page="operation"]').click();
    await ux.locator("#view-toggle-btn").click();
    await trailerCell
      .locator(".trailer-full-value")
      .filter({ hasText: longTrailer })
      .waitFor();
    const trailerLayout = await trailerCell
      .locator(".trailer-full-value")
      .evaluate((el) => ({
        scroll: el.scrollWidth,
        width: el.clientWidth,
        whiteSpace: getComputedStyle(el).whiteSpace,
      }));
    assert.ok(trailerLayout.scroll <= trailerLayout.width);
    assert.equal(trailerLayout.whiteSpace, "normal");
    assert.equal(
      await ux
        .locator('th[data-sort="trailer"]')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
    );
    await ux.screenshot({
      path: "/tmp/panel-original-comparison/trailer-completo.png",
    });
    // Caso reportado: T0132 debe caber en el editor con el detalle abierto, también en laptop.
    await trailerCell.locator(".trailer-full-value").click();
    await ux.locator("#table-detail-panel:not([hidden])").waitFor();
    await trailerCell.locator("summary").click();
    assert.equal(await ux.locator("#table-detail-panel").isVisible(), true);
    await trailerCell.locator("input").fill("T0132");
    const shortTrailerSaved = ux.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/loads?"),
    );
    await trailerCell.locator("input").press("Tab");
    await shortTrailerSaved;
    await ux
      .locator("#table-detail-load-label")
      .filter({ hasText: "T0132" })
      .waitFor();
    assert.doesNotMatch(
      await ux.locator("#table-detail-load-label").innerText(),
      /TRAILER-BAJIO/,
    );
    for (const width of [1533, 1440, 1180, 1024, 390, 360]) {
      await ux.setViewportSize({ width, height: 900 });
      const editor = await trailerCell.locator("input").evaluate((input) => {
        const style = getComputedStyle(input);
        const context = document.createElement("canvas").getContext("2d");
        context.font = style.font;
        const cell = input.closest("td").getBoundingClientRect();
        const box = input.getBoundingClientRect();
        return {
          available:
            input.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight),
          required: context.measureText(input.value).width,
          insideCell: box.right <= cell.right && box.left >= cell.left,
          documentFits: document.documentElement.scrollWidth <= innerWidth,
        };
      });
      assert.ok(
        editor.available > editor.required,
        `T0132 recortado a ${width}px`,
      );
      assert.ok(
        editor.insideCell && editor.documentFits,
        `Editor fuera de su espacio a ${width}px`,
      );
      usabilityLayouts.push({ trailerEditor: { viewport: width, ...editor } });
    }
    await ux.setViewportSize({ width: 1533, height: 900 });
    await ux.screenshot({
      path: "/tmp/panel-original-comparison/trailer-detalle-T0132.png",
      animations: "disabled",
    });
    await ux.locator("#view-toggle-btn").click();
    await ux
      .locator(
        '#page-operation .card[data-load="VISUAL-001"] .card-extra > summary',
      )
      .click();
    // El ancho debe funcionar también con los campos editables desplegados.
    for (const width of [390, 360]) {
      await ux.setViewportSize({ width, height: 844 });
      usabilityLayouts.push(
        await ux.evaluate(() => ({
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        })),
      );
      assert.equal(
        await ux.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    await ux.screenshot({
      path: "/tmp/panel-original-comparison/usabilidad-movil.png",
    });
    await ux.locator('[data-movil="mas"]').click();
    await ux.locator("#sidebar-manage-csr-btn").click();
    await ux.locator("#csr-pw-input").fill("Solo-prueba-local");
    await ux.locator("#csr-pw-submit").click();
    await ux.locator("#csr-backdrop.show").waitFor();
    await ux.locator("#csr-new-nombre").fill("Borrador sin guardar");
    for (const key of ["customers", "access", "imports", "history", "people"]) {
      await ux.locator(`[data-admin-section="${key}"]`).click();
      assert.equal(
        (await ux.locator("#csr-backdrop .csr-section:visible").count()) > 0,
        true,
      );
    }
    assert.equal(
      await ux.locator("#csr-new-nombre").inputValue(),
      "Borrador sin guardar",
    );
    const layout = await ux
      .locator("#csr-backdrop .modal-box")
      .evaluate((box) => ({
        bottom: box.getBoundingClientRect().bottom,
        overflow: getComputedStyle(box).overflowY,
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
    assert.ok(layout.bottom <= 844);
    assert.equal(layout.overflow, "auto");
    assert.ok(layout.width <= layout.viewport);
    usabilityLayouts.push({ administration: layout });
    await ux.screenshot({
      path: "/tmp/panel-original-comparison/usabilidad-admin-movil.png",
    });
    await ux.locator("#csr-close").click();
    rawLoads[0].truck = oldTruck;
    rawLoads[0].trailer = oldTrailer;
  } finally {
    await ux.close();
  }
  // Selección de archivos reales mediante el botón y los callbacks originales.
  const importPage = pages[0];
  await importPage.locator("#sidebar-manage-csr-btn").click();
  await importPage.locator("#csr-pw-input").fill("Solo-prueba-local");
  await importPage.locator("#csr-pw-submit").click();
  await importPage.locator("#csr-backdrop.show").waitFor();
  await importPage.locator("#csr-close").click();
  assert.match(
    await importPage.locator("#file-input").getAttribute("accept"),
    /\.csv/,
  );
  const selectFile = async (file) => {
    const chooser = importPage.waitForEvent("filechooser");
    await importPage.locator("#excel-import-btn").click();
    // El original solicita contraseña administrativa también al abrir el importador.
    if (await importPage.locator("#csr-pw-backdrop.show").isVisible()) {
      await importPage.locator("#csr-pw-input").fill("Solo-prueba-local");
      await importPage.locator("#csr-pw-submit").click();
    }
    await (await chooser).setFiles(file);
  };
  const csvFile = new URL(
    "../entregables/importacion-prueba.csv",
    import.meta.url,
  ).pathname;
  await selectFile(csvFile);
  await importPage.locator("#confirmar-backdrop.show").waitFor();
  assert.equal(importSaves, 0);
  assert.deepEqual(
    previewedRecords.map((row) => row.load),
    ["IMPORT-EXISTENTE", "IMPORT-NUEVA"],
  );
  await importPage.locator("#confirmar-cancelar").click();
  await importPage
    .locator("#import-status")
    .filter({ hasText: "Importación cancelada" })
    .waitFor();
  if (legacyXls) {
    await selectFile(
      new URL("../web/test/fixtures/import.xls", import.meta.url).pathname,
    );
    await importPage.locator("#confirmar-backdrop.show").waitFor();
    assert.equal(previewedRecords[0].load, "LEGACY-0007");
    assert.equal(previewedRecords[0].bol, "false");
    await importPage.locator("#confirmar-cancelar").click();
    await importPage
      .locator("#import-status")
      .filter({ hasText: "Importación cancelada" })
      .waitFor();
    assert.equal(importSaves, 0);
  }
  assert.equal(importSaves, 0);
  await selectFile(
    new URL("../web/test/fixtures/import.xlsx", import.meta.url).pathname,
  );
  await importPage.locator("#confirmar-backdrop.show").waitFor();
  assert.equal(previewedRecords[0].load, "0007");
  assert.equal(previewedRecords[0].customer, "PRUEBA XLSX");
  await importPage.locator("#confirmar-cancelar").click();
  await importPage
    .locator("#import-status")
    .filter({ hasText: "Importación cancelada" })
    .waitFor();
  await selectFile({
    name: "documentos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Load,Customers,BOL,DODA,ENTRY,On time pickup\n0008,PRUEBA CLIENTE,false,0,no,-01:30",
    ),
  });
  await importPage.locator("#confirmar-backdrop.show").waitFor();
  assert.equal(previewedRecords[0].load, "0008");
  for (const field of ["bol", "doda", "entry"])
    assert.equal(previewedRecords[0][field], "false");
  assert.equal(previewedRecords[0].pickup_delta_min, "-90");
  await importPage.locator("#confirmar-cancelar").click();
  await importPage
    .locator("#import-status")
    .filter({ hasText: "Importación cancelada" })
    .waitFor();
  await selectFile({
    name: "repetidos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Load,Customers\nDUP-1,PRIMERO\nDUP-1,ULTIMO"),
  });
  await importPage.locator("#confirmar-backdrop.show").waitFor();
  assert.equal(previewedRecords.length, 1);
  assert.equal(previewedRecords[0].customer, "ULTIMO");
  await importPage
    .locator("#confirmar-backdrop")
    .filter({ hasText: "Cargas repetidas en el archivo" })
    .waitFor();
  await importPage.locator("#confirmar-cancelar").click();
  await importPage
    .locator("#import-status")
    .filter({ hasText: "Importación cancelada" })
    .waitFor();
  const previewsAfterValidFiles = importPreviews;
  await selectFile({
    name: "fecha-invalida.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Load,Pickup appt.\n1,2026-02-30"),
  });
  await importPage
    .locator("#import-status")
    .filter({ hasText: "fecha inexistente" })
    .waitFor();
  assert.equal(importPreviews, previewsAfterValidFiles);
  assert.equal(importSaves, 0);
  await selectFile(csvFile);
  await importPage.locator("#confirmar-backdrop.show").waitFor();
  await importPage.locator("#confirmar-ok").click();
  await importPage
    .locator("#import-status.ok")
    .filter({ hasText: "2 nuevas" })
    .waitFor();
  assert.equal(importSaves, 1);
  await importPage.reload();
  await importPage.locator("[data-page=operation]").click();
  await importPage
    .locator('#page-operation .card[data-load="IMPORT-NUEVA"]')
    .waitFor();
  // Inicio: leer una notificación no completa sus plazos. Los dos relojes son independientes.
  rawLoads[0].recordatorio_fecha = "2026-10-08T17:00:00Z";
  rawLoads[0].next_review_at = "2026-10-08T16:00:00Z";
  await importPage.reload();
  await importPage
    .locator("#attention-reminder-count")
    .filter({ hasText: "2 por atender" })
    .waitFor();
  await importPage.locator("#home-guide summary").click();
  await importPage
    .getByText("Vencer no borra el recordatorio.", { exact: false })
    .waitFor();
  const beforeRead = rawLoads[0].next_review_at;
  await importPage.evaluate(() =>
    document.getElementById("avisos-leer-todo").click(),
  );
  assert.equal(rawLoads[0].next_review_at, beforeRead);
  await importPage
    .locator(
      '[data-reminder-load="VISUAL-001"][data-reminder-kind="transit"] [data-recordatorio-revisar]',
    )
    .click();
  await importPage
    .locator("#attention-reminder-count")
    .filter({ hasText: "1 por atender" })
    .waitFor();
  assert.equal(rawLoads[0].next_review_at, beforeRead);
  assert.equal(rawLoads[0].recordatorio_fecha, "2026-10-08T21:00:00.000Z");
  await importPage
    .locator('[data-home-reminder-complete="VISUAL-001"]')
    .click();
  await importPage
    .locator("#attention-reminder-count")
    .filter({ hasText: "0 por atender" })
    .waitFor();
  assert.equal(rawLoads[0].next_review_at, "");
  assert.equal(rawLoads[0].recordatorio_fecha, "2026-10-08T21:00:00.000Z");
  await importPage.locator(".home-reminders-upcoming summary").click();
  await importPage.locator('[data-reminder-kind="transit"]').waitFor();
  await importPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await importPage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await importPage.locator('[data-movil="mas"]').click();
  await importPage
    .locator("#sidebar .nav-label")
    .filter({ hasText: "Solicitudes" })
    .waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    `/tmp/panel-original-comparison/${importsOnly ? "result-imports" : "result"}.json`,
    JSON.stringify(
      {
        screenshots,
        incidentSaves,
        importPreviews,
        importSaves,
        requests: requests.length,
        errors,
        usabilityLayouts,
      },
      null,
      2,
    ),
  );
  console.log(
    `${importsOnly ? "Flujos verificados" : screenshots.length + " comparaciones visuales aprobadas; incidencias, cierre de sesión y administrador CSR correctos"}; CSV/XLSX${legacyXls ? "/XLS" : ""}, recordatorios independientes, completar seguimiento y navegación móvil verificados; sin errores JS.`,
  );
} catch (error) {
  for (let index = 0; index < pages.length; index++) {
    await pages[index].screenshot({
      path: `/tmp/panel-original-comparison/failure-${index}.png`,
    });
    console.log(
      "PÁGINA",
      index,
      (await pages[index].locator("body").innerText()).slice(-900),
    );
  }
  console.log("ERRORES", errors);
  throw error;
} finally {
  await browser.close();
}
