import assert from "node:assert/strict";

/** Regresión de Invalid Date en el HTML entregable, sin acceso a la base real. */
export async function runCalendarDateReview({
  newPage,
  rawLoads,
  profiles,
  personalPreferences,
}) {
  const original = structuredClone(rawLoads);
  const results = [];
  rawLoads[0].pickup_appt = "2026-10-09T02:30:00Z"; // Jueves 8, 20:30 en México; viernes en UTC.
  rawLoads[0].delivery_appt = "2026-10-09T18:00:00Z";
  rawLoads[1].pickup_appt = "fecha inválida";
  Object.assign(personalPreferences, {
    calendar_hide_empty: false,
    show_crossings: false,
  });
  const range = async (page) =>
    (await page.locator("#cal-week-title").innerText())
      .match(/\d+/g)
      .map(Number);
  try {
    for (const zone of ["America/Mexico_City", "UTC", "America/Tijuana"]) {
      const page = await newPage(
        false,
        { width: 1440, height: 1024 },
        "internal",
        profiles[0],
        false,
        zone,
      );
      try {
        await page.waitForFunction(
          () => window.panelPersonal.preferences.calendar_hide_empty === false,
        );
        await page.locator('[data-page="calendario"]').first().click();
        assert.deepEqual(await range(page), [5, 2026, 11, 2026], zone);
        assert.deepEqual(
          (await page.locator(".cal-dia h3").allTextContents()).map((text) =>
            parseInt(text, 10),
          ),
          [5, 6, 7, 8, 9, 10, 11],
        );
        for (const view of ["agenda", "week", "list"]) {
          await page.locator(`[data-cal-view="${view}"]`).click();
          await page.waitForFunction(
            (view) => window.panelPersonal.preferences.calendar_view === view,
            view,
          );
          assert.equal(
            await page.locator("#cal-grid .cal-chip").count(),
            2,
            zone + " " + view,
          );
          assert.doesNotMatch(
            await page.locator("#page-calendario").innerText(),
            /NaN|Invalid Date/,
          );
          assert.equal(
            await page
              .locator(".cal-dia")
              .filter({ has: page.locator("#cal-day-3") })
              .locator(".t-pickup time")
              .innerText(),
            "20:30",
          );
          assert.equal(
            await page
              .locator(".cal-dia")
              .filter({ has: page.locator("#cal-day-4") })
              .locator(".t-entrega time")
              .innerText(),
            "12:00",
          );
        }
        await page.locator("#cal-prev").click();
        assert.deepEqual(await range(page), [28, 2026, 4, 2026]);
        await page.locator("#cal-next").click();
        assert.deepEqual(await range(page), [5, 2026, 11, 2026]);
        await page.locator("#cal-next").click();
        assert.deepEqual(await range(page), [12, 2026, 18, 2026]);
        await page.locator("#cal-hoy").click();
        assert.deepEqual(await range(page), [5, 2026, 11, 2026]);
        await page.locator("#cal-hide-empty").check();
        await page.waitForFunction(
          () => window.panelPersonal.preferences.calendar_hide_empty === true,
        );
        assert.equal(await page.locator(".cal-dia").count(), 2);
        if (zone === "America/Mexico_City") {
          await page.screenshot({
            path: "docs/imagenes/calendario-fechas-corregidas.png",
            fullPage: true,
          });
          await page.setViewportSize({ width: 390, height: 844 });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          await page.screenshot({
            path: "docs/imagenes/calendario-fechas-corregidas-movil.png",
            fullPage: true,
          });
        }
        results.push({
          timezone: zone,
          week: "2026-10-05 / 2026-10-11",
          views: ["agenda", "week", "list"],
          pickup: "2026-10-08 20:30",
          delivery: "2026-10-09 12:00",
          invalidRecordIgnored: true,
          navigation: true,
        });
      } finally {
        await page.close();
        Object.assign(personalPreferences, { calendar_hide_empty: false });
      }
    }
  } finally {
    rawLoads.splice(0, rawLoads.length, ...original);
  }
  return {
    version: "2026.10.27.2",
    environment: "Chromium local; Supabase simulado",
    results,
  };
}
