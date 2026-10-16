/** Integración real: navegador + SDK Supabase + PostgreSQL efímero. Sin escrituras remotas. */
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createTestDatabase } from "../web/test/helpers/database.js";
const { chromium } = await import(
  pathToFileURL(
    (process.env.PANEL_BROWSER_TOOLS || "/tmp/panel-browser-tools") +
      "/node_modules/playwright-core/index.mjs",
  )
);
const readerFiles = process.argv.includes("--reader-files");
const files = (
  await readdir(new URL("../supabase/migrations/", import.meta.url))
)
  .filter((n) => /^\d.*sql$/.test(n))
  .sort();
const { db, asUser, people, rpc, row } = await createTestDatabase(files, {
  Esteban: "admin",
  Ana: "csr",
  Abraham: "admin",
});
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [],
  checks = [];
const quote = (x) => {
  if (!/^[a-z_]+$/.test(x)) throw Error("Identificador no válido");
  return '"' + x + '"';
};
try {
  await asUser("Esteban");
  await db.exec(
    "insert into loads(load,customer,status,trailer) values('TEST-A','ACME','Cargando','T0132'),('TEST-B','OTRO','Cargando','S1078')",
  );
  await rpc("ops_assign_customer", ["ACME", people.Esteban, null]);
  const context = await browser.newContext({
    timezoneId: "America/Mexico_City",
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ contentType: "text/css", body: "" }),
  );
  await context.route("https://fonts.gstatic.com/**", (r) => r.abort());
  await context.route(
    "https://pwqibuunekrzfcztcfju.supabase.co/**",
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        name = url.pathname.split("/").at(-1);
      let result;
      try {
        if (name === "user")
          result = { id: people.Esteban, email: "local@example.test" };
        else if (name === "panel-accounts") {
          const action = req.postDataJSON().action;
          if (action === "directory")
            result = {
              ok: true,
              items: [
                { nombre: "Esteban", rol: "Supervisor" },
                { nombre: "Ana", rol: "CSR" },
              ],
            };
          else if (action === "verifyAdmin") result = { ok: true };
          else if (["clients", "lockouts"].includes(action))
            result = { ok: true, items: [] };
          else throw Error("Cuenta de prueba: " + action);
        } else if (url.pathname.includes("/rpc/")) {
          const body = req.postDataJSON() || {},
            args = Object.entries(body);
          const proc = (
            await db.query(
              "select p.proretset,t.typtype,t.typname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type t on t.oid=p.prorettype where n.nspname='public' and p.proname=$1",
              [name],
            )
          ).rows[0];
          if (!proc) throw Error("Función no encontrada " + name);
          const data = (
            await db.query(
              "select * from public." +
                quote(name) +
                "(" +
                args.map(([k], i) => quote(k) + "=> $" + (i + 1)).join(",") +
                ")",
              args.map(([, v]) => v),
            )
          ).rows;
          const plain = proc.typtype === "c" || proc.typname === "record";
          result = proc.proretset
            ? data.map((r) => (plain ? r : Object.values(r)[0]))
            : plain
              ? data[0]
              : data[0]
                ? Object.values(data[0])[0]
                : null;
        } else {
          const columns = url.searchParams.get("select") || "*";
          if (!/^[a-z_,*]+$/.test(columns)) throw Error("Columnas no válidas");
          const values = [],
            where = [];
          for (const [key, value] of url.searchParams)
            if (!["select", "order", "limit", "offset", "or"].includes(key)) {
              if (value.startsWith("eq.")) {
                const equalValue = value.slice(3);
                values.push(
                  ["singleton", "active", "visible", "archived"].includes(
                    key,
                  ) && ["true", "false"].includes(equalValue)
                    ? equalValue === "true"
                    : equalValue,
                );
                where.push(quote(key) + "=$" + values.length);
              } else if (value === "is.null")
                where.push(quote(key) + " is null");
              else if (value.startsWith("in.(")) {
                const set = value
                  .slice(4, -1)
                  .split(",")
                  .map((v) => v.replaceAll('"', ""));
                values.push(set);
                where.push(quote(key) + "=any($" + values.length + ")");
              } else if (value.startsWith("gte.") || value.startsWith("lte.")) {
                values.push(value.slice(4));
                where.push(
                  quote(key) +
                    (value.startsWith("gte.") ? ">=" : "<=") +
                    "$" +
                    values.length,
                );
              } else
                throw Error(
                  "Filtro de prueba no implementado " + key + " " + value,
                );
            }
          const order = (url.searchParams.get("order") || "")
            .split(",")
            .filter(Boolean)
            .map((s) => {
              const [column, dir] = s.split(".");
              return quote(column) + (dir === "desc" ? " desc" : " asc");
            })
            .join(",");
          const sql =
            "select " +
            columns +
            " from public." +
            quote(name) +
            (where.length ? " where " + where.join(" and ") : "") +
            (order ? " order by " + order : "") +
            " limit " +
            Math.min(1000, Number(url.searchParams.get("limit") || 1000)) +
            " offset " +
            Number(url.searchParams.get("offset") || 0);
          const records = (await db.query(sql, values)).rows;
          result = (req.headers().accept || "").includes("object+json")
            ? records[0]
            : records;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(result ?? null),
        });
      } catch (error) {
        errors.push(name + ": " + error.message);
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: error.message }),
        });
      }
    },
  );
  if (readerFiles) {
    const legacy = await readFile(
      process.env.PANEL_SHEETJS_FILE || "/tmp/panel-audit-sheetjs.js",
    );
    await context.route(
      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
      (r) => r.fulfill({ contentType: "application/javascript", body: legacy }),
    );
  }
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ id }) => {
      const exp = Math.floor(Date.now() / 1000) + 86400,
        token =
          btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
          "." +
          btoa(JSON.stringify({ sub: id, role: "authenticated", exp })) +
          ".local";
      localStorage.setItem(
        "sb-pwqibuunekrzfcztcfju-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test",
          expires_at: exp,
          token_type: "bearer",
          user: { id, email: "test@example.test" },
        }),
      );
      localStorage.setItem("bajio_view", "cards");
      localStorage.setItem("bajio_identity_nombre", "Esteban");
      localStorage.setItem("bajio_identity_token", "supabase-session");
    },
    { id: people.Esteban },
  );
  await page.goto("http://127.0.0.1:5182/index-sitio.html");
  await page.locator("#identity-backdrop.show").waitFor({ state: "hidden" });
  await page
    .locator('[data-load="TEST-A"]')
    .first()
    .waitFor({ state: "attached" });
  async function saveDialog(form) {
    const parent = page.locator("dialog[data-organization-id]").first(),
      id = await parent.getAttribute("data-organization-id");
    await form.locator("[type=submit]").click();
    await page
      .locator('dialog[data-organization-id="' + id + '"]')
      .waitFor({ state: "detached" });
  }
  await page
    .locator(".organize-toolbar button")
    .filter({ hasText: "Organizar turno" })
    .click();
  const org = page.locator("dialog").filter({ hasText: "Organizar turno" });
  await org.waitFor();
  assert.equal(
    await org.locator("[data-org-action=tab][data-id=contacts]").count(),
    0,
  );
  assert.equal(
    await org.getByRole("heading", { name: "Tareas y checklist" }).count(),
    1,
  );
  assert.ok(
    await org
      .getByText("No hay tareas abiertas.", { exact: false })
      .isVisible(),
  );
  checks.push(
    "Pestaña sin tareas muestra explicación y botón; Contactos VG retirado",
  );
  await org.locator("[data-org-action=new-task]").click();
  await page.locator("#bitacora-backdrop.show").waitFor();
  await page
    .locator("#bitacora-nota")
    .fill("Tarea creada desde Organizar turno");
  await page.locator("#bitacora-asignado").selectOption("Esteban");
  await page.locator("#bitacora-submit").click();
  await page.locator("#bitacora-backdrop.show").waitFor({ state: "hidden" });
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from shift_tasks where note='Tarea creada desde Organizar turno'",
      )
    ).rows[0].n,
    1,
  );
  const task = (
    await rpc("ops_save_tasks", [
      {
        note: "Revisar documentos",
        assigned_to: people.Ana,
        loads: ["TEST-A"],
      },
      null,
      null,
    ])
  ).rows[0];
  await page
    .locator(".organize-toolbar button")
    .filter({ hasText: "Organizar turno" })
    .click();
  await page
    .locator("dialog .organize-row")
    .filter({ hasText: "Tarea creada desde Organizar turno" })
    .waitFor();
  checks.push("Nueva tarea abre el formulario y aparece guardada al regresar");
  // Navegación del nuevo centro de turno, con datos persistidos y distintos anchos.
  for (const width of [1533, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of ["schedules", "tasks"]) {
      await org.locator(`[data-org-action=tab][data-id=${id}]`).click();
      assert.equal(
        await org
          .locator(`[data-org-action=tab][data-id=${id}]`)
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await org.locator("[data-org-action=tab][aria-pressed=true]").count(),
        1,
      );
      assert.match(
        await org.locator("#organize-section-title").innerText(),
        id === "tasks" ? /Tareas y checklist/ : /Tareas recurrentes/,
      );
    }
    const geometry = await org.evaluate((node) => ({
      width: node.clientWidth,
      content: node.scrollWidth,
      screen: innerWidth,
      page: document.documentElement.scrollWidth,
    }));
    assert.ok(
      geometry.content <= geometry.width && geometry.page <= geometry.screen,
      `Organizar turno no debe desbordarse a ${width}px`,
    );
    if ([1533, 390].includes(width))
      await org.screenshot({
        path: `/tmp/panel-original-comparison/organizar-turno-nuevo-${width}.png`,
      });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push(
    "Organizar turno: navegación y contenido activos, sin desbordamiento en cinco anchos de 320 a 1533 px",
  );
  let current = page.locator("dialog").last();
  await current
    .locator(".organize-row")
    .filter({ hasText: "Revisar documentos" })
    .locator("[data-org-action=task]")
    .click();
  let form = page.locator("dialog").last();
  await form.locator("[name=new_template]").fill("Documentación");
  await form.locator("[name=steps]").fill("Validar DODA\nConfirmar entrega");
  await saveDialog(form);
  await page.locator("dialog [data-org-action=task]").first().waitFor();
  let stored = (
    await db.query("select * from task_checklist_items where task_id=$1", [
      task.id,
    ])
  ).rows;
  assert.equal(stored.length, 2);
  checks.push("Checklist creado y asociado a tarea real");
  await page
    .locator("dialog .organize-row")
    .filter({ hasText: "Revisar documentos" })
    .locator("[data-org-action=task]")
    .click();
  form = page.locator("dialog").last();
  await form.locator('input[name^="step:"]').first().waitFor();
  for (const check of await form.locator('input[name^="step:"]').all())
    await check.check();
  await saveDialog(form);
  await page.locator("dialog [data-org-action=task]").first().waitFor();
  stored = (
    await db.query("select * from task_checklist_items where task_id=$1", [
      task.id,
    ])
  ).rows;
  assert.ok(stored.every((s) => s.done));
  checks.push("Pasos completados y persistidos");
  current = page.locator("dialog").last();
  await current.locator("[data-org-action=tab][data-id=schedules]").click();
  await current.locator("[data-org-action=schedule]").click();
  form = page.locator("dialog").last();
  await form.locator("[name=note]").fill("Revisión diaria de clientes");
  await form.locator("[name=assigned_to]").selectOption(people.Ana);
  await form.locator("[name=local_time]").fill("09:00");
  await saveDialog(form);
  await page
    .locator("dialog .organize-row")
    .filter({ hasText: "Revisión diaria de clientes" })
    .waitFor();
  assert.equal(
    (await db.query("select count(*)::int as n from task_schedules")).rows[0].n,
    1,
  );
  checks.push("Tarea recurrente creada con horario de México");
  current = page.locator("dialog").last();
  await current.locator("[data-org-action=tab][data-id=rules]").click();
  await current.locator("[data-org-action=rules]").click();
  form = page.locator("dialog").last();
  await form.locator("[name=escalation_enabled]").selectOption("true");
  await form.locator("[name=supervisor_id]").selectOption(people.Abraham);
  await form.locator("[name=escalation_hours]").fill("24");
  await saveDialog(form);
  await page
    .locator("dialog section")
    .filter({ hasText: "activo a las 24 horas" })
    .waitFor();
  let config = (await db.query("select * from panel_settings")).rows[0];
  assert.equal(config.escalation_enabled, true);
  assert.equal(config.external_alerts_enabled, false);
  checks.push("Escalamiento configurable; envío externo permanece desactivado");
  await page.screenshot({
    path: "/tmp/panel-original-comparison/organizar-turno.png",
  });
  await page.locator("dialog").last().locator("[value=close]").click();
  await page.locator("[data-page=operation]").click();
  await page
    .locator("#page-operation .card[data-load]:visible")
    .first()
    .waitFor();
  assert.equal(
    await page.locator("#page-operation .card[data-load]:visible").count(),
    2,
  );
  await page.locator("#own-clients-toggle").click();
  assert.equal(
    await page.locator("#page-operation .card[data-load]:visible").count(),
    1,
  );
  assert.match(
    await page.locator("#page-operation .card[data-load]:visible").innerText(),
    /TEST-A/,
  );
  await page.locator("#active-filter-pills button").click();
  assert.equal(
    await page.locator("#page-operation .card[data-load]:visible").count(),
    2,
  );
  checks.push("Mis clientes filtra y limpiar recupera toda la operación");
  const attack = 'TEST-ATTACK"><img src=x onerror="window.pbInjected=true">';
  await db.query(
    "insert into loads(load,customer,status,trailer,color) values($1,$2,$3,$4,$5)",
    [
      attack,
      '<img src=x onerror="window.pbInjected=true">',
      '<svg onload="window.pbInjected=true">',
      'T0132"><img src=x>',
      'bad" onclick="window.pbInjected=true',
    ],
  );
  await page.locator("#header-refresh-btn").click();
  await page
    .locator("#page-operation .card[data-load]")
    .filter({ hasText: "TEST-ATTACK" })
    .waitFor();
  assert.equal(await page.locator("img[src=x],svg[onload]").count(), 0);
  assert.equal(await page.evaluate(() => Boolean(window.pbInjected)), false);
  checks.push(
    "Carga, cliente, estatus, trailer y color adversos permanecen como texto",
  );
  if (readerFiles) {
    // Simular el puente nativo de Apps Script: devuelve el mismo HTML estático de lector.html.
    // Las lecturas se ejecutan en Workers reales y los guardados en PostgreSQL efímero.
    const html = await readFile(
      new URL("../google-apps-script/lector.html", import.meta.url),
      "utf8",
    );
    assert.ok(html.startsWith("<!doctype html>"));
    await page.addInitScript(
      ({ html }) => {
        const chain = (success, failure) => ({
          withSuccessHandler: (callback) => chain(callback, failure),
          withFailureHandler: (callback) => chain(success, callback),
          panelFileReader() {
            window.readerFetches = (window.readerFetches || 0) + 1;
            Promise.resolve()
              .then(() => success(html))
              .catch(failure);
          },
        });
        window.google = { script: { run: chain() } };
      },
      { html },
    );
    const radarChecks = [];
    for (const extension of ["xlsx", "xls"]) {
      await page.reload();
      await page
        .locator("#identity-backdrop.show")
        .waitFor({ state: "hidden" });
      await page.locator("[data-page=radar]").click();
      const chooser = page.waitForEvent("filechooser");
      await page.locator("#radar-subir").click();
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/rpc/ops_original_radar") &&
          response.request().method() === "POST",
      );
      await (
        await chooser
      ).setFiles(
        new URL("../web/test/fixtures/radar." + extension, import.meta.url)
          .pathname,
      );
      assert.equal((await saved).status(), 200);
      await page
        .locator("#radar-fuente")
        .filter({ hasText: "radar." + extension })
        .waitFor();
      const record = (
        await db.query("select * from original_radar where singleton")
      ).rows[0];
      assert.equal(record.records.length, 2);
      assert.deepEqual(
        record.records.map((r) => r.load),
        ["RADAR-001", "RADAR-002"],
      );
      assert.equal(record.records[0].ciudad, "Laredo");
      assert.equal(record.records[0].regresos, "Broker");
      assert.equal(await page.evaluate(() => window.readerFetches), 1);
      await page.evaluate(() => localStorage.removeItem("bajio_radar_excel"));
      await page.reload();
      await page
        .locator("#identity-backdrop.show")
        .waitFor({ state: "hidden" });
      await page.locator("[data-page=radar]").click();
      await page
        .locator("#radar-fuente")
        .filter({ hasText: "radar." + extension })
        .waitFor();
      radarChecks.push(
        "Radar " +
          extension.toUpperCase() +
          ": lectura por puente Google, dos registros guardados y recuperados al recargar",
      );
    }
    await writeFile(
      new URL(
        "../docs/evidencia-radar-lector-2026-10-16.json",
        import.meta.url,
      ),
      JSON.stringify(
        {
          environment:
            "Chromium y Worker reales, puente Google simulado, PostgreSQL efímero. Sin acceso al Supabase del usuario.",
          checks: radarChecks,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      radarChecks.length +
        " archivos Excel de Radar verificados con el contenedor de Google.",
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("../docs/evidencia-organizacion-49.json", import.meta.url),
    JSON.stringify(
      {
        environment:
          "Chromium + SDK Supabase + PostgreSQL local; peticiones remotas interceptadas",
        checks,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    checks.length +
      " flujos nuevos comprobados con persistencia real y sin errores JS.",
  );
} catch (error) {
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  await db.close();
}
