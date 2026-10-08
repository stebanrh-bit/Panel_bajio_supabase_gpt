/**
 * Comparación de la UI original y el HTML entregable con los mismos datos ficticios.
 * Todas las peticiones Supabase se interceptan: esta prueba nunca escribe en producción.
 * Ejecutar después de build + package_site.py. Necesita Chromium y playwright-core externo.
 */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { originalPage } from "../web/src/original/page.js";
import config from "../web/src/original/config.js";
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
  getHistorialLoad: { ok: true, items: [] },
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
  template: await read("index.html"),
  styles: (await read("PanelEstilos.html"))
    .replace(/^\s*<style>/, "")
    .replace(/<\/style>\s*$/, ""),
  script: (await read("PanelScript.html"))
    .replace(/^\s*<script>/, "")
    .replace(/<\/script>\s*$/, ""),
  config,
});
const goldenHtml =
  "<!doctype html><html><head>" +
  original.head +
  "</head><body>" +
  original.body +
  original.scripts.map((script) => "<script>" + script + "</script>").join("") +
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
const incidents = [];
async function newPage(
  golden = false,
  viewport = { width: 1440, height: 1024 },
  view = "internal",
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
        result = { id: adminId, email: "prueba@local.test" };
      else if (table === "profiles")
        result = url.searchParams.has("id")
          ? {
              ...profiles[0],
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
      } else if (table === "customer_assignments")
        result = [
          {
            customer: "ACME",
            customer_key: "acme",
            owner_id: csrId,
            updated_at: stamp,
          },
        ];
      else if (table === "pending_loads") result = [pendingRow];
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
    ({ id, fixtures, golden, view }) => {
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
        "bajio_inicio_turno_Esteban",
        new Date().toDateString(),
      );
      localStorage.setItem("bajio_identity_nombre", "Esteban");
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
                return () =>
                  setTimeout(() => {
                    if (name in fixtures) success?.(fixtures[name]);
                    else if (failure) failure(Error(`Sin fixture: ${name}`));
                    else console.error(`No se completó ${name}`);
                  }, 0);
              },
            },
          );
        }
        window.panelApi = { run: runner() };
      }
    },
    { id: adminId, fixtures, golden, view },
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
    target.searchParams.set(
      "portal",
      view === "client" ? "cliente" : "gerencia",
    );
  await page.goto(golden ? new URL(filename, base).href : target.href);
  if (view === "internal") {
    await page.locator("#identity-backdrop.show").waitFor({ state: "hidden" });
    await page
      .locator("#home-cierres")
      .filter({ hasText: "Sin cierres" })
      .waitFor();
  } else await page.locator("#shipments-tbody tr").first().waitFor();
  return page;
}
const pages = [await newPage(true), await newPage()];
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
  await compare("inicio");
  await both((page) => page.locator("[data-home-tab=turno]").click());
  await compare("mi-turno");
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
      await both((page) => page.locator(`[data-workspace-tab=${tab}]`).click());
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
  await both((page) => page.locator("#session-change-pw-btn").click());
  await compare("cambiar-contrasena");
  await both((page) => page.locator("#identity-close").click());
  await both((page) => page.locator("#sidebar-manage-csr-btn").click());
  await compare("clave-administracion");
  await both((page) => page.locator("#csr-pw-input").fill("Solo-prueba-local"));
  await both((page) => page.locator("#csr-pw-submit").click());
  await both((page) => page.locator("#csr-backdrop.show").waitFor());
  await compare("administracion");
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
        (id) => document.getElementById(id + "-backdrop").classList.add("show"),
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
    .getByText("Ingresa una categoría para registrar la incidencia.", {
      exact: false,
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
    page.locator("#home-cierres").filter({ hasText: "Sin cierres" }).waitFor(),
  );
  await compare("movil-inicio");
  // Salir debe limpiar la sesión y mostrar el selector de identidad sin errores.
  await pages[1].setViewportSize({ width: 1440, height: 1024 });
  await pages[1].locator("#session-logout-btn").click();
  await pages[1].locator("#identity-backdrop.show").waitFor();
  assert.equal(
    await pages[1].evaluate(() => localStorage.getItem("bajio_identity_token")),
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
  assert.deepEqual(errors, []);
  await writeFile(
    "/tmp/panel-original-comparison/result.json",
    JSON.stringify(
      { screenshots, incidentSaves, requests: requests.length, errors },
      null,
      2,
    ),
  );
  console.log(
    `${screenshots.length} comparaciones visuales aprobadas; categoría vacía rechazada, registro válido persistente y cierre de sesión correcto; sin errores JS.`,
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
