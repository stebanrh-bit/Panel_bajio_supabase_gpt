import assert from "node:assert/strict";

/** Reproduce avisos atrasados aun si el servidor vuelve a entregar su caché anterior. */
export async function runFollowupReview({ newPage, rawLoads, profiles }) {
  const snapshot = structuredClone(rawLoads),
    checks = [];
  const past = "2026-10-08T16:00:00Z",
    future = "2026-10-09T18:00:00Z";
  const record = rawLoads[0];
  Object.assign(record, {
    status: "Descompuesta",
    recordatorio_fecha: future,
    next_review_at: past,
    next_review_note: "Confirmar reparación con taller",
    updated_by: profiles[0].id,
    instruction_context: { state: "completed" },
    punctual_pending: true,
    punctual_note: "Verificar la reparación ahora",
    punctual_opened_at: past,
    punctual_opened_by: profiles[0].id,
  });
  const page = await newPage(
    false,
    { width: 1533, height: 1000 },
    "internal",
    profiles[0],
    true,
  );
  let reject = true,
    edits = 0;
  const oldPersonal = {
    id: "personal-old",
    kind: "load_review",
    load: record.load,
    recipient: profiles[0].id,
    dedupe_key: `review:${record.load}:seguimiento_personal:${past}:${profiles[0].id}`,
    message: "Seguimiento antiguo",
    created_at: past,
  };
  const alerts = [oldPersonal];
  const stamp = () => `2026-10-08T18:01:${String(++edits).padStart(2, "0")}Z`;
  const refresh = () =>
    page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("panel:instruction-refresh")),
    );
  const workspace = page.locator("#workspace-body");
  async function openWorkspace() {
    await page.locator('[data-page="operation"]').click();
    await page
      .locator('#table-body tr[data-load="VISUAL-001"] [data-table-select]')
      .click();
    await page.locator("#table-detail-body [data-workspace-load]").click();
    await page.locator("#workspace-backdrop.show").waitFor();
  }
  try {
    await page.route("**/rest/v1/rpc/ops_visible_alerts", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(alerts),
      }),
    );
    await page.route("**/rest/v1/loads**", async (route) => {
      const url = new URL(route.request().url()),
        load = url.searchParams.get("load")?.slice(3);
      const row = rawLoads.find((item) => item.load === load);
      if (route.request().method() === "PATCH") {
        if (reject)
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              message: "No se pudo completar el seguimiento",
            }),
          });
        assert.equal(
          url.searchParams.get("updated_at")?.slice(3),
          row.updated_at,
        );
        Object.assign(row, route.request().postDataJSON(), {
          updated_at: stamp(),
          updated_by: profiles[0].id,
        });
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify([row]),
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(row || rawLoads),
      });
    });
    await page.route(
      "**/rest/v1/rpc/ops_set_punctual_pending",
      async (route) => {
        const input = route.request().postDataJSON();
        assert.equal(input.p_version, record.updated_at);
        Object.assign(record, {
          punctual_pending: input.p_active,
          punctual_note: input.p_active ? input.p_note : record.punctual_note,
          punctual_resolved_at: stamp(),
          punctual_resolved_by: profiles[0].id,
          updated_at: stamp(),
          updated_by: profiles[0].id,
        });
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(record),
        });
      },
    );
    await page.reload();
    await openWorkspace();
    await page.waitForFunction(() =>
      document
        .querySelector("#avisos-lista")
        ?.textContent.includes(
          "Revisión pendiente · abre esta carga para atenderla",
        ),
    );
    await workspace.locator("[data-review-clear]").waitFor();
    await workspace.locator("[data-review-clear]").click();
    await page
      .getByText("No se pudo completar el seguimiento", { exact: false })
      .first()
      .waitFor();
    assert.equal(record.next_review_at, past);
    assert.equal(
      await workspace.locator("[data-review-clear]").isEnabled(),
      true,
    );
    reject = false;
    await workspace.locator("[data-review-clear]").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#workspace-body .review-state")?.textContent ===
        "Sin seguimiento programado",
    );
    assert.equal(record.next_review_at, "");
    assert.equal(record.punctual_pending, true);
    assert.equal(record.recordatorio_fecha, future);
    await page.waitForFunction(
      () => !document.querySelector('[data-aviso-id="server:personal-old"]'),
    );
    checks.push(
      "Completar desde Expediente conserva el pendiente puntual y la revisión por estatus; un error no muestra éxito y permite reintentar",
    );

    await workspace.locator("[data-punctual-resolve]").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#workspace-body [data-punctual-select]")
          ?.value === "false",
    );
    assert.equal(record.punctual_pending, false);
    assert.equal(record.punctual_note, "Verificar la reparación ahora");
    assert.equal(record.next_review_at, "");
    assert.equal(record.recordatorio_fecha, future);
    await page.reload();
    await page.locator('[data-page="home"]').click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator("#punctual-section").isVisible(), false);
    assert.equal(
      await page.locator('[data-aviso-id="server:personal-old"]').count(),
      0,
    );
    assert.equal(
      await page.locator('[data-aviso-id^="rev:VISUAL-001:"]').count(),
      0,
    );
    checks.push(
      "Resolver el pendiente puntual conserva su nota e historial; ambos cierres persisten al recargar y la alerta antigua no reaparece",
    );

    record.next_review_at = past;
    record.next_review_note = "Llamar más tarde";
    record.updated_at = stamp();
    await refresh();
    await openWorkspace();
    await workspace.locator("#next-review-at").fill("2026-10-09T12:00");
    await workspace.locator("[data-review-save]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#workspace-body .review-state")
        ?.textContent.includes("Programado para"),
    );
    assert.equal(record.next_review_at, "2026-10-09T18:00:00.000Z");
    await page.waitForFunction(
      () => !document.querySelector('[data-aviso-id="server:personal-old"]'),
    );
    checks.push(
      "Reprogramar retira el aviso del plazo anterior y conserva la nueva fecha y hora de México",
    );

    record.status = "En transito";
    record.recordatorio_fecha = past;
    record.updated_at = stamp();
    alerts.push({
      ...oldPersonal,
      id: "transit-current",
      dedupe_key: `review:${record.load}:revision_operativa:${past}:${profiles[0].id}`,
      message: "Revisión de tránsito vigente",
    });
    await page.reload();
    await openWorkspace();
    await workspace.locator("[data-review-clear]").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#workspace-body .review-state")?.textContent ===
        "Sin seguimiento programado",
    );
    await page.waitForTimeout(600);
    assert.equal(record.recordatorio_fecha, past);
    assert.equal(
      (await page
        .locator("#avisos-lista")
        .getByText("Revisión pendiente · abre esta carga para atenderla", {
          exact: false,
        })
        .count()) > 0,
      true,
    );
    assert.equal(
      await page.locator('[data-aviso-id="server:personal-old"]').count(),
      0,
    );
    checks.push(
      "Completar el seguimiento personal no silencia una revisión de tránsito independiente que sigue pendiente",
    );
    return { version: "2026.10.27.6", checks, productionWrites: 0 };
  } finally {
    rawLoads.splice(0, rawLoads.length, ...snapshot);
    await page.close();
  }
}
