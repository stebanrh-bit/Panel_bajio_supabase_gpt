import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { validateConfig } from "../web/src/original/load-views/rules.js";

/** Recorrido del HTML entregable. El transporte de Supabase se intercepta; no hay escrituras reales. */
export async function runLoadViewsReview({
  newPage,
  rawLoads,
  profiles,
  customerAssignments,
}) {
  const snapshot = structuredClone(rawLoads),
    assignments = structuredClone(customerAssignments),
    checks = [];
  let page,
    saved = null,
    version = null,
    saves = 0,
    rejectOnce = true;
  try {
    customerAssignments[0].owner_id = profiles[0].id;
    rawLoads[0].status = "PTE. ARRIVO";
    rawLoads[0].pickup_appt = "2026-10-09T18:00:00Z";
    rawLoads[0].pod_sent = "false";
    rawLoads[1].status = "En AA";
    rawLoads[1].pickup_appt = "2026-10-07T18:00:00Z";
    rawLoads.push({ ...rawLoads[1], load: "CANCELADA", status: "Cancelado." });
    page = await newPage(
      false,
      { width: 1533, height: 1000 },
      "internal",
      profiles[0],
      true,
    );
    await page.route("**/rest/v1/original_preferences**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          saved
            ? [
                {
                  load_views: saved,
                  updated_at: version,
                  templates: {},
                  labels: {},
                },
              ]
            : [],
        ),
      }),
    );
    await page.route("**/rest/v1/rpc/ops_save_load_views", async (route) => {
      const input = route.request().postDataJSON();
      assert.equal(input.p_version, version);
      if (rejectOnce) {
        rejectOnce = false;
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Conflicto simulado: conserva tu borrador",
          }),
        });
      }
      saved = validateConfig(input.p_config);
      version = "2026-10-08T18:01:" + String(++saves).padStart(2, "0") + "Z";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ config: saved, version }),
      });
    });
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    const selector = page.locator("#operation-state-filter");
    const ids = () =>
      page
        .locator("#table-body tr.t-row:visible")
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.load));
    await selector.selectOption("active");
    assert.deepEqual(await ids(), ["VISUAL-002"]);
    await page.locator("#configure-load-views").click();
    const dialog = page.locator(".load-views-dialog");
    await dialog.locator('[name="name"]').fill("En operación");
    await dialog.locator('[name="pickup"]').selectOption("any");
    await dialog.locator('[name="default"]').check();
    await dialog
      .locator(".load-view-preview")
      .filter({ hasText: "2 de 4" })
      .waitFor();
    await dialog.locator('[data-move-view="-1"]').click();
    await dialog.locator('[data-edit-view="attention"]').click();
    await dialog.locator('[name="visible"]').uncheck();
    await dialog.locator("[data-add-view]").click();
    await dialog.locator('[name="name"]').fill("Programadas");
    await dialog.locator('[name="lifecycle"]').selectOption("open");
    await dialog.locator('[name="pickup"]').selectOption("future");
    await dialog.locator('[name="layout"]').selectOption("cards");
    await dialog
      .locator(".load-view-preview")
      .filter({ hasText: "1 de 4" })
      .waitFor();
    await dialog
      .getByRole("button", { name: "Guardar menú", exact: true })
      .click();
    await dialog
      .locator('[role="alert"]')
      .filter({ hasText: "Conflicto simulado" })
      .waitFor();
    assert.equal(
      await dialog.locator('[name="name"]').inputValue(),
      "Programadas",
    );
    assert.equal(saves, 0);
    await dialog
      .getByRole("button", { name: "Guardar menú", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(saves, 1);
    assert.equal(saved.defaultId, "active");
    assert.equal(
      await selector.locator('option[value="active"]').textContent(),
      "En operación",
    );
    assert.equal(
      await selector.locator('option[value="attention"]').count(),
      0,
    );
    assert.equal(
      await selector.locator("option").first().getAttribute("value"),
      "active",
    );
    assert.deepEqual(await ids(), ["VISUAL-001", "VISUAL-002"]);
    checks.push(
      "Activas configurable incluye cargas futuras; nombre, orden, visibilidad y vista inicial se guardan juntos sin sobrescribir un borrador rechazado.",
    );
    const scheduled = saved.items.find((v) => v.name === "Programadas");
    await selector.selectOption(scheduled.id);
    assert.equal(await page.locator("#cards-view").isVisible(), true);
    assert.deepEqual(
      await page
        .locator("#cards-view .card[data-load]:visible")
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.load)),
      ["VISUAL-001"],
    );
    await page.locator('[data-page="home"]').click();
    await page.locator('[data-page="operation"]').click();
    assert.equal(await selector.inputValue(), scheduled.id);
    checks.push(
      "Las vistas nuevas filtran tabla y tarjetas; volver a Cargas conserva la selección.",
    );
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("bajio_load_views_"))
        .forEach((k) => localStorage.removeItem(k)),
    );
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    await selector
      .locator('option[value="active"]')
      .filter({ hasText: "En operación" })
      .waitFor({ state: "attached" });
    assert.equal(await selector.inputValue(), "active");
    assert.deepEqual(await ids(), ["VISUAL-001", "VISUAL-002"]);
    checks.push(
      "Una recarga sin caché recupera el menú y la opción predeterminada desde la cuenta.",
    );
    await page.locator("#configure-load-views").click();
    await dialog.locator('[name="name"]').fill("Borrador cancelado");
    await dialog.locator('[data-edit-view="all"]').click();
    assert.equal(await dialog.locator('[name="name"]').inputValue(), "Todas");
    await dialog.locator('[data-edit-view="active"]').click();
    assert.equal(
      await dialog.locator('[name="name"]').inputValue(),
      "Borrador cancelado",
    );
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(saves, 1);
    await page.locator("#configure-load-views").click();
    assert.equal(
      await dialog.locator('[name="name"]').inputValue(),
      "En operación",
    );
    await dialog.locator("[data-reset-view]").click();
    assert.equal(await dialog.locator('[name="name"]').inputValue(), "Activas");
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(saves, 1);
    await page.locator("#configure-load-views").click();
    await dialog
      .getByText("Periodo de Pickup, entrega o cruce", { exact: true })
      .click();
    await dialog.locator('[name="period"]').selectOption("custom");
    await dialog.locator('[name="start"]').fill("2026-10-10");
    await dialog.locator('[name="end"]').fill("2026-10-08");
    await dialog
      .getByRole("button", { name: "Guardar menú", exact: true })
      .click();
    await dialog
      .locator('[role="alert"]')
      .filter({ hasText: "Hasta no puede" })
      .waitFor();
    assert.equal(saves, 1);
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    for (const width of [390, 320, 1533]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator("#configure-load-views").click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.equal(
        await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        true,
      );
      const saveButton = await dialog
        .locator('button[type="submit"]')
        .boundingBox();
      assert.ok(
        saveButton.y + saveButton.height <= 1000,
        "Guardar menú permanece visible",
      );
      await page.screenshot({
        path: "/tmp/panel-mostrar-" + width + ".png",
        fullPage: true,
      });
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
    }
    checks.push(
      "Cancelar y restaurar sin guardar conservan las preferencias; editor sin desbordamiento a 320, 390 y 1533 px.",
    );
    await writeFile(
      new URL("../docs/evidencia-mostrar-configurable.json", import.meta.url),
      JSON.stringify(
        {
          source:
            "HTML empaquetado con Supabase simulado; PostgreSQL se valida por separado",
          checks,
        },
        null,
        2,
      ) + "\n",
    );
    return checks;
  } finally {
    rawLoads.splice(0, rawLoads.length, ...snapshot);
    customerAssignments.splice(0, customerAssignments.length, ...assignments);
    await page?.close();
  }
}
