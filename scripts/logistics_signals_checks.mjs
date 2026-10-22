import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { clickOperationOption } from "./simple_sheet_checks.mjs";

/** Iconos en el HTML entregable: todas las peticiones de Supabase son locales y simuladas. */
export async function runLogisticsSignalsReview({
  newPage,
  rawLoads,
  profiles,
}) {
  const snapshot = structuredClone(rawLoads),
    checks = [];
  const page = await newPage(
    false,
    { width: 1533, height: 1000 },
    "internal",
    profiles[0],
    true,
  );
  let reject = false,
    calls = 0;
  try {
    await page.route("**/rest/v1/rpc/ops_set_load_signals", async (route) => {
      calls++;
      const input = route.request().postDataJSON(),
        record = rawLoads.find((r) => r.load === input.p_load);
      assert.equal(input.p_version, record.updated_at);
      if (reject)
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            message: "La carga cambió. Actualiza antes de guardar",
          }),
        });
      Object.assign(record, {
        logistics_signals: [...input.p_signals].sort(),
        logistics_signals_by: profiles[0].id,
        logistics_signals_at: `2026-10-08T18:05:${String(calls).padStart(2, "0")}Z`,
        updated_at: `2026-10-08T18:05:${String(calls).padStart(2, "0")}Z`,
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(record),
      });
    });
    await page.locator('[data-page="operation"]').click();
    const row = page.locator('#table-body tr[data-load="VISUAL-001"]'),
      dialog = page.locator("#load-signals-dialog");
    const trigger = row.locator(".t-trailer [data-load-signals]");
    await trigger.click();
    assert.equal(
      await page.locator("#table-detail-dialog").evaluate((node) => node.open),
      false,
    );
    assert.equal(await dialog.locator("[data-signal-option]").count(), 8);
    assert.equal(
      (await dialog.locator("#load-signals-options").innerText()).trim(),
      "",
    );
    assert.equal(
      await dialog.locator("#load-signals-options [title]").count(),
      0,
    );
    await dialog.locator('[data-signal-option="workshop"]').check();
    await dialog.locator('[data-signal-option="delay"]').check();
    await dialog.locator("[data-signals-cancel]").last().click();
    assert.equal(calls, 0);
    assert.equal(await trigger.locator("[data-signal-id]").count(), 0);
    await trigger.click();
    assert.equal(await dialog.locator("input:checked").count(), 0);
    await dialog.locator('[data-signal-option="workshop"]').check();
    await dialog.locator('[data-signal-option="delay"]').check();
    await dialog.locator('[data-signal-option="documents"]').check();
    assert.equal(
      await dialog.locator("input:disabled:not(:checked)").count(),
      5,
    );
    await page.locator("#load-signals-dialog").screenshot({
      path: "/tmp/panel-original-comparison/senalamientos-selector.png",
    });
    reject = true;
    await dialog.locator("[data-signals-save]").click();
    await page.waitForFunction(() =>
      document
        .getElementById("load-signals-error")
        ?.textContent.includes("cambió"),
    );
    assert.equal(await dialog.locator("input:checked").count(), 3);
    assert.equal(await trigger.locator("[data-signal-id]").count(), 0);
    reject = false;
    await dialog.locator("[data-signals-save]").click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.locator("svg").count(), 3);
    assert.match(
      await trigger.getAttribute("aria-label"),
      /En taller.*Retraso.*Documentos pendientes/,
    );
    assert.deepEqual(rawLoads[0].logistics_signals, [
      "delay",
      "documents",
      "workshop",
    ]);
    checks.push(
      "Ocho alertas sin nombres visibles; máximo tres por carga, cancelar no escribe; error conserva selección y guardado confirmado",
    );
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    assert.equal(await trigger.locator("svg").count(), 3);
    const viewer = await newPage(
      false,
      { width: 1280, height: 900 },
      "internal",
      { ...profiles[1], role: "manager" },
      true,
    );
    try {
      await viewer.locator('[data-page="operation"]').click();
      await viewer
        .locator('#table-body tr[data-load="VISUAL-001"] [data-load-signals]')
        .click();
      assert.equal(
        await viewer
          .locator("#load-signals-dialog [data-signal-option]:disabled")
          .count(),
        8,
      );
      assert.equal(
        await viewer
          .locator("#load-signals-dialog [data-signals-save]")
          .isVisible(),
        false,
      );
      assert.equal(
        await viewer.locator("#load-signals-dialog input:checked").count(),
        3,
      );
      checks.push(
        "Gerencia consulta los iconos compartidos con selector de solo lectura",
      );
    } finally {
      await viewer.close();
    }
    const bounds = await row.locator(".t-trailer").evaluate((cell) => ({
      trailer: cell
        .querySelector("[data-trailer-value]")
        .getBoundingClientRect().bottom,
      icons: cell.querySelector("[data-load-signals]").getBoundingClientRect()
        .top,
    }));
    assert.ok(bounds.icons >= bounds.trailer);
    await page.locator("#page-operation").screenshot({
      path: "/tmp/panel-original-comparison/senalamientos-listado.png",
    });
    await row.locator("[data-table-select]").click();
    const detail = page.locator("#table-detail-body [data-load-signals]");
    assert.equal(await detail.locator("svg").count(), 3);
    await detail.click();
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#table-detail-dialog").evaluate((node) => node.open),
      true,
    );
    await page.keyboard.press("Escape");
    await clickOperationOption(page, "#view-toggle-btn");
    assert.equal(
      await page
        .locator(
          '#cards-view .card[data-load="VISUAL-001"] [data-load-signals] svg',
        )
        .count(),
      3,
    );
    await clickOperationOption(page, "#view-toggle-btn");
    checks.push(
      "Los señalamientos persisten al recargar y aparecen debajo del trailer, en detalle y en tarjetas; Escape del selector conserva el detalle abierto",
    );
    for (const width of [320, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Tabla sin scroll lateral: ${width}`,
      );
      await trigger.click();
      const fits = await dialog.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          node.scrollWidth <= node.clientWidth
        );
      });
      assert.ok(fits, `Selector sin cortes: ${width}`);
      if (width === 390)
        await dialog.screenshot({
          path: "/tmp/panel-original-comparison/senalamientos-movil.png",
        });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1533, height: 1000 });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await dialog.locator("[data-signals-clear]").click();
    assert.equal(await dialog.locator("input:checked").count(), 0);
    await dialog.locator("[data-signals-save]").click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await trigger.locator("[data-signal-id]").count(), 0);
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    assert.equal(await trigger.locator("[data-signal-id]").count(), 0);
    for (const field of [
      "status",
      "color",
      "next_review_at",
      "next_review_note",
      "recordatorio_fecha",
      "punctual_pending",
      "punctual_note",
    ])
      assert.equal(rawLoads[0][field], snapshot[0][field], field);
    checks.push(
      "Selector usable con teclado y en anchos 320–1920; quitar todos persiste sin modificar estatus, color ni pendientes/seguimientos",
    );
    const result = {
      checks,
      source: "Lucide 0.468.0 (ISC), SVG incluidos localmente",
      productionWrites: 0,
    };
    await writeFile(
      "/tmp/panel-original-comparison/senalamientos.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  } finally {
    rawLoads.splice(0, rawLoads.length, ...snapshot);
    await page.close();
  }
}
