import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

/** Integración del HTML real. PostgreSQL se verifica por separado; el transporte aquí es local. */
export async function runInternalInstructionsReview({
  newPage,
  rawLoads,
  profiles,
  customerAssignments,
  browser,
  base,
}) {
  const page = await newPage(
      false,
      { width: 1533, height: 1050 },
      "internal",
      profiles[0],
      true,
    ),
    checks = [],
    templates = [];
  const snapshot = structuredClone(rawLoads);
  let clock = 1;
  const stamp = () => `2026-10-08T18:01:${String(clock++).padStart(2, "0")}Z`;
  const recompute = (record) => {
    if (!record.instruction_plan) {
      record.instruction_context = { state: "no_template" };
      return;
    }
    const stage = record.status === "Descargando" ? "destination" : "origin";
    const step = record.instruction_plan.steps[stage] || {},
      key =
        record.instruction_template_id +
        ":" +
        stage +
        ":" +
        (record.instruction_exception || "");
    const missing = [];
    for (const name of step.requires || [])
      if (!["true", true].includes(record[name])) missing.push(name);
    if (step.condition && record.instruction_progress?.condition_key !== key)
      missing.push("condition");
    const state =
      record.instruction_progress?.completed_key === key
        ? "completed"
        : !step.action
          ? "undefined"
          : missing.length
            ? "waiting"
            : "ready";
    record.instruction_context = {
      state,
      stage,
      stage_label: stage === "origin" ? "Planta del cliente" : "Cliente final",
      flow: "export",
      mode: "current",
      template: record.instruction_plan.name,
      action: step.action || "",
      condition: step.condition || "",
      on_issue: step.on_issue || "",
      missing,
      stage_key: key,
      event_key: key + ":" + state,
      exception: record.instruction_exception || "",
      changed_at: record.updated_at,
    };
  };
  const apply = (record) => {
    const template = templates.find(
      (t) =>
        t.state === "approved" &&
        t.customer === record.customer &&
        t.origin_city === record.origin_city &&
        t.dest_city === record.dest_city,
    );
    if (template) {
      record.instruction_template_id = template.id;
      record.instruction_plan = {
        ...structuredClone(template),
        version: template.updated_at,
      };
      record.instruction_progress = {};
      record.updated_at = stamp();
    }
    recompute(record);
  };
  try {
    await page.route("**/rest/v1/route_instruction_templates**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(templates),
      }),
    );
    await page.route(
      "**/rest/v1/rpc/ops_save_route_instruction",
      async (route) => {
        const input = route.request().postDataJSON();
        const record = {
          ...input.p_values,
          id: input.p_id || `template-${templates.length + 1}`,
          created_by: profiles[0].id,
          updated_at: stamp(),
        };
        if (
          record.state === "approved" &&
          !Object.values(record.steps).some(
            (step) => step.action.trim().length >= 3,
          )
        )
          return route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              message: "Registra al menos una instrucción antes de aprobar",
            }),
          });
        let saved = record;
        if (record.state === "approved" && input.p_values.merge_approved) {
          const base = templates.find(
            (t) => t.id === input.p_values.merge_template_id,
          );
          assert.equal(input.p_values.merge_version, base.updated_at);
          const patch = Object.fromEntries(
            Object.entries(record.steps).filter(
              ([, step]) => step.action.trim().length >= 3,
            ),
          );
          Object.assign(base, {
            steps: { ...base.steps, ...patch },
            updated_at: record.updated_at,
          });
          const proposal = templates.find((t) => t.id === input.p_id);
          if (proposal) proposal.state = "merged";
          saved = base;
        } else {
          const old = templates.findIndex((t) => t.id === record.id);
          if (old < 0) templates.push(record);
          else templates[old] = record;
        }
        if (input.p_apply_missing && record.state === "approved")
          rawLoads.filter((r) => !r.instruction_plan).forEach(apply);
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(saved),
        });
      },
    );
    await page.route(
      "**/rest/v1/rpc/ops_load_instruction_action",
      async (route) => {
        const input = route.request().postDataJSON(),
          record = rawLoads.find((r) => r.load === input.p_load);
        assert.equal(input.p_version, record.updated_at);
        if (input.p_action === "condition")
          record.instruction_progress = {
            ...record.instruction_progress,
            condition_key: record.instruction_context.stage_key,
          };
        if (input.p_action === "complete")
          record.instruction_progress = {
            ...record.instruction_progress,
            completed_key: record.instruction_context.stage_key,
          };
        if (input.p_action === "exception")
          record.instruction_exception = input.p_values.note;
        if (input.p_action === "apply") apply(record);
        record.updated_at = stamp();
        recompute(record);
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(record),
        });
      },
    );
    await page.route("**/rest/v1/loads**", async (route) => {
      const url = new URL(route.request().url()),
        load = url.searchParams.get("load")?.slice(3),
        record = rawLoads.find((r) => r.load === load);
      if (route.request().method() === "PATCH") {
        Object.assign(record, route.request().postDataJSON(), {
          updated_at: stamp(),
        });
        recompute(record);
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify([record]),
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(record || rawLoads),
      });
    });
    await page.locator('[data-page="operation"]').click();
    assert.equal(
      await page
        .locator(
          '#who-toggle-btn:visible,[data-retired-client-feature]:visible',
        )
        .count(),
      0,
    );
    assert.equal(await page.locator("#table-body tr.t-row").count(), 3);
    checks.push(
      "La versión activa mantiene retirados los portales y otros perfiles; recupera mensajes manuales",
    );
    await page
      .getByRole("button", { name: "Organizar turno", exact: true })
      .click();
    await page
      .locator('[data-org-action="tab"][data-id="instructions"]')
      .click();
    await page.locator("[data-instruction-library]").click();
    await page.locator('[name="route_reference"]').selectOption("VISUAL-002");
    await page.locator("[data-new-instruction]").click();
    let editor = page.locator(".instruction-dialog").last();
    assert.equal(
      await editor.locator('[name="origin_city"]').inputValue(),
      "Bajío",
    );
    assert.equal(
      await editor.locator('[name="dest_city"]').inputValue(),
      "Dallas",
    );
    await editor
      .locator('[name="name"]')
      .fill("Procedimiento ACME Bajío Dallas");
    await editor.locator('[name="customer"]').fill("ACME");
    await editor.locator('[name="origin_city"]').fill("Bajío");
    await editor.locator('[name="dest_city"]').fill("Dallas");
    await editor.locator('[name="flow"]').selectOption("import");
    assert.equal(await editor.locator("[data-stage]").count(), 6);
    await editor.locator('[name="flow"]').selectOption("export");
    assert.equal(await editor.locator("[data-stage]").count(), 4);
    await editor.locator('[name="state"]').selectOption("approved");
    await editor
      .getByRole("button", { name: "Guardar instructivo", exact: true })
      .click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.instruction-dialog [role="alert"]')].some(
        (e) => e.textContent.includes("al menos una"),
      ),
    );
    assert.equal(
      await editor.locator('[name="name"]').inputValue(),
      "Procedimiento ACME Bajío Dallas",
    );
    await editor
      .locator('[name="origin.action"]')
      .fill("Confirmar documentos y autorización de salida con planta.");
    await editor
      .locator('[name="origin.condition"]')
      .fill("Planta confirma autorización de salida");
    await editor
      .locator('[name="origin.on_issue"]')
      .fill("Contactar al responsable de planta y registrar la incidencia.");
    await editor.locator('[name="origin.requires"][value="bol"]').check();
    await editor
      .getByRole("button", { name: "Guardar instructivo", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.querySelector(
        '#table-body tr[data-load="VISUAL-002"] [data-instruction-open]',
      ),
    );
    assert.equal(templates[0].state, "approved");
    assert.equal(rawLoads[1].instruction_context.state, "waiting");
    checks.push(
      "Editor con cuatro/seis etapas, error conserva formulario, publicación asigna la plantilla a las cargas actuales sin instructivo",
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const row = page.locator('#table-body tr[data-load="VISUAL-002"]');
    await row.locator("[data-table-select]").click();
    const detail = page.locator("#table-detail-body");
    assert.ok(
      (await detail.innerText()).includes(
        "Confirmar documentos y autorización",
      ),
    );
    await detail.locator(".instruction-card").screenshot({
      path: "/tmp/panel-original-comparison/instructivo-que-hacer.png",
    });
    assert.equal(
      await detail.locator('[data-instruction-action="complete"]').count(),
      0,
    );
    await detail.locator('[data-instruction-action="condition"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#table-detail-body .instruction-blockers")
          ?.textContent.includes("BOL") &&
        !document
          .querySelector("#table-detail-body .instruction-blockers")
          ?.textContent.includes("Condición"),
    );
    // El documento se confirma en Supabase simulado, y se sincroniza como un cambio real de carga.
    rawLoads[1].bol = "true";
    rawLoads[1].updated_at = stamp();
    recompute(rawLoads[1]);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("panel:instruction-refresh")),
    );
    await page.waitForFunction(() =>
      document.querySelector("#table-detail-body .state-ready"),
    );
    await detail.locator('[data-instruction-action="complete"]').click();
    await page.waitForFunction(() =>
      document.querySelector("#table-detail-body .state-completed"),
    );
    assert.equal(rawLoads[1].instruction_context.state, "completed");
    checks.push(
      "Requisitos y condición quedan visibles; confirmar condición no omite documentos; completar cambia la instrucción a Atendida",
    );
    await page.keyboard.press("Escape");
    rawLoads[1].status = "Descargando";
    rawLoads[1].updated_at = stamp();
    recompute(rawLoads[1]);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("panel:instruction-refresh")),
    );
    await page.waitForFunction(() =>
      document
        .querySelector('#table-body tr[data-load="VISUAL-002"]')
        ?.textContent.includes("Instrucción por definir"),
    );
    await row.locator("[data-table-select]").click();
    assert.ok((await detail.innerText()).includes("Instrucción por definir"));
    await detail.locator('[data-instruction-action="open"]').click();
    await page
      .locator(".instruction-dialog")
      .last()
      .locator('[data-instruction-action="propose"]')
      .click();
    editor = page.locator(".instruction-dialog").last();
    assert.equal(await editor.locator('[name="state"]').inputValue(), "draft");
    await editor
      .locator('[name="case_note"]')
      .fill("Caso resuelto: se confirmó recepción en planta.");
    await editor
      .getByRole("button", { name: "Guardar instructivo", exact: true })
      .click();
    assert.equal(templates.at(-1).state, "draft");
    checks.push(
      "Una etapa distinta abre el seguimiento siguiente; guardar un caso genera una propuesta sin publicarla automáticamente",
    );
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    if (
      await page.locator("#table-detail-dialog").evaluate((node) => node.open)
    )
      await page.locator("#table-detail-close").click();
    await page
      .getByRole("button", { name: "Organizar turno", exact: true })
      .click();
    await page
      .locator('[data-org-action="tab"][data-id="instructions"]')
      .click();
    await page.locator("[data-instruction-library]").click();
    const proposal = templates.at(-1),
      oldPlan = JSON.stringify(rawLoads[1].instruction_plan),
      originalAction = templates[0].steps.origin.action;
    await page.locator('[data-edit-instruction="' + proposal.id + '"]').click();
    editor = page.locator(".instruction-dialog").last();
    await editor.locator('[data-stage="destination"] > summary').click();
    await editor
      .locator('[name="destination.action"]')
      .fill("Confirmar entrega y recopilar POD");
    await editor.locator('[name="state"]').selectOption("approved");
    assert.equal(
      await editor.locator('[name="merge_approved"]').isChecked(),
      true,
    );
    await editor
      .getByRole("button", { name: "Guardar instructivo", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".instruction-library-list")
        ?.textContent.includes("Caso incorporado"),
    );
    assert.equal(templates[0].steps.origin.action, originalAction);
    assert.equal(
      templates[0].steps.destination.action,
      "Confirmar entrega y recopilar POD",
    );
    assert.equal(JSON.stringify(rawLoads[1].instruction_plan), oldPlan);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    checks.push(
      "Aprobar un caso incorpora solo las etapas revisadas a la plantilla publicada y conserva las versiones que ya usan las cargas",
    );
    await row.locator("[data-instruction-open]").click();
    assert.equal(await page.locator("#comments-backdrop.show").count(), 0);
    await page
      .locator(".instruction-dialog")
      .last()
      .locator('[data-instruction-action="apply"]')
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector('#table-body tr[data-load="VISUAL-002"]')
        ?.textContent.includes("Confirmar entrega y recopilar POD"),
    );
    assert.equal(rawLoads[1].instruction_context.state, "ready");
    checks.push(
      "La siguiente acción del listado abre el instructivo y actualizar desde plantilla adopta la versión nueva solo por decisión expresa",
    );
    await page.locator('[data-page="home"]').click();
    await page.waitForTimeout(600);
    assert.ok(
      !(await page.locator("#page-home").innerText()).includes(
        "Avisar al cliente",
      ),
    );
    for (const width of [320, 390, 768, 1533]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await page.setViewportSize({ width: 1533, height: 1050 });
    await page.locator('[data-page="operation"]').click();
    await page.locator("#page-operation").screenshot({
      path: "/tmp/panel-original-comparison/version-personal-instructivos.png",
    });
    const oldView = await browser.newPage();
    try {
      await oldView.goto(new URL("index-gerencia.html", base).href);
      assert.equal(await oldView.locator("input,form").count(), 0);
      assert.match(await oldView.locator("body").innerText(), /uso interno/);
    } finally {
      await oldView.close();
    }
    checks.push(
      "Inicio conserva solo atención interna; anchos 320–1533 sin desbordes; la entrega gerencial es estática y no consulta expedientes",
    );
    await writeFile(
      "/tmp/panel-original-comparison/version-personal-instructivos.json",
      JSON.stringify({ checks, productionWrites: 0 }, null, 2) + "\n",
    );
  } finally {
    rawLoads.splice(0, rawLoads.length, ...snapshot);
    await page.close();
  }
}
