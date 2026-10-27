import assert from "node:assert/strict";
/** Recorrido manual: Supabase simulado y todos los destinos Gmail bloqueados. */
export async function runGmailReview({ newPage, rawLoads, profiles }) {
  const page = await newPage(),
    records = [];
  let confirmations = 0,
    googleRequests = 0;
  const preview = {
    from: "operador@simulado.test",
    to: "cliente@simulado.test",
    cc: "supervisor@simulado.test",
    subject: "Re: VISUAL-001",
    body: "Entrega confirmada. Gracias.",
  };
  await page
    .context()
    .route(
      /https:\/\/(?:mail\.google\.com|gmail\.googleapis\.com|accounts\.google\.com|oauth2\.googleapis\.com)\//,
      (route) => {
        googleRequests++;
        return route.abort();
      },
    );
  await page.route("**/functions/v1/panel-gmail", () => {
    throw Error("El modo manual no debe llamar a Edge.");
  });
  await page.route("**/rest/v1/loads?**", async (route) => {
    const request = route.request(),
      load = new URL(request.url()).searchParams.get("load")?.slice(3);
    if (request.method() !== "GET" || !load) return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(rawLoads.filter((row) => row.load === load)),
    });
  });
  await page.route("**/rest/v1/communications?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(records),
    }),
  );
  await page.route("**/rest/v1/rpc/ops_record_manual_notice", async (route) => {
    const input = route.request().postDataJSON(),
      row = rawLoads.find((r) => r.load === input.p_load);
    assert.equal(input.p_channel, "Correo");
    assert.equal(input.p_type, "Gmail manual");
    assert.ok(input.p_message.includes(preview.from));
    assert.ok(input.p_message.includes(preview.body));
    confirmations++;
    const stamp = "2026-10-08T18:01:00Z";
    records.push({
      id: "manual-1",
      load: input.p_load,
      actor: profiles[0].id,
      channel: "Correo",
      notice_type: "Gmail manual",
      manual_message: input.p_message,
      created_at: stamp,
    });
    Object.assign(row, {
      updated_at: stamp,
      client_notified_at: stamp,
      client_notify_pending: "false",
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([row]),
    });
  });
  await page.locator('[data-page="operation"]').first().click();
  await page
    .locator('[data-workspace-load="VISUAL-001"]')
    .first()
    .evaluate((button) => button.click());
  await page.locator('[data-workspace-tab="comunicacion"]').click();
  await page.locator("[data-gmail-link]").click();
  const link = "https://mail.google.com/mail/u/0/#all/FMfcSimulado";
  await page.locator('.personal-dialog [name="url"]').fill(link);
  await page.locator('.personal-dialog button[type="submit"]').click();
  await page.locator("[data-gmail-compose]").click();
  for (const [name, value] of Object.entries(preview))
    await page.locator(`.personal-dialog [name="${name}"]`).fill(value);
  await page.locator('.personal-dialog button[type="submit"]').click();
  await page.locator('.personal-dialog [name="confirm"]').waitFor();
  const text = await page.locator(".personal-dialog").innerText();
  for (const value of Object.values(preview)) assert.ok(text.includes(value));
  assert.equal(confirmations, 0);
  assert.equal(
    await page.locator(".personal-dialog a").getAttribute("href"),
    link,
  );
  await page.evaluate(() => {
    window.__gmailCopied = "";
    navigator.clipboard.writeText = async (text) => {
      window.__gmailCopied = text;
    };
  });
  await page.locator("[data-gmail-copy]").click();
  assert.equal(await page.evaluate(() => window.__gmailCopied), preview.body);
  assert.equal(confirmations, 0);
  await page.locator('.personal-dialog [name="confirm"]').check();
  await page.locator('.personal-dialog button[type="submit"]').dblclick();
  await page
    .locator(".gmail-record")
    .filter({ hasText: "Envío confirmado manualmente por el usuario" })
    .waitFor();
  assert.equal(confirmations, 1);
  const repeated = await page.evaluate(
    async (values) =>
      window.panelApi.methods.gmailCarga("prepare", {
        load: "VISUAL-001",
        ...values,
      }),
    preview,
  );
  assert.equal(repeated.item.state, "confirmed");
  assert.equal(confirmations, 1);
  assert.equal(await page.locator("[data-gmail-connect]").count(), 0);
  assert.equal(await page.locator("#comm-message").isVisible(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(googleRequests, 0);
  await page.close();
  return {
    version: "2026.10.27.4",
    environment: "Chromium; Supabase simulado, destinos Google bloqueados",
    checks: [
      "Liga moderna de Gmail sin OAuth",
      "Remitente, Para, CC y texto revisables",
      "Copiar y preparar no registran envío",
      "Confirmación manual explícita",
      "Registro único en historial existente",
      "WhatsApp manual conservado",
      "Vista móvil sin desbordamiento",
    ],
    realEmailsSent: 0,
    googleRequests,
  };
}
