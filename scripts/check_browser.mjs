/**
 * Comprueba el HTML final en Chromium con datos ficticios.
 * Intercepta todas las solicitudes al proyecto Supabase: no escribe en producción.
 * Preparación y ejecución documentadas en docs/VALIDACION_SITIO.md.
 */
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    (process.env.PANEL_BROWSER_TOOLS || "/tmp/panel-browser-tools") +
      "/node_modules/playwright-core/index.mjs",
  ).href
);
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const id = "11111111-1111-4111-8111-111111111111";
const now = new Date(),
  future = new Date(Date.now() + 3600000).toISOString();
const profile = { id, display_name: "Esteban", role: "admin", active: true };
const loads = [
  {
    load: "VISUAL-001",
    customer: "Cliente ejemplo",
    truck: "T-102",
    trailer: "R-210",
    origin_city: "Monterrey",
    origin_state: "NL",
    dest_city: "Laredo",
    dest_state: "TX",
    status: "En transito",
    pickup_appt: future,
    delivery_appt: future,
    next_review_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: now.toISOString(),
    client_notify_pending: true,
    bol: true,
    doda: true,
    entry: false,
    incidents: [{ count: 0 }],
    archived: false,
  },
  {
    load: "VISUAL-002",
    customer: "Cliente dos",
    origin_city: "Bajío",
    dest_city: "Dallas",
    status: "Cargando",
    updated_at: now.toISOString(),
    incidents: [{ count: 0 }],
    archived: false,
  },
  {
    load: "VISUAL-003",
    customer: "Cliente ejemplo",
    origin_city: "Bajío",
    dest_city: "Laredo",
    status: "DELIVERED",
    pod_sent: true,
    updated_at: now.toISOString(),
    incidents: [{ count: 0 }],
    archived: false,
  },
];
const incidents = [];
let incidentSaves = 0;
await page.route(
  "https://pwqibuunekrzfcztcfju.supabase.co/**",
  async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      table = url.pathname.split("/").at(-1);
    let result = [];
    if (table === "user") result = { id, email: "ejemplo@local.test" };
    else if (table === "profiles")
      result = url.searchParams.has("id") ? profile : [profile];
    else if (table === "loads") {
      const load = url.searchParams.get("load");
      result = load ? loads.find((row) => row.load === load.slice(3)) : loads;
    } else if (table === "incidents") {
      if (request.method() === "POST") {
        incidentSaves++;
        incidents.push({
          ...request.postDataJSON(),
          id: String(incidentSaves),
          created_at: now.toISOString(),
        });
        loads[0].incidents = [{ count: incidents.length }];
      }
      result = incidents;
    } else if (table === "pending_loads")
      result = [
        {
          id: "pending",
          customer: "Cliente ejemplo",
          origin: "Monterrey",
          destination: "Laredo",
          state: "pending",
          created_by: id,
          note: "Pendiente de confirmar",
        },
      ];
    else if (table === "shift_tasks")
      result = [
        {
          id: "task",
          load: "VISUAL-001",
          note: "Confirmar llegada",
          state: "open",
          assigned_to: id,
        },
      ];
    else if (table === "reserved_loads")
      result = [
        {
          id: "reserved",
          load: "APARTADO-001",
          customer: "Cliente ejemplo",
          state: "cruce",
          created_by: id,
          updated_at: now.toISOString(),
          review_hours: 3,
        },
      ];
    await route.fulfill({
      status: request.method() === "POST" ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify(result),
      headers: { "access-control-allow-origin": "*" },
    });
  },
);
await page.addInitScript(
  ({ id }) => {
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
          email: "ejemplo@local.test",
          aud: "authenticated",
          role: "authenticated",
        },
      }),
    );
  },
  { id },
);
await page.goto(
  process.env.PANEL_PREVIEW_URL || "http://127.0.0.1:5182/index-sitio.html",
);
await page
  .getByRole("heading", { name: "Mi operación", exact: true })
  .waitFor();
await page.screenshot({ path: "/tmp/panel-home.png", fullPage: true });
await page.getByRole("button", { name: "Mi turno", exact: true }).click();
await page.getByRole("heading", { name: "MI BITÁCORA", exact: true }).waitFor();
await page.getByRole("button", { name: "Ahora", exact: true }).click();
await page.locator("#nav-loads").click();
await page.locator(".load-card").first().waitFor();
assert.equal(await page.locator(".load-card").count(), 3);
await page.screenshot({ path: "/tmp/panel-operation.png", fullPage: true });
await page.getByRole("button", { name: "Vista tabla", exact: true }).click();
assert.equal(await page.locator("#rows tr").count(), 3);
await page.getByRole("button", { name: "Vista tarjetas", exact: true }).click();
await page.locator("[data-filter=done]").click();
assert.equal(await page.locator(".load-card").count(), 1);
await page.locator("[data-filter=all]").click();
await page
  .locator(".load-card")
  .first()
  .getByRole("button", { name: "Incidencias", exact: true })
  .click();
await page.locator("dialog[open]").waitFor();
assert.equal(await page.locator("[role=tab]").count(), 6);
await page
  .locator("#incident textarea[name=description]")
  .fill("Incidencia de prueba local");
await page.locator("#incident button").click();
assert.equal(incidentSaves, 0);
await page
  .locator("#incident")
  .evaluate((form) =>
    form.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    ),
  );
assert.equal(incidentSaves, 0);
await page
  .locator("#workspace-message")
  .getByText("Ingresa una categoría para registrar la incidencia.")
  .waitFor();
await page.locator("#incident select[name=category]").selectOption("Unidad");
await page.locator("#incident button").click();
await page.waitForFunction(() =>
  document
    .querySelector(".workspace-body")
    ?.textContent.includes("Incidencia de prueba local"),
);
assert.equal(incidentSaves, 1);
await page.locator("#workspace-tab-documentos").click();
assert.equal(
  await page
    .locator("[data-workspace-panel=documentos] [data-field=bol]")
    .count(),
  1,
);
await page.locator("#workspace-tab-comunicacion").click();
assert.equal(await page.locator("#comment").isVisible(), true);
await page.locator("#workspace-tab-operacion").click();
await page.screenshot({ path: "/tmp/panel-workspace.png", fullPage: true });
await page
  .getByRole("button", { name: "Cerrar expediente", exact: true })
  .click();
await page.getByRole("button", { name: "Nueva carga", exact: true }).click();
await page.locator("#editor").waitFor();
await page.locator("#cancel").click();
assert.equal(
  await page.locator("html").evaluate((e) => e.classList.contains("ws-open")),
  false,
);
await page.locator("#nav-calendar").click();
await page.locator(".calendar-day").first().waitFor();
assert.equal(await page.locator(".calendar-day").count(), 7);
await page.getByRole("button", { name: "Semana siguiente →" }).click();
assert.equal(await page.locator(".calendar-day").count(), 7);
for (const [name, title] of [
  ["pending", "Pendientes de load"],
  ["shifts", "Bitácora de turno"],
  ["reserved", "Loads apartados"],
  ["radar", "Radar de millas"],
  ["metrics", "Indicadores de operación"],
  ["archive", "Archivo de cargas"],
  ["templates", "Mis plantillas"],
  ["account", "Mi cuenta"],
]) {
  await page.locator("#nav-" + name).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await page.locator("#message").innerText(), "");
}
await page.setViewportSize({ width: 390, height: 844 });
await page.locator(".barra-movil [data-module=home]").click();
await page
  .getByRole("heading", { name: "Mi operación", exact: true })
  .waitFor();
await page.screenshot({ path: "/tmp/panel-mobile.png", fullPage: true });
await page.locator("#mobile-more").click();
assert.equal(await page.locator("#sidebar").isVisible(), true);
assert.deepEqual(errors, []);
console.log(
  "Navegador: inicio, turno, tarjetas/tabla, filtros, expediente de seis pestañas, validación de incidencia, calendario semanal y navegación móvil verificados con datos simulados.",
);
await browser.close();
