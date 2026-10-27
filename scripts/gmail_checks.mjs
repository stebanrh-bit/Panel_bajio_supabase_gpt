import assert from "node:assert/strict";
/** Recorrido del HTML empaquetado; todo acceso Gmail se intercepta antes de abrir el expediente. */
export async function runGmailReview({ newPage }) {
  const page = await newPage();
  let state = "prepared",
    sends = 0,
    linked = false;
  const preview = {
    from: "operador@simulado.test",
    to: ["cliente@simulado.test"],
    cc: ["supervisor@simulado.test"],
    subject: "Re: VISUAL-001",
    body: "Entrega confirmada. Gracias.",
  };
  const item = () => ({
    id: "simulado",
    state,
    preview,
    created_at: "2026-10-27T18:00:00Z",
    sent_at: state === "sent" ? "2026-10-27T18:01:00Z" : null,
  });
  await page.route("**/functions/v1/panel-gmail", async (route) => {
    const input = route.request().postDataJSON();
    let result;
    if (input.action === "status")
      result = {
        email: preview.from,
        thread: linked
          ? { url: "https://mail.google.com/mail/u/0/#all/abc123" }
          : null,
        items: linked ? [item()] : [],
      };
    else if (input.action === "link") {
      linked = true;
      result = { ok: true };
    } else if (input.action === "prepare") {
      assert.equal(input.to, preview.to[0]);
      assert.equal(input.cc, preview.cc[0]);
      assert.equal(input.body, preview.body);
      result = { item: item() };
    } else if (input.action === "send") {
      assert.equal(input.confirm, true);
      assert.equal(state, "prepared");
      sends++;
      state = "sent";
      result = { item: item() };
    } else throw Error("Acción inesperada en simulación: " + input.action);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.locator('[data-page="operation"]').first().click();
  await page.evaluate(() =>
    document.querySelector('[data-home-open="VISUAL-001"]')?.click(),
  );
  if (
    !(await page
      .locator("#workspace-backdrop")
      .evaluate((e) => e.classList.contains("show")))
  ) {
    await page
      .locator('[data-workspace-load="VISUAL-001"]')
      .first()
      .evaluate((button) => button.click());
  }
  await page.locator('[data-workspace-tab="comunicacion"]').click();
  await page.locator("[data-gmail-link]").click();
  await page
    .locator('.personal-dialog [name="url"]')
    .fill("https://mail.google.com/mail/u/0/#all/abc123");
  await page.locator('.personal-dialog button[type="submit"]').click();
  await page.locator("[data-gmail-compose]").click();
  for (const [name, value] of Object.entries({
    to: preview.to[0],
    cc: preview.cc[0],
    body: preview.body,
  }))
    await page.locator(`.personal-dialog [name="${name}"]`).fill(value);
  await page.locator('.personal-dialog button[type="submit"]').click();
  await page.locator('.personal-dialog [name="confirm"]').waitFor();
  const text = await page.locator(".personal-dialog").innerText();
  for (const value of [
    preview.from,
    ...preview.to,
    ...preview.cc,
    preview.body,
  ])
    assert.ok(text.includes(value));
  assert.equal(sends, 0);
  await page.locator('.personal-dialog [name="confirm"]').check();
  await page.locator('.personal-dialog button[type="submit"]').dblclick();
  await page
    .locator(".gmail-record")
    .filter({ hasText: "Envío confirmado por Gmail" })
    .waitFor();
  assert.equal(sends, 1);
  // WhatsApp permanece disponible y manual dentro del mismo expediente.
  assert.equal(await page.locator("#comm-message").isVisible(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.close();
  return {
    version: "2026.10.27.3",
    environment: "Chromium; Supabase y Gmail simulados",
    checks: [
      "Liga por carga",
      "Para y CC explícitos",
      "Vista previa completa",
      "Confirmación y un solo envío",
      "Registro confirmado",
      "WhatsApp manual conservado",
      "Vista móvil sin desbordamiento",
    ],
    realEmailsSent: 0,
  };
}
