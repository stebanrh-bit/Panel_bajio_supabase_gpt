import assert from "node:assert/strict";
/** Datos simulados; todas las peticiones Supabase son interceptadas por el arnés. */
export async function runPersonalReview({
  newPage,
  rawLoads,
  manualMessages,
  personalPreferences,
  noticeStates,
  documents,
}) {
  const page = await newPage(),
    checks = [];
  const check = (name) => checks.push(name);
  await page
    .locator("#personal-site-status")
    .filter({ hasText: "Base 20" })
    .waitFor();
  await page.locator("#personal-site-status").click();
  await page.locator(".personal-dialog").waitFor();
  assert.match(
    await page.locator(".personal-dialog").innerText(),
    /2026\.10\.27\.4/,
  );
  check("Versión del sitio y SQL 20 disponibles");
  assert.equal(
    await page.locator("#home-more-info .home-summary-kpis").isVisible(),
    false,
  );
  assert.equal(await page.locator("#group-carga-csr").isVisible(), false);
  check("Resumen secundario plegado y secciones de equipo retiradas");
  await page.locator(".personal-dialog [data-personal-close]").first().click();
  await page.locator('[data-attention-filter="scheduled"]').click();
  assert.equal(await page.locator(".attention-lane").count(), 1);
  check("Programados se separan de Ahora");
  await page.locator('[data-attention-filter="completed"]').click();
  await page.locator("#personal-completed h3").waitFor();
  check("Atendidos sin completar tareas por leer avisos");
  await page.locator('[data-page="calendario"]').first().click();
  await page.locator('[data-cal-view="list"]').click();
  await page.waitForFunction(
    () => window.panelPersonal.preferences.calendar_view === "list",
  );
  assert.equal(personalPreferences.calendar_view, "list");
  assert.equal(await page.locator(".cal-dia-empty:visible").count(), 0);
  assert.equal(
    await page.locator('[data-cal-type="cruce"]').isVisible(),
    false,
  );
  check("Calendario limpio, cruces ocultos y vista persistida");
  await page.locator("#cal-hide-empty").uncheck();
  await page.waitForFunction(
    () => window.panelPersonal.preferences.calendar_hide_empty === false,
  );
  assert.equal(await page.locator(".cal-dia").count(), 7);
  check("Días vacíos recuperables");
  await page.locator("#cal-cliente").selectOption("client:acme");
  await page.waitForFunction(
    () => window.panelPersonal.preferences.calendar_client === "client:acme",
  );
  check("Cliente de calendario guardado por cuenta");
  // Abrir la misma carga desde Cargas, sin depender del día de las citas.
  await page.locator('[data-page="operation"]').first().click();
  await page.evaluate(() =>
    document.querySelector('[data-home-open="VISUAL-001"]')?.click(),
  );
  if (
    !(await page
      .locator("#workspace-backdrop")
      .evaluate((e) => e.classList.contains("show")))
  ) {
    await page.locator('.t-row[data-load="VISUAL-001"]').click();
    await page
      .locator(
        '[data-open-workspace="VISUAL-001"], [data-workspace-load="VISUAL-001"]',
      )
      .first()
      .click();
  }
  await page.locator("#workspace-backdrop.show").waitFor();
  assert.equal(await page.locator(".personal-edit input:visible").count(), 0);
  check("Edición secundaria plegada en expediente");
  await page.locator('[data-workspace-tab="documentos"]').click();
  await page.locator("[data-document-add]").waitFor();
  await page.locator("[data-document-add]").click();
  await page.locator(".personal-dialog [name=label]").fill("POD de prueba");
  await page
    .locator(".personal-dialog [name=url]")
    .fill("https://example.org/pod.pdf");
  await page.locator(".personal-dialog button[type=submit]").click();
  await page.locator("[data-document-edit]").waitFor();
  assert.equal(documents.length, 1);
  check("Documento enlazado y visible por carga");
  await page.locator("[data-document-remove]").click();
  await page.locator("[data-document-edit]").waitFor({ state: "detached" });
  assert.ok(documents[0].deleted_at);
  check("Retiro lógico de documento");
  await page.locator('[data-workspace-tab="comunicacion"]').click();
  await page.locator("#comm-message").fill("Mensaje final de prueba");
  await page.evaluate(() => {
    window.__copies = 0;
    navigator.clipboard.writeText = async () => {
      window.__copies++;
    };
  });
  await page.locator("[data-comm-copy]").click();
  assert.equal(await page.evaluate(() => window.__copies), 1);
  check("Copiar invoca una sola escritura al portapapeles");
  await page.locator("[data-comm-sent]").click();
  await page.waitForFunction(
    () => !document.querySelector("[data-comm-sent]")?.disabled,
  );
  assert.equal(manualMessages.at(-1)?.p_message, "Mensaje final de prueba");
  check("Registro privado del texto final");
  await page.locator("#workspace-close").click();
  // Exportación con conteo y elección explícita, CSV protegido contra fórmulas.
  await page.evaluate(() =>
    window.panelPersonal.exportSnapshot(
      [{ load: "=1+1", customer: "ACME" }],
      [
        { load: "=1+1", customer: "ACME" },
        { load: "B", customer: "ACME" },
      ],
      "Mi vista",
    ),
  );
  assert.match(
    await page.locator(".personal-dialog").innerText(),
    /1 cargas[\s\S]*2 cargas/,
  );
  const download = page.waitForEvent("download");
  await page.locator(".personal-dialog button[type=submit]").click();
  await download;
  check("Exportar distingue vista actual y reporte completo");
  // Vista previa: fila excluida y reemplazo manual requieren elección explícita.
  const input = [
    { load: "VISUAL-001", customer: "ACME", trailer: "VG-NEW" },
    { load: "IMPORTAR-NO", customer: "ACME", trailer: "VG-OTHER" },
  ];
  await page.evaluate((rows) => {
    window.__importResult = undefined;
    window.panelPersonal
      .reviewImport(rows, "archivo-control.csv")
      .then((r) => (window.__importResult = r));
  }, input);
  await page.locator('[data-import-row="VISUAL-001"]').waitFor();
  assert.equal(
    await page.locator("[data-import-replace=trailer]").isChecked(),
    false,
  );
  await page.locator("[data-import-replace=trailer]").check();
  await page
    .locator('[data-import-row="IMPORTAR-NO"] [data-import-include]')
    .uncheck();
  await page.locator(".personal-dialog button[type=submit]").click();
  await page.waitForFunction(() => window.__importResult !== undefined);
  assert.equal(
    await page.evaluate(() => window.__importResult.fileName),
    "archivo-control.csv",
  );
  assert.equal(
    rawLoads.some((r) => r.load === "IMPORTAR-NO"),
    false,
  );
  check("Importación por fila, nombre real y reemplazo manual explícito");
  await page.locator('[data-page="radar"]').first().click();
  await page
    .locator("#personal-miles-status")
    .filter({ hasText: "12" })
    .waitFor();
  check("Tablero de millas bajo demanda sin secreto");
  await page.locator('[data-page="home"]').first().click();
  await page.locator('[data-attention-filter="now"]').click();
  await page.waitForTimeout(3400); // Dejar terminar las confirmaciones breves antes de capturar el diseño.
  await page.screenshot({
    path: "docs/imagenes/consolidacion-personal-inicio.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  check("Inicio móvil sin desborde lateral");
  await page.screenshot({
    path: "docs/imagenes/consolidacion-personal-movil.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.locator("#avisos-btn").click();
  await page.locator("#avisos-leer-todo").click();
  await page.waitForTimeout(200);
  assert.ok(noticeStates.some((s) => s.read_at));
  check("Lectura sincroniza claves sin editar cargas");
  const second = await newPage();
  await second
    .locator("#personal-site-status")
    .filter({ hasText: "Base 20" })
    .waitFor();
  await second.waitForFunction(
    () => window.panelPersonal.preferences.calendar_view === "list",
  );
  await second.locator('[data-page="calendario"]').first().click();
  assert.equal(
    await second.locator('[data-cal-view="list"]').getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await second.locator("#cal-cliente").inputValue(),
    "client:acme",
  );
  assert.equal(await second.locator("#cal-hide-empty").isChecked(), false);
  check("Otro dispositivo recupera vista, cliente y semana completa");
  await second.locator("#avisos-btn").click();
  assert.equal(await second.locator(".aviso-item.nuevo").count(), 0);
  check("Otro dispositivo conserva los avisos leídos");
  await second.route("**/rest/v1/rpc/ops_site_status", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Could not find the function public.ops_site_status",
        code: "PGRST202",
      }),
    }),
  );
  await second.evaluate(() => window.panelPersonal.statusDialog());
  await second
    .locator(".personal-dialog")
    .filter({ hasText: "SQL 020" })
    .waitFor();
  check("Instalación incompleta muestra SQL 020 pendiente");
  await second.close();
  await page.close();
  return {
    version: "2026.10.27.4",
    environment: "Chromium local; Supabase simulado",
    checks,
  };
}
