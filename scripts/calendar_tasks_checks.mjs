/** Verifica vistas, asignación y cierre de seguimiento con datos y transporte locales. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

export async function runCalendarTasksReview({
  newPage,
  rawLoads,
  taskRow,
  profiles,
}) {
  const snapshot = structuredClone(rawLoads);
  const checks = [],
    layouts = [];
  let page;
  try {
    // Más de tres movimientos en un día: ninguna vista debe perder los restantes.
    for (let i = 1; i <= 6; i++)
      rawLoads.push({
        ...rawLoads[1],
        load: "VIEWS-" + i,
        pickup_appt: "2026-10-08T17:00:00Z",
        delivery_appt: "",
        customer: "OTRO CLIENTE",
      });
    page = await newPage();
    await page.locator('[data-page="calendario"]').click();
    const total = await page.locator("#cal-grid .cal-chip").count();
    assert.ok(total >= 8);
    for (const width of [1920, 1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ["agenda", "week", "list"]) {
        await page.locator(`[data-cal-view="${view}"]`).click();
        assert.equal(
          await page.locator("#cal-grid").getAttribute("data-view"),
          view,
        );
        assert.equal(
          await page.locator('[data-cal-view][aria-pressed="true"]').count(),
          1,
        );
        assert.equal(await page.locator("#cal-grid .cal-chip").count(), total);
        if (view === "list") {
          assert.equal(
            await page.locator("#cal-grid .cal-chip:visible").count(),
            total,
          );
          assert.equal(await page.locator("#cal-grid details").count(), 0);
        }
        const fit = await page.locator("#cal-grid").evaluate((grid) => ({
          width: innerWidth,
          page: document.documentElement.scrollWidth,
          available: grid.clientWidth,
          content: grid.scrollWidth,
        }));
        assert.ok(
          fit.page <= width && fit.content <= fit.available + 1,
          JSON.stringify({ view, ...fit }),
        );
        layouts.push({ view, ...fit });
      }
    }
    checks.push(
      "Tres vistas conservan los movimientos y caben en seis anchos; Lista muestra todos sin desplegables",
    );
    await page.setViewportSize({ width: 1533, height: 1000 });
    await page.locator("#cal-cliente").selectOption({ label: "OTRO CLIENTE" });
    await page.locator('[data-cal-type="pickup"]').click();
    for (const view of ["week", "agenda", "list"]) {
      await page.locator(`[data-cal-view="${view}"]`).click();
      assert.equal(await page.locator("#cal-grid .cal-chip").count(), 6);
      assert.equal(
        await page.locator("#cal-cliente option:checked").textContent(),
        "OTRO CLIENTE",
      );
      assert.equal(
        await page
          .locator('[data-cal-type="pickup"]')
          .getAttribute("aria-pressed"),
        "true",
      );
    }
    await page.locator("#cal-next").click();
    assert.equal(await page.locator("#cal-grid .cal-chip").count(), 0);
    await page.locator("#cal-hoy").click();
    assert.equal(await page.locator("#cal-grid .cal-chip").count(), 6);
    await page.locator("#cal-reset").click();
    assert.equal(
      await page.locator("#cal-grid").getAttribute("data-view"),
      "list",
    );
    await page.reload();
    await page.locator('[data-page="calendario"]').click();
    assert.equal(
      await page.locator("#cal-grid").getAttribute("data-view"),
      "list",
    );
    checks.push(
      "Cambiar vista conserva cliente, tipo y semana; la preferencia permanece al recargar",
    );
    for (const view of ["agenda", "week", "list"]) {
      await page.locator(`[data-cal-view="${view}"]`).click();
      await page
        .locator("#cal-grid")
        .screenshot({
          path: `/tmp/panel-original-comparison/calendario-vista-${view}.png`,
        });
    }
    await page
      .locator('#cal-grid [data-cal-load="VISUAL-001"]')
      .first()
      .click();
    await page.locator("#workspace-backdrop.show").waitFor();
    await page.locator("#workspace-close").click();

    // Comentario real del adaptador para comprobar el espacio y su acceso al detalle.
    const comment =
      "Confirmar la hora de llegada con el cliente antes del cruce. Documentación recibida; verificar el sello del trailer.";
    await page.route("**/rest/v1/rpc/ops_latest_comments", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            load: "VISUAL-001",
            body: comment,
            created_at: "2026-10-08T17:00:00Z",
            created_by: profiles[0].id,
          },
        ]),
      }),
    );
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    await page.locator("#view-toggle-btn").click();
    const row = page.locator('#table-body [data-load="VISUAL-001"]');
    await row.locator(".t-comment-text").waitFor();
    const labels = await row
      .locator("td")
      .evaluateAll((cells) => cells.map((cell) => cell.dataset.label));
    assert.equal(labels.length, 8);
    assert.ok(labels.indexOf("Origen") < labels.indexOf("Destino"));
    assert.ok(!labels.includes("Recolección · cita"));
    await row.locator(".t-trailer .trailer-full-value").click();
    await page.locator("#table-detail-panel:not([hidden])").waitFor();
    for (const width of [1920, 1533, 1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const field of [".t-origin", ".t-destination", ".t-comment"])
        assert.equal(await row.locator(field).isVisible(), true);
      assert.equal(await row.locator(".t-comment-text").innerText(), comment);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    assert.equal(
      await page
        .locator('#table-detail-body [data-pickup-appt-load="VISUAL-001"]')
        .count(),
      1,
    );
    assert.equal(
      await page.locator("#table-detail-body [data-create-task-load]").count(),
      1,
    );
    assert.doesNotMatch(
      await page.locator("#table-detail-body").innerText(),
      /Marcar pendiente|Asignar a alguien en especial/,
    );
    await page.setViewportSize({ width: 1533, height: 1000 });
    await page
      .locator("#table-view")
      .screenshot({
        path: "/tmp/panel-original-comparison/cargas-origen-comentarios.png",
      });
    checks.push(
      "Listado conserva origen antes de destino y comentarios con detalle abierto; la recolección queda en el detalle",
    );

    const tasks = [];
    await page.route("**/rest/v1/rpc/ops_save_tasks", (route) => {
      const values = route.request().postDataJSON().p_values;
      tasks.push(values);
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            ...taskRow,
            id: "views-task-" + tasks.length,
            created_by: profiles[0].id,
          },
        ]),
      });
    });
    const createTask = page.locator(
      "#table-detail-body [data-create-task-load]",
    );
    await createTask.click();
    await page.locator("#bitacora-nota").fill("Confirmar documentos con Ana");
    await page.locator("#bitacora-asignado").selectOption("Ana");
    await page.locator("#bitacora-submit").click();
    await page.locator("#bitacora-backdrop.show").waitFor({ state: "hidden" });
    assert.equal(tasks[0].assigned_to, profiles[1].id);
    assert.equal(tasks[0].assigned_csr, null);
    assert.deepEqual(tasks[0].loads, ["VISUAL-001"]);
    await createTask.click();
    await page.locator("#bitacora-assignment-mode").selectOption("coverage");
    assert.equal(
      await page.locator("#bitacora-asignado-wrap").isVisible(),
      false,
    );
    assert.match(
      await page.locator("#bitacora-asignado-auto-label").innerText(),
      /Ana/,
    );
    await page
      .locator("#bitacora-nota")
      .fill("Revisión para quien cubra a Ana");
    await page.locator("#bitacora-submit").click();
    await page.locator("#bitacora-backdrop.show").waitFor({ state: "hidden" });
    assert.equal(tasks[1].assigned_to, null);
    assert.equal(tasks[1].assigned_csr, profiles[1].id);
    await createTask.click();
    await page.locator("#bitacora-assignment-mode").selectOption("coverage");
    await page.locator('[data-bitacora-load-remove="VISUAL-001"]').click();
    assert.equal(
      await page.locator("#bitacora-assignment-mode-wrap").isVisible(),
      false,
    );
    assert.equal(
      await page.locator("#bitacora-asignado-wrap").isVisible(),
      true,
    );
    // Cerrar con los campos restaurados evita guardar una tercera tarea.
    await page.locator("#bitacora-close").click();
    await page.locator("#confirmar-ok").click();
    checks.push(
      "Crear tarea guarda persona o cobertura con destinos distintos; quitar la carga retira la cobertura anterior",
    );

    await page
      .locator('#table-detail-body [data-workspace-load="VISUAL-001"]')
      .click();
    const state = page.locator("#workspace-body .review-state");
    await state.filter({ hasText: "Pendiente de atender" }).waitFor();
    const previousTransit = rawLoads[0].recordatorio_fecha;
    const previousNotify = rawLoads[0].client_notify_pending;
    let failCompletion = true;
    await page.route("**/rest/v1/loads?*", (route) => {
      if (route.request().method() === "PATCH" && failCompletion) {
        failCompletion = false;
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            message: "No se pudo completar en la prueba local",
          }),
        });
      }
      return route.fallback();
    });
    await page.locator("[data-review-clear]").click();
    await page
      .locator("#ux-save-feedback")
      .filter({ hasText: "No se pudo completar" })
      .waitFor();
    assert.equal(await page.locator("[data-review-clear]").isEnabled(), true);
    assert.equal(await page.locator("[data-review-save]").isEnabled(), true);
    assert.ok(rawLoads[0].next_review_at);
    await page.locator("[data-review-clear]").click();
    await state.filter({ hasText: "Sin seguimiento programado" }).waitFor();
    assert.equal(rawLoads[0].next_review_at, "");
    assert.equal(rawLoads[0].recordatorio_fecha, previousTransit);
    assert.equal(rawLoads[0].client_notify_pending, previousNotify);
    assert.equal(await page.locator("[data-review-clear]").count(), 0);
    await page.locator("#next-review-at").fill("2026-10-09T12:00");
    await page.locator("#next-review-note").fill("Confirmar llegada mañana");
    await page.locator("[data-review-save]").click();
    await state.filter({ hasText: "Programado para" }).waitFor();
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    await page.locator("#view-toggle-btn").click();
    await page
      .locator(
        '#table-body [data-load="VISUAL-001"] .t-trailer .trailer-full-value',
      )
      .click();
    await page
      .locator('#table-detail-body [data-workspace-load="VISUAL-001"]')
      .click();
    await state.filter({ hasText: "Programado para" }).waitFor();
    assert.equal(
      await page.locator("#next-review-note").inputValue(),
      "Confirmar llegada mañana",
    );
    checks.push(
      "Seguimiento distingue vencido y programado, permite reintentar y completar sin alterar tránsito ni avisos al cliente",
    );
    await page
      .locator("#workspace-body .review-card")
      .screenshot({
        path: "/tmp/panel-original-comparison/seguimiento-estado.png",
      });
    const result = { checks, layouts };
    await writeFile(
      "/tmp/panel-original-comparison/calendario-tareas.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  } finally {
    if (page) await page.close();
    rawLoads.splice(0, rawLoads.length, ...snapshot);
  }
}
