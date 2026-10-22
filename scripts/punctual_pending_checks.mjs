import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

/** Interfaz entregable + SDK real; el transporte de Supabase se simula por completo. */
export async function runPunctualPendingReview({
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
  let calls = 0,
    reject = false;
  try {
    await page.route(
      "**/rest/v1/rpc/ops_set_punctual_pending",
      async (route) => {
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
        const stamp = `2026-10-08T18:00:${String(calls).padStart(2, "0")}Z`;
        Object.assign(record, {
          punctual_pending: input.p_active,
          punctual_note: input.p_active ? input.p_note : record.punctual_note,
          punctual_opened_at:
            input.p_active && !record.punctual_pending
              ? stamp
              : record.punctual_opened_at,
          punctual_opened_by:
            input.p_active && !record.punctual_pending
              ? profiles[0].id
              : record.punctual_opened_by,
          punctual_resolved_at: input.p_active ? null : stamp,
          punctual_resolved_by: input.p_active ? null : profiles[0].id,
          updated_at: stamp,
        });
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(record),
        });
      },
    );
    await page.locator('[data-page="operation"]').click();
    const row = page.locator('#table-body tr[data-load="VISUAL-001"]');
    await row.locator("[data-table-select]").click();
    const editor = page.locator("#table-detail-body .punctual-editor");
    await editor.locator("[data-punctual-select]").selectOption("true");
    await editor.locator("[data-punctual-save]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#table-detail-body .punctual-error")
        ?.textContent.includes("Escribe"),
    );
    assert.equal(calls, 0);
    const note =
      "Confirmar con el taller la hora de salida <sin perder la nota>";
    await editor.locator("[data-punctual-note]").fill(note);
    reject = true;
    await editor.locator("[data-punctual-save]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#table-detail-body .punctual-error")
        ?.textContent.includes("cambió"),
    );
    assert.equal(
      await editor.locator("[data-punctual-note]").inputValue(),
      note,
    );
    assert.ok(!rawLoads[0].punctual_pending);
    reject = false;
    await editor.locator("[data-punctual-save]").click();
    await page.waitForFunction(
      () =>
        document.querySelector('#table-body tr[data-load="VISUAL-001"]')
          ?.dataset.punctual === "true",
    );
    assert.equal(rawLoads[0].punctual_note, note);
    checks.push(
      "Nota obligatoria; un rechazo del servidor conserva el texto sin marcar la carga; confirmación guarda el pendiente",
    );
    await page.keyboard.press("Escape");
    await page.reload();
    await page.locator('[data-page="home"]').click();
    await page.locator("#punctual-section").waitFor({ state: "visible" });
    assert.match(
      await page.locator("#punctual-section").innerText(),
      /Truck: T-102 · Trailer: R-210/,
    );
    assert.ok(
      (await page.locator("#punctual-section").innerText()).includes(note),
    );
    await page
      .locator("#page-home")
      .screenshot({
        path: "/tmp/panel-original-comparison/pendientes-puntuales-inicio.png",
      });
    await page.locator("[data-punctual-filter]").click();
    assert.equal(
      await page.locator("#operation-state-filter").inputValue(),
      "punctual",
    );
    assert.equal(await page.locator("#table-body tr.t-row:visible").count(), 1);
    checks.push(
      "Persistencia tras recargar; Inicio muestra cliente, equipo y nota escapada; Ver en Cargas filtra solo los pendientes",
    );
    const other = await newPage(
      false,
      { width: 1280, height: 900 },
      "internal",
      profiles[1],
      true,
    );
    try {
      await other.locator('[data-page="operation"]').click();
      await other.locator("#operation-state-filter").selectOption("punctual");
      assert.equal(
        await other.locator("#table-body tr.t-row:visible").count(),
        1,
      );
      await other.locator("#cliente-filter").selectOption({ label: "ACME" });
      assert.equal(
        await other.locator("#table-body tr.t-row:visible").count(),
        1,
      );
      await other.locator("#search").fill("NO-EXISTE");
      assert.equal(
        await other.locator("#table-body tr.t-row:visible").count(),
        0,
      );
      checks.push(
        "Otro CSR ve el pendiente compartido; el apartado conserva filtros de cliente y búsqueda",
      );
    } finally {
      await other.close();
    }
    await row.locator("[data-table-select]").click();
    assert.equal(
      await editor.locator("[data-punctual-note]").inputValue(),
      note,
    );
    await page
      .locator("#table-detail-dialog")
      .screenshot({
        path: "/tmp/panel-original-comparison/pendiente-puntual-detalle.png",
      });
    await page.keyboard.press("Escape");
    await page.locator('[data-page="home"]').click();
    await page.locator("#punctual-list [data-workspace-load]").click();
    const workspace = page.locator("#workspace-body .punctual-editor");
    await workspace.waitFor({ state: "visible" });
    assert.equal(
      await workspace.locator("[data-punctual-note]").inputValue(),
      note,
    );
    await workspace
      .locator("[data-punctual-note]")
      .fill("Confirmar refacción y salida del taller");
    await workspace.locator("[data-punctual-save]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#punctual-list")
        ?.textContent.includes("Confirmar refacción"),
    );
    for (const width of [320, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false, `Sin scroll lateral: ${width}`);
    }
    await workspace.locator("[data-punctual-resolve]").click();
    await page.waitForFunction(
      () => document.querySelector("#punctual-section")?.hidden,
    );
    await page.locator("#workspace-close").click();
    await page.locator('[data-page="operation"]').click();
    await page.locator("#operation-state-filter").selectOption("punctual");
    assert.equal(await page.locator("#table-body tr.t-row:visible").count(), 0);
    assert.equal(rawLoads[0].punctual_pending, false);
    for (const field of [
      "status",
      "next_review_at",
      "next_review_note",
      "recordatorio_fecha",
      "client_notify_pending",
    ])
      assert.equal(rawLoads[0][field], snapshot[0][field], field);
    await page.reload();
    await page.locator('[data-page="home"]').click();
    assert.equal(await page.locator("#punctual-section").isVisible(), false);
    checks.push(
      "Detalle rápido y expediente permiten editar/resolver; resolución persiste y conserva estatus, avisos y seguimiento con fecha; sin scroll lateral de 320 a 1920 px",
    );
    const result = { checks, productionWrites: 0 };
    await writeFile(
      "/tmp/panel-original-comparison/pendientes-puntuales.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  } finally {
    rawLoads.splice(0, rawLoads.length, ...snapshot);
    await page.close();
  }
}
