import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { clickOperationOption } from "./simple_sheet_checks.mjs";

/** Recorrido del HTML entregable con datos ficticios: nunca modifica Supabase real. */
export async function runLoadOrderReview({ newPage, rawLoads, profiles }) {
  const snapshot = structuredClone(rawLoads),
    checks = [];
  let page;
  try {
    ["EN PLANTA", "En planta", "  en  Planta  "].forEach(
      (status, index) => (rawLoads[index].status = status),
    );
    rawLoads.push({
      ...rawLoads[1],
      load: "OTRO-CLIENTE",
      customer: "OTRO CLIENTE",
    });
    page = await newPage(
      false,
      { width: 1533, height: 1000 },
      "internal",
      profiles[0],
      true,
    );
    await page.locator('[data-page="operation"]').click();
    await page.locator("#operation-state-filter").selectOption("all");
    const rows = page.locator("#table-body tr.t-row:visible");
    const ids = () =>
      rows.evaluateAll((nodes) => nodes.map((row) => row.dataset.load));
    const numbers = () =>
      rows.locator(".load-position-number").allTextContents();
    assert.equal(await rows.count(), 4);
    assert.deepEqual(await numbers(), ["1", "2", "3", "4"]);
    const pink = await page
      .locator('#table-body [data-load="VISUAL-001"] select')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    for (const load of ["VISUAL-001", "VISUAL-002", "VISUAL-003"]) {
      assert.equal(
        await page
          .locator(`#table-body [data-load="${load}"] select`)
          .evaluate((node) => getComputedStyle(node).backgroundColor),
        pink,
      );
    }
    const rgb = pink.match(/\d+/g).map(Number);
    assert.ok(rgb[0] > rgb[1] && rgb[2] > rgb[1], pink);
    checks.push(
      "En planta se pinta de rosa con mayúsculas, minúsculas y espacios; conserva el estatus real",
    );

    const handle = (load) => page.locator(`[data-load-order="${load}"]`);
    async function dragBefore(source, target) {
      await handle(source).scrollIntoViewIfNeeded();
      const from = await handle(source).boundingBox(),
        to = await page
          .locator(`#table-body [data-load="${target}"]`)
          .boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + 5, { steps: 12 });
      await page.mouse.up();
    }
    await dragBefore("VISUAL-003", "VISUAL-001");
    assert.deepEqual(await ids(), [
      "VISUAL-003",
      "VISUAL-001",
      "VISUAL-002",
      "OTRO-CLIENTE",
    ]);
    assert.deepEqual(await numbers(), ["1", "2", "3", "4"]);
    assert.equal(
      await page.locator("#table-detail-dialog").evaluate((node) => node.open),
      false,
    );
    await page.locator("#cliente-filter").selectOption({ label: "ACME" });
    await handle("VISUAL-001").focus();
    await page.keyboard.press("ArrowUp");
    assert.deepEqual(await ids(), ["VISUAL-001", "VISUAL-003", "VISUAL-002"]);
    assert.deepEqual(await numbers(), ["1", "2", "3"]);
    await page.locator("#cliente-filter").selectOption("");
    const personal = await ids();
    assert.equal(personal.at(-1), "OTRO-CLIENTE");
    await page.locator('#table-view [data-sort="trailer"]').click();
    assert.notDeepEqual(await ids(), personal);
    await clickOperationOption(page, "#table-manual-order");
    assert.deepEqual(await ids(), personal);
    await page.locator("#ux-advanced-filters > summary").click();
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    assert.deepEqual(await ids(), personal);
    checks.push(
      "Arrastre y teclado reordenan y renumeran sin abrir el detalle; filtros conservan cargas ocultas y Mi orden restaura la preferencia tras ordenar por columna y recargar",
    );

    const first = await handle(personal[0]).boundingBox(),
      target = await rows.nth(1).boundingBox();
    await page.mouse.move(first.x + 8, first.y + 8);
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height - 5,
      { steps: 10 },
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual(await ids(), personal);
    assert.equal(await page.locator(".load-order-ghost").count(), 0);
    checks.push(
      "Escape cancela el movimiento y retira la guía sin modificar el orden",
    );

    for (const width of [1920, 1533, 1280, 1024, 820, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        String(width),
      );
      assert.equal(await rows.locator(".t-position:visible").count(), 4);
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await rows
      .first()
      .evaluate((row) =>
        window.scrollTo(
          0,
          window.scrollY + row.getBoundingClientRect().top - 100,
        ),
      );
    const from = await handle(personal[1]).boundingBox(),
      to = await rows.first().boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x + 15, y: from.y + 15 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: to.x + 30, y: to.y + 20 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
    const mobileOrder = [personal[1], personal[0], ...personal.slice(2)];
    assert.deepEqual(await ids(), mobileOrder);
    assert.deepEqual(await numbers(), ["1", "2", "3", "4"]);
    checks.push(
      "Arrastre táctil real mediante CDP mueve la carga en móvil; ocho anchos conservan numeración sin scroll lateral",
    );
    await page.setViewportSize({ width: 1533, height: 1000 });
    await page
      .locator("#page-operation")
      .screenshot({
        path: "/tmp/panel-original-comparison/cargas-orden-manual.png",
      });
    assert.deepEqual(
      rawLoads.slice(0, 3).map((row) => row.status),
      ["EN PLANTA", "En planta", "  en  Planta  "],
    );
    const result = { checks, pink, order: mobileOrder };
    await writeFile(
      "/tmp/panel-original-comparison/orden-manual.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  } finally {
    if (page) await page.close();
    rawLoads.splice(0, rawLoads.length, ...snapshot);
  }
}
