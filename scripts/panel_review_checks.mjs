/** Recorrido de lectura y regresiones de la revisión general. Datos locales, sin escrituras remotas. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

export async function runPanelReview({ newPage, rawLoads, taskRow, profiles }) {
  const checks = [],
    layouts = [],
    errors = [];
  const page = await newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const section of [
        "home",
        "operation",
        "calendario",
        "indicadores",
        "apartados",
        "radar",
        "historico",
      ]) {
        await page
          .locator(
            section === "historico"
              ? "#sidebar-historico-btn"
              : `[data-page="${section}"]`,
          )
          .first()
          .evaluate((node) => node.click());
        const view = page.locator(`#page-${section}`);
        assert.equal(await view.isVisible(), true);
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          content: document.documentElement.scrollWidth,
        }));
        layouts.push({ section, ...layout });
        assert.ok(
          layout.content <= width,
          `${section} desborda la página a ${width}px`,
        );
      }
    }
    checks.push(
      "Siete secciones principales abren y caben en cuatro anchos de 320 a 1440 px",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator('[data-page="home"]')
      .first()
      .evaluate((node) => node.click());
    const search = page.locator("#home-search");
    await search.fill("VISUAL");
    const results = page.locator("#home-search-resultados .search-item");
    await results.first().waitFor();
    const total = await results.count();
    assert.ok(total >= 2);
    await search.press("ArrowUp");
    assert.equal(
      await search.getAttribute("aria-activedescendant"),
      "global-search-result-" + (total - 1),
    );
    assert.equal(await results.last().getAttribute("aria-selected"), "true");
    await search.press("Escape");
    await search.press("Enter");
    assert.equal(await page.locator("#workspace-backdrop.show").count(), 0);
    assert.equal(await search.getAttribute("aria-expanded"), "false");
    await search.fill("VISUAL");
    await search.press("ArrowDown");
    await search.press("Enter");
    await page.locator("#workspace-backdrop.show").waitFor();
    await page.locator("#workspace-close").click();
    checks.push(
      "Búsqueda: selección accesible, flecha arriba, Escape y Enter sin abrir resultados ocultos",
    );

    await page
      .locator("#sidebar-historico-btn")
      .first()
      .evaluate((node) => node.click());
    await page.locator("#historico-desde").fill("2026-10-16");
    await page.locator("#historico-hasta").fill("2026-10-10");
    await page.locator("#historico-hasta").dispatchEvent("change");
    assert.equal(
      await page.locator("#historico-hasta").getAttribute("aria-invalid"),
      "true",
    );
    assert.match(
      await page.locator("#historico-body").innerText(),
      /Corrige las fechas/,
    );
    assert.equal(await page.locator("#historico-hasta-error").count(), 1);
    await page.locator("#historico-hasta").fill("2026-10-17");
    await page.locator("#historico-hasta").dispatchEvent("change");
    await page.waitForFunction(
      () =>
        !document
          .getElementById("historico-hasta")
          .hasAttribute("aria-invalid"),
    );
    checks.push(
      "Histórico: error claro para fechas invertidas y recuperación al corregir",
    );

    // Una consulta lenta de otro rango no reemplaza el resultado más reciente.
    let releaseHistory, startHistory;
    const historyStarted = new Promise((resolve) => {
      startHistory = resolve;
    });
    const historyHeld = new Promise((resolve) => {
      releaseHistory = resolve;
    });
    await page.route("**/rest/v1/shift_tasks**", async (route) => {
      const filters = new URL(route.request().url()).searchParams
        .getAll("created_at")
        .join(" ");
      const old = filters.includes("gte.2026-10-01");
      if (old) {
        startHistory();
        await historyHeld;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          { ...taskRow, note: old ? "Rango anterior" : "Rango actual" },
        ]),
      });
    });
    await page.locator("#historico-desde").evaluate((node) => {
      node.value = "2026-10-01";
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await historyStarted;
    await page.locator("#historico-desde").evaluate((node) => {
      node.value = "2026-10-02";
      node.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page
      .locator("#historico-body")
      .filter({ hasText: "Rango actual" })
      .waitFor();
    const oldHistory = page.waitForResponse(
      (response) =>
        response.url().includes("/shift_tasks?") &&
        new URL(response.url()).searchParams
          .getAll("created_at")
          .join(" ")
          .includes("gte.2026-10-01"),
    );
    releaseHistory();
    await oldHistory;
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.match(
      await page.locator("#historico-body").innerText(),
      /Rango actual/,
    );
    assert.doesNotMatch(
      await page.locator("#historico-body").innerText(),
      /Rango anterior/,
    );
    await page.unroute("**/rest/v1/shift_tasks**");
    checks.push(
      "Histórico: una consulta anterior que tarda más no reemplaza los filtros actuales",
    );

    let failHistory = true;
    await page.route("**/rest/v1/shift_tasks**", (route) => {
      if (failHistory)
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Consulta temporalmente no disponible",
          }),
        });
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([taskRow]),
      });
    });
    await page.locator("#historico-actualizar-btn").click();
    await page
      .locator("#historico-body")
      .filter({ hasText: "No se pudo cargar" })
      .waitFor();
    failHistory = false;
    await page.locator("#historico-actualizar-btn").click();
    await page
      .locator("#historico-body")
      .filter({ hasText: taskRow.note })
      .waitFor();
    await page.unroute("**/rest/v1/shift_tasks**");
    checks.push(
      "Histórico: un error muestra cómo reintentar y Actualizar recupera la lista sin borrar filtros",
    );

    // Dos avisos del mismo load tienen destinos diferentes: carga frente a tarea.
    await page.route("**/rest/v1/customer_assignments**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            customer: "ACME",
            customer_key: "acme",
            owner_id: profiles[0].id,
            updated_at: rawLoads[0].updated_at,
          },
        ]),
      }),
    );
    await page.route("**/rest/v1/rpc/ops_visible_alerts", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "review-load",
            kind: "load_review",
            load: "VISUAL-001",
            recipient: profiles[0].id,
            dedupe_key: `review:VISUAL-001:seguimiento_personal:${rawLoads[0].next_review_at}:${profiles[0].id}`,
            message: "Revisar esta carga",
            created_at: rawLoads[0].updated_at,
          },
          {
            id: "review-task",
            kind: "task_due",
            load: "VISUAL-001",
            task_id: taskRow.id,
            message: "Completar esta tarea",
            created_at: rawLoads[0].updated_at,
          },
        ]),
      }),
    );
    await page.route("**/rest/v1/shift_tasks**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          { ...taskRow, follow_up_at: "2026-10-08T16:00:00Z" },
        ]),
      }),
    );
    await page.reload();
    await page
      .locator('[data-aviso-id="server:review-task"]')
      .waitFor({ state: "attached" });
    await page.locator("#avisos-btn").click();
    await page.locator('[data-aviso-id="server:review-task"]').click();
    await page.locator("#bitacora-backdrop.show").waitFor();
    assert.equal(
      await page.locator("#bitacora-nota").inputValue(),
      taskRow.note,
    );
    await page.locator("#bitacora-close").click();
    await page.locator("#avisos-btn").click();
    assert.match(
      await page.locator('[data-aviso-id="server:review-load"]').innerText(),
      /Revisión pendiente/,
    );
    await page.locator('[data-aviso-id="server:review-load"]').click();
    await page.locator("#workspace-backdrop.show").waitFor();
    await page.locator("#workspace-close").click();
    await page.locator("#avisos-btn").click();
    await page.locator('[data-aviso-id^="bitseg:"]').first().click();
    await page.locator("#bitacora-backdrop.show").waitFor();
    assert.equal(
      await page.locator("#bitacora-nota").inputValue(),
      taskRow.note,
    );
    await page.locator("#bitacora-close").click();
    checks.push(
      "Campana: avisos locales y del servidor abren su tarea; revisión de carga abre el expediente",
    );

    // Fallar no deja bloqueado el botón; cerrar la sesión invalida aperturas pendientes.
    await page.evaluate(() => {
      window.__reviewOriginalOrganization =
        window.panelApi.methods.getOrganizacion;
      window.panelApi.methods.getOrganizacion = async () => {
        throw Error("Fallo local de prueba");
      };
    });
    const organize = page.locator(".organize-toolbar button").first();
    await organize.click();
    await page
      .locator(".organize-load-status")
      .filter({ hasText: "Vuelve a intentarlo" })
      .waitFor();
    assert.equal(await organize.isEnabled(), true);
    await page.evaluate(() => {
      window.panelApi.methods.getOrganizacion =
        window.__reviewOriginalOrganization;
    });
    await organize.click();
    await page.locator("dialog.organize-hub").waitFor();
    await page.locator("dialog.organize-hub [value=close]").click();
    checks.push("Organizar turno: espera, fallo visible y reintento correcto");
    await organize.click();
    await page.locator("dialog.organize-hub [data-id=schedules]").click();
    await page
      .locator("dialog.organize-hub [data-org-action=schedule]")
      .click();
    const schedule = page.locator("dialog").last();
    await schedule.locator("[type=submit]").click();
    const invalidFields = await schedule.locator("[aria-invalid=true]").count();
    assert.ok(invalidFields >= 2);
    assert.equal(
      await schedule.locator(".field-validation-error").count(),
      invalidFields,
    );
    await schedule.locator("[name=note]").fill("Borrador sin guardar");
    assert.equal(
      await schedule.locator("[name=note]").getAttribute("aria-invalid"),
      null,
    );
    await schedule
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await page.locator("dialog.organize-hub [value=close]").click();
    checks.push(
      "Formularios: campos obligatorios con un solo mensaje y limpieza al corregir, sin guardar el borrador",
    );
    await page.evaluate(async () => {
      window.__reviewOrganizationData =
        await window.panelApi.methods.getOrganizacion();
      window.panelApi.methods.getOrganizacion = () =>
        new Promise((resolve) => {
          window.__reviewOrganizationResolve = resolve;
        });
    });
    await organize.click();
    assert.equal(await organize.isDisabled(), true);
    await page.locator("#session-logout-btn").evaluate((node) => node.click());
    await page.locator("#identity-backdrop.show").waitFor();
    await page.evaluate(async () => {
      window.__reviewOrganizationResolve(window.__reviewOrganizationData);
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(await page.locator("dialog.organize-hub").count(), 0);
    checks.push(
      "Cerrar sesión impide que una lectura anterior reabra Organizar turno",
    );
  } finally {
    await page.close();
  }

  const client = await newPage(false, { width: 1280, height: 900 }, "client");
  client.on("pageerror", (error) => errors.push(error.message));
  let release;
  try {
    let started;
    const requested = new Promise((resolve) => {
      started = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await client.route("**/rest/v1/rpc/ops_portal_detail", async (route) => {
      const load = route.request().postDataJSON().p_load;
      if (load === "VISUAL-001") {
        started();
        await held;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...rawLoads.find((row) => row.load === load),
          incidents: [],
          messages: [],
        }),
      });
    });
    await client.locator('#shipments-tbody [data-load="VISUAL-001"]').click();
    await requested;
    await client.locator("#back-btn").click();
    await client.locator('#shipments-tbody [data-load="VISUAL-002"]').click();
    await client.waitForFunction(
      () =>
        document.getElementById("detail-screen").getAttribute("aria-busy") ===
        "false",
    );
    assert.match(await client.locator("#detail-po").innerText(), /VISUAL-002/);
    const late = client.waitForResponse(
      (response) =>
        response.url().endsWith("/ops_portal_detail") &&
        response.request().postDataJSON().p_load === "VISUAL-001",
    );
    release();
    await late;
    await client.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.match(await client.locator("#detail-po").innerText(), /VISUAL-002/);
    checks.push(
      "Portal Cliente: una respuesta lenta no reemplaza el embarque abierto después",
    );
  } finally {
    release?.();
    await client.close();
  }

  const manager = await newPage(false, { width: 390, height: 844 }, "manager");
  manager.on("pageerror", (error) => errors.push(error.message));
  try {
    await manager.locator("#search-input").fill("NO-EXISTE");
    assert.equal(await manager.locator("#shipments-empty").isVisible(), true);
    await manager.locator("#search-input").fill("VISUAL");
    assert.ok((await manager.locator("#shipments-tbody tr").count()) > 0);
    checks.push(
      "Gerencia: búsqueda y recuperación de un filtro sin coincidencias",
    );
  } finally {
    await manager.close();
  }
  assert.deepEqual(errors, []);
  const result = { checks, layouts, errors };
  await writeFile(
    "/tmp/panel-original-comparison/revision-general.json",
    JSON.stringify(result, null, 2),
  );
  return result;
}
