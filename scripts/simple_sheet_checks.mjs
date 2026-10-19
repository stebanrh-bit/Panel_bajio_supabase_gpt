/** Recorrido de la hoja sencilla: usa la UI real con el transporte local del runner. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

export async function clickOperationOption(page, selector) {
  const options = page.locator("#ux-advanced-filters");
  if (!(await options.evaluate((node) => node.open))) {
    await options.locator(":scope > summary").click();
  }
  await page.locator(selector).click();
}

export async function runSimpleSheetReview({ newPage, rawLoads, profiles }) {
  const snapshot = structuredClone(rawLoads);
  const page = await newPage(
    false,
    { width: 1533, height: 1000 },
    "internal",
    profiles[0],
    true,
  );
  const checks = [],
    layouts = [];
  try {
    await page.route("**/rest/v1/rpc/ops_latest_comments", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            load: "VISUAL-001",
            body: "Listo para cruce. Pendiente confirmar llegada con el cliente.",
            created_at: "2026-10-08T17:00:00Z",
            created_by: profiles[0].id,
          },
          {
            load: "VISUAL-002",
            body: "Unidad asignada; confirmar fecha de entrega.",
            created_at: "2026-10-08T17:00:00Z",
            created_by: profiles[1].id,
          },
        ]),
      }),
    );
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    assert.equal(await page.locator("#table-view").isVisible(), true);
    assert.equal(await page.locator("#cards-view").isVisible(), false);
    assert.equal(
      await page.locator("#operation-state-filter").inputValue(),
      "active",
    );
    assert.equal(
      await page.locator("#ux-advanced-filters").evaluate((node) => node.open),
      false,
    );
    for (const selector of [
      "#stats",
      "#view-toggle-btn",
      "#masivo-btn",
      "#export-operation-report-btn",
      "[data-abrir-multi-msg]",
    ]) {
      assert.equal(
        await page
          .locator("#page-operation " + selector)
          .first()
          .isVisible(),
        false,
      );
    }
    const row = page.locator('#table-body tr[data-load="VISUAL-001"]');
    await row.waitFor();
    await row
      .locator(".t-comment-text")
      .filter({ hasText: "Listo para cruce" })
      .waitFor();
    assert.deepEqual(
      await row
        .locator("td")
        .evaluateAll((cells) => cells.map((cell) => cell.dataset.label)),
      [
        "Load",
        "Cliente",
        "Origen",
        "Destino",
        "Entrega",
        "Truck",
        "Trailer",
        "Estatus",
        "CSR",
        "Comentarios",
      ],
    );
    assert.equal(await row.locator(".t-csr").innerText(), "Ana");
    assert.equal(await row.locator("button:visible").count(), 2);
    assert.equal(await row.locator(".t-status-select").count(), 1);
    assert.equal(await row.locator("[data-trailer-load],summary").count(), 0);
    checks.push(
      "Primera entrada en tabla sencilla, diez columnas y acciones secundarias cerradas",
    );

    await page.locator("#operation-state-filter").selectOption("done");
    assert.deepEqual(
      await page
        .locator("#table-body tr:visible")
        .evaluateAll((rows) => rows.map((row) => row.dataset.load)),
      ["VISUAL-003"],
    );
    await page.locator("#operation-state-filter").selectOption("all");
    await page.locator("#search").fill("VISUAL-002");
    assert.deepEqual(
      await page
        .locator("#table-body tr:visible")
        .evaluateAll((rows) => rows.map((row) => row.dataset.load)),
      ["VISUAL-002"],
    );
    await page.locator("#search").fill("");
    await page.locator("#cliente-filter").selectOption({ label: "ACME" });
    assert.equal(await page.locator("#table-body tr:visible").count(), 3);
    checks.push(
      "Selector de estado, cliente y búsqueda conservan sus filtros y resultados",
    );

    for (const width of [
      1920, 1533, 1440, 1280, 1180, 1024, 820, 768, 390, 360, 320,
    ]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page
        .locator("#table-view .table-wrap")
        .evaluate((wrapper) => ({
          page: document.documentElement.scrollWidth,
          screen: innerWidth,
          width: wrapper.clientWidth,
          content: wrapper.scrollWidth,
        }));
      assert.ok(
        geometry.page <= width && geometry.content <= geometry.width + 1,
        JSON.stringify(geometry),
      );
      for (const cell of [
        ".t-origin",
        ".t-destination",
        ".t-trailer",
        ".t-csr",
        ".t-comment",
      ])
        assert.equal(await row.locator(cell).isVisible(), true);
      layouts.push(geometry);
    }
    checks.push(
      "Tabla, trailer y comentarios legibles sin scroll lateral en once anchos",
    );
    await page.setViewportSize({ width: 1533, height: 1000 });
    await page.locator("#page-operation").screenshot({
      path: "/tmp/panel-original-comparison/cargas-vista-simple.png",
    });
    const beforeWidth = await page
      .locator("#table-view .table-wrap")
      .evaluate((node) => node.clientWidth);
    await row.locator("[data-table-select]").focus();
    await page.keyboard.press("Enter");
    await page.locator("#table-detail-dialog[open]").waitFor();
    assert.equal(
      await page
        .locator("#table-view .table-wrap")
        .evaluate((node) => node.clientWidth),
      beforeWidth,
    );
    assert.equal(
      await page
        .locator("#table-detail-dialog")
        .evaluate((node) => node.matches(":modal")),
      true,
    );
    const trailer = page.locator(
      '#table-detail-body [data-trailer-load="VISUAL-001"]',
    );
    await trailer.fill("T0132");
    await trailer.press("Tab");
    await row
      .locator(".trailer-full-value")
      .filter({ hasText: "T0132" })
      .waitFor({ state: "attached" });
    assert.equal(rawLoads[0].trailer, "T0132");
    await page.keyboard.press("Escape");
    await page
      .locator("#table-detail-dialog[open]")
      .waitFor({ state: "hidden" });
    assert.equal(
      await row
        .locator("[data-table-select]")
        .evaluate((node) => document.activeElement === node),
      true,
    );
    checks.push(
      "Abrir por teclado mantiene el ancho; editar trailer persiste; Escape cierra el diálogo",
    );
    await row.locator("[data-table-select]").click();
    await page.locator("#table-detail-body [data-create-task-load]").click();
    await page.locator("#bitacora-backdrop.show").waitFor();
    assert.equal(
      await page.locator("#table-detail-dialog").evaluate((node) => node.open),
      false,
    );
    await page.locator("#bitacora-close").click();
    await row.locator("[data-comments-load]").click();
    await page.locator("#comments-backdrop.show").waitFor();
    await page.locator("#comments-close").click();
    checks.push(
      "Las tareas y los comentarios siguen abriendo al salir del detalle modal",
    );
    // El selector usa el adaptador existente de estatus; la prueba conserva los otros campos.
    const statusSaved = page.waitForResponse(
      (response) =>
        response.url().includes("/loads?") &&
        response.request().method() === "PATCH",
    );
    await row.locator("[data-status-load]").selectOption("Cargando");
    await page.waitForFunction(
      () =>
        document.querySelector('#table-body [data-load="VISUAL-001"]').dataset
          .status === "Cargando",
    );
    await statusSaved;
    assert.equal(rawLoads[0].status, "Cargando");
    checks.push(
      "El cambio de estatus en la fila utiliza el guardado existente",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#page-operation").screenshot({
      path: "/tmp/panel-original-comparison/cargas-vista-simple-movil.png",
    });
    const result = { checks, layouts };
    await writeFile(
      "/tmp/panel-original-comparison/vista-simple.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  } finally {
    await page.close();
    rawLoads.splice(0, rawLoads.length, ...snapshot);
  }
}
