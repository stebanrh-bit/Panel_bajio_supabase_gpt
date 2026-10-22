import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { clickOperationOption } from "./simple_sheet_checks.mjs";

/** Colores y recordatorios programados en el HTML real, usando solo transporte local. */
export async function runColorsTasksReview({
  newPage,
  rawLoads,
  taskRow,
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
  try {
    await page.locator('[data-page="operation"]').click();
    const row = page.locator('#table-body tr[data-load="VISUAL-001"]');
    await row.locator("[data-table-select]").click();
    const backgrounds = [];
    for (const color of [
      "critical",
      "warn",
      "good",
      "info",
      "purple",
      "teal",
      "pink",
      "brown",
      "slate",
    ]) {
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes("/loads?") &&
          response.request().method() === "PATCH",
      );
      await page.locator(`#table-detail-body [data-color="${color}"]`).click();
      await saved;
      const background = await row.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );
      await page.keyboard.press("Escape");
      await row.hover();
      assert.equal(
        await row.evaluate((node) => getComputedStyle(node).backgroundColor),
        background,
      );
      assert.notEqual(background, "rgb(255, 255, 255)");
      assert.equal(rawLoads[0].color, color);
      backgrounds.push(background);
      if (color === "pink")
        await page
          .locator("#page-operation")
          .screenshot({
            path: "/tmp/panel-original-comparison/carga-color-manual.png",
          });
      await row.locator("[data-table-select]").click();
    }
    assert.equal(new Set(backgrounds).size, 9);
    await page.keyboard.press("Escape");
    await page.reload();
    await page.locator('[data-page="operation"]').click();
    assert.equal(
      await row.evaluate((node) => getComputedStyle(node).backgroundColor),
      backgrounds.at(-1),
    );
    await clickOperationOption(page, "#view-toggle-btn");
    const card = page.locator('#cards-view .card[data-load="VISUAL-001"]');
    assert.equal(
      await card.evaluate((node) => getComputedStyle(node).backgroundColor),
      backgrounds.at(-1),
    );
    checks.push(
      "Nueve colores tiñen toda la fila incluso seleccionada y al pasar el ratón; el color se guarda, persiste al recargar y coincide en tarjetas",
    );
    await clickOperationOption(page, "#view-toggle-btn");
    await row.locator("[data-table-select]").click();
    const cleared = page.waitForResponse(
      (response) =>
        response.url().includes("/loads?") &&
        response.request().method() === "PATCH",
    );
    await page.locator('#table-detail-body [data-color=""]').click();
    await cleared;
    assert.equal(rawLoads[0].color, "");
    await page.keyboard.press("Escape");

    const tasks = [],
      taskId = "77777777-7777-4777-8777-777777777777";
    await page.route("**/rest/v1/shift_tasks**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(tasks.filter((task) => task.state === "open")),
      }),
    );
    await page.route("**/rest/v1/rpc/ops_save_tasks", async (route) => {
      const request = route.request().postDataJSON(),
        values = request.p_values;
      const record = {
        ...taskRow,
        ...values,
        id: taskId,
        load: values.load || values.loads?.[0] || null,
        state: "open",
        created_by: profiles[0].id,
        updated_at: "2026-10-08T18:00:01Z",
      };
      tasks.splice(0, tasks.length, record);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([record]),
      });
    });
    // Un aviso viejo del servidor debe desaparecer inmediatamente al reprogramar su tarea.
    await page.route("**/rest/v1/rpc/ops_visible_alerts", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          tasks.length
            ? [
                {
                  id: "stale-task-alert",
                  task_id: taskId,
                  kind: "task_due",
                  load: null,
                  message: "Aviso de tarea del servidor",
                  created_at: "2026-10-08T18:00:00Z",
                },
              ]
            : [],
        ),
      }),
    );
    await page.reload();
    await page.locator('[data-page-scroll="home:group-bitacora"]').click();
    await page.locator("#bitacora-add-btn").click();
    await page
      .locator("#bitacora-nota")
      .fill("Recordatorio personal programado para mañana");
    await page.locator("#bitacora-asignado").selectOption("Esteban");
    await page.locator("#bitacora-fecha-seguimiento").fill("2026-10-09T09:30");
    await page.locator("#bitacora-submit").click();
    await page.locator("#bitacora-backdrop.show").waitFor({ state: "hidden" });
    assert.equal(tasks[0].follow_up_at, "2026-10-09T15:30:00.000Z");
    const taskCard = page.locator(`[data-bitacora-id="${taskId}"]`);
    await taskCard.locator(".bitacora-followup").waitFor();
    assert.match(
      await taskCard.locator(".bitacora-followup").innerText(),
      /9 oct 2026.*09:30/,
    );
    const taskNotices = () =>
      page.evaluate(
        (id) =>
          JSON.parse(
            localStorage.getItem("bajio_avisos_Esteban") || '{"lista":[]}',
          ).lista.filter((notice) => notice.taskId === id),
        taskId,
      );
    async function refresh() {
      // Al adelantar el día, representar que ya se leyó el resumen de inicio de turno.
      await page.evaluate(() =>
        localStorage.setItem(
          "bajio_inicio_turno_Esteban",
          new Date().toDateString(),
        ),
      );
      if (await page.locator("#confirmar-backdrop.show").isVisible())
        await page.locator("#confirmar-cancelar").click();
      await page.locator("#header-refresh-btn").click();
      await page.waitForTimeout(650); // El detector agrupa eventos del panel durante 400 ms.
    }
    await refresh();
    assert.deepEqual(await taskNotices(), []);
    await page.clock.setFixedTime(new Date("2026-10-09T15:29:59Z"));
    await refresh();
    assert.deepEqual(await taskNotices(), []);
    await page.clock.setFixedTime(new Date("2026-10-09T15:30:00Z"));
    await refresh();
    await page.waitForFunction(
      (id) =>
        JSON.parse(
          localStorage.getItem("bajio_avisos_Esteban") || '{"lista":[]}',
        ).lista.some((notice) => notice.taskId === id),
      taskId,
    );
    assert.equal((await taskNotices()).length, 1);
    checks.push(
      "Una tarea asignada a la propia cuenta muestra fecha y hora; no avisa mañana ni un segundo antes, y aparece una sola vez al llegar el horario, aunque exista un aviso viejo del servidor",
    );
    await page.locator('[data-page-scroll="home:group-bitacora"]').click();
    await taskCard.locator("[data-edit-bitacora]").click();
    assert.equal(
      await page.locator("#bitacora-fecha-seguimiento").inputValue(),
      "2026-10-09T09:30",
    );
    await page.locator("#bitacora-fecha-seguimiento").fill("2026-10-10T10:15");
    await page
      .locator("#bitacora-backdrop")
      .screenshot({
        path: "/tmp/panel-original-comparison/tarea-fecha-hora.png",
      });
    await page.locator("#bitacora-submit").click();
    await page.locator("#bitacora-backdrop.show").waitFor({ state: "hidden" });
    await refresh();
    assert.deepEqual(await taskNotices(), []);
    assert.equal(tasks[0].follow_up_at, "2026-10-10T16:15:00.000Z");
    await page.reload();
    await page.locator('[data-page-scroll="home:group-bitacora"]').click();
    assert.match(
      await taskCard.locator(".bitacora-followup").innerText(),
      /10 oct 2026.*10:15/,
    );
    await refresh();
    assert.deepEqual(await taskNotices(), []);
    checks.push(
      "Editar conserva la hora; reprogramar retira el aviso anterior y persiste al recargar",
    );
    await taskCard.screenshot({
      path: "/tmp/panel-original-comparison/tarea-hora-visible.png",
    });
    const result = {
      checks,
      colors: backgrounds,
      savedFollowUp: tasks[0].follow_up_at,
    };
    await writeFile(
      "/tmp/panel-original-comparison/colores-tareas.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  } finally {
    await page.close();
    rawLoads.splice(0, rawLoads.length, ...snapshot);
  }
}
