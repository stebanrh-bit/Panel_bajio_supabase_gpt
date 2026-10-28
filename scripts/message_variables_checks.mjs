import assert from "node:assert/strict";

/** HTML entregable y transporte simulado: insertar un dato nunca guarda ni envía el mensaje. */
export async function runMessageVariablesReview({ newPage, profiles }) {
  const checks = [],
    comments = [
      {
        id: "c1",
        load: "VISUAL-001",
        body: "En tránsito. $& {{truck}}\nConfirmar arribo <sin formato HTML>.",
        created_at: "2026-10-08T17:59:00Z",
        created_by: profiles[0].id,
      },
      {
        id: "c2",
        load: "VISUAL-002",
        body: "Comentario de otra carga",
        created_at: "2026-10-08T17:59:30Z",
        created_by: profiles[0].id,
      },
    ];
  let templates = {},
    labels = {},
    readCount = 0,
    commentWrites = 0,
    release = null,
    hold = false,
    rejectRead = false;
  const page = await newPage(
    false,
    { width: 1440, height: 1050 },
    "internal",
    profiles[0],
    true,
  );
  const composer = () =>
    page.locator('#workspace-body [data-variable-target="comm-message"]');
  async function openCommunication() {
    await page.locator('[data-page="operation"]').first().click();
    await page
      .locator('#table-body tr[data-load="VISUAL-001"] [data-table-select]')
      .click();
    await page.locator("#table-detail-body [data-workspace-load]").click();
    await page.locator('[data-workspace-tab="comunicacion"]').click();
    await composer().waitFor();
  }
  try {
    await page.route("**/rest/v1/comments**", async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "POST") {
        commentWrites++;
        comments.push({
          ...route.request().postDataJSON(),
          id: "c3",
          created_at: "2026-10-08T18:00:00Z",
          created_by: profiles[0].id,
        });
        return route.fulfill({ contentType: "application/json", body: "null" });
      }
      const load = url.searchParams.get("load")?.slice(3);
      let items = comments
        .filter((item) => item.load === load)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (url.searchParams.get("limit") === "1") {
        readCount++;
        if (rejectRead) {
          rejectRead = false;
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              message: "No se pudo consultar el comentario",
            }),
          });
        }
        assert.match(url.searchParams.get("order"), /created_at.desc/);
        items = items.slice(0, 1);
        if (hold) {
          hold = false;
          await new Promise((resolve) => {
            release = resolve;
          });
        }
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(items),
      });
    });
    await page.route("**/rest/v1/original_preferences?**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ user_id: profiles[0].id, templates, labels }]),
      }),
    );
    await page.route(
      "**/rest/v1/rpc/ops_save_original_templates",
      async (route) => {
        const input = route.request().postDataJSON();
        templates = input.p_templates;
        labels = input.p_labels;
        await route.fulfill({ contentType: "application/json", body: "{}" });
      },
    );
    await page.reload();
    await openCommunication();
    const total = await page.evaluate(
      () => window.panelMessageVariables.messageVariables.length,
    );
    assert.equal(await composer().locator("option").count(), total + 1);
    assert.equal(await composer().locator("optgroup").count(), 7);
    const message = page.locator("#comm-message");
    await message.fill("Estatus: ");
    await composer().selectOption("last_comment");
    await page.waitForFunction(
      (expected) =>
        document.querySelector("#comm-message")?.value ===
        "Estatus: " + expected,
      comments[0].body,
    );
    assert.equal(commentWrites, 0);
    assert.ok(
      !(await message.inputValue()).includes("Comentario de otra carga"),
    );
    checks.push(
      "Catálogo agrupado en siete categorías; Último comentario inserta solo el de la carga elegida y respeta saltos, símbolos y marcadores literales",
    );

    hold = true;
    await message.fill("Borrador ");
    await composer().selectOption("last_comment");
    for (let attempt = 0; !release && attempt < 100; attempt++)
      await page.waitForTimeout(20);
    assert.equal(typeof release, "function");
    await message.fill("Texto editado mientras se consulta");
    release();
    release = null;
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-variable-target="comm-message"]')
          .disabled,
    );
    assert.equal(
      await message.inputValue(),
      "Texto editado mientras se consulta",
    );
    checks.push(
      "Una respuesta atrasada no sobrescribe el mensaje que el usuario está editando",
    );

    await page.locator('[data-ws-comments="VISUAL-001"]').click();
    const inline = page.locator("#ws-inline-comment-text");
    await inline.fill("Revisar ");
    await page
      .locator('[data-variable-target="ws-inline-comment-text"]')
      .selectOption("trailer");
    assert.equal(await inline.inputValue(), "Revisar R-210");
    await inline.fill("Confirmación nueva de taller");
    await page.locator("[data-inline-comment-save]").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#ws-inline-comment") ||
        document.querySelector("#ws-inline-comment").hidden,
    );
    assert.equal(commentWrites, 1);
    await message.fill("");
    await composer().selectOption("last_comment");
    await page.waitForFunction(
      () =>
        document.querySelector("#comm-message")?.value ===
        "Confirmación nueva de taller",
    );
    checks.push(
      "El comentario confirmado desde el expediente queda disponible como Último comentario sin recargar el panel",
    );

    await page.locator("[data-template-quick-add]").click();
    const row = page.locator("#template-row-new");
    await row.locator("#new-template-name").fill("Control");
    await row.locator("textarea").fill("Actualización: ");
    const beforeTemplate = readCount;
    await row.locator("select").selectOption("last_comment");
    assert.equal(
      await row.locator("textarea").inputValue(),
      "Actualización: {{last_comment}}",
    );
    assert.equal(readCount, beforeTemplate);
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/rpc/ops_save_original_templates") &&
        response.ok(),
    );
    await row.locator("[data-template-add]").click();
    await saved;
    await page.waitForFunction(() =>
      document.querySelector('[data-comm-type="control"]'),
    );
    assert.equal(templates.control, "Actualización: {{last_comment}}");
    await page.locator('[data-comm-type="control"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#comm-message")?.value ===
        "Actualización: Confirmación nueva de taller",
    );
    await message.fill("Borrador que debe conservarse");
    rejectRead = true;
    await page.locator('[data-comm-type="control"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector("#comm-variable-feedback")
        ?.textContent.includes("Conservamos tu texto"),
    );
    assert.equal(await message.inputValue(), "Borrador que debe conservarse");
    assert.equal(await page.locator("[data-comm-copy]").isEnabled(), true);
    await page.locator('[data-comm-type="control"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#comm-message")?.value ===
        "Actualización: Confirmación nueva de taller",
    );
    checks.push(
      "Un error de consulta al generar conserva el borrador, libera los controles y permite reintentar sin inventar un comentario vacío",
    );
    await page.reload();
    await openCommunication();
    await page.locator('[data-comm-type="control"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#comm-message")?.value ===
        "Actualización: Confirmación nueva de taller",
    );
    checks.push(
      "La plantilla guarda el marcador, persiste al recargar y consulta el comentario actual al generar la actualización",
    );

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1050 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }

    await page.locator("#workspace-close").click();
    if (
      await page.locator("#table-detail-dialog").evaluate((node) => node.open)
    )
      await page.locator("#table-detail-close").click();
    await page.locator("#view-toggle-btn").evaluate((node) => node.click());
    await page.locator('[data-comments-load="VISUAL-001"]').first().click();
    const modal = page.locator("#comments-backdrop");
    await modal
      .locator('[data-variable-target="comments-textarea"]')
      .selectOption("last_comment");
    await page.waitForFunction(
      () =>
        document.querySelector("#comments-textarea")?.value ===
        "Confirmación nueva de taller",
    );
    assert.equal(commentWrites, 1, "Insertar no debe guardar el comentario");
    await page.locator("#comments-textarea").fill("");
    hold = true;
    const oldSelect = await modal
      .locator('[data-variable-target="comments-textarea"]')
      .elementHandle();
    await modal
      .locator('[data-variable-target="comments-textarea"]')
      .selectOption("last_comment");
    for (let attempt = 0; !release && attempt < 100; attempt++)
      await page.waitForTimeout(20);
    assert.equal(typeof release, "function");
    await page.locator("#comments-close").click();
    await page.locator('[data-comments-load="VISUAL-002"]').first().click();
    release();
    release = null;
    await page.waitForFunction((select) => !select.disabled, oldSelect);
    assert.equal(await page.locator("#comments-textarea").inputValue(), "");
    await modal
      .locator('[data-variable-target="comments-textarea"]')
      .selectOption("last_comment");
    await page.waitForFunction(
      () =>
        document.querySelector("#comments-textarea")?.value ===
        "Comentario de otra carga",
    );
    checks.push(
      "Cambiar de carga durante una consulta no inserta el comentario anterior en el nuevo expediente",
    );
    await page.locator("#comments-close").click();
    checks.push(
      "El modal de comentarios también inserta valores reales y espera que el usuario decida guardarlos",
    );
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    return {
      version: "2026.10.28.2",
      variableCount: total,
      checks,
      productionWrites: 0,
      realMessagesSent: 0,
    };
  } finally {
    release?.();
    await page.close();
  }
}
