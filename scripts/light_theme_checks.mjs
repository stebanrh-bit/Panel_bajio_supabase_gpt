/** Lisibilidad y tamaño en el HTML real; las pruebas no dependen de colores hex exactos. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { clickOperationOption } from "./simple_sheet_checks.mjs";

async function inspectContrast(page, section) {
  return page.evaluate((section) => {
    const rgb = (value) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
      return [...parts.slice(0, 3), parts[3] ?? 1];
    };
    const blend = (foreground, background) =>
      foreground
        .slice(0, 3)
        .map(
          (value, i) =>
            value * foreground[3] + background[i] * (1 - foreground[3]),
        );
    const luminance = (color) =>
      color.reduce((sum, value, i) => {
        const c = value / 255;
        return (
          sum +
          [0.2126, 0.7152, 0.0722][i] *
            (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        );
      }, 0);
    const issues = [];
    let checked = 0;
    for (const node of document.querySelectorAll("body *")) {
      if (
        ["SCRIPT", "STYLE", "OPTION", "SVG", "PATH", "TITLE"].includes(
          node.tagName,
        )
      )
        continue;
      if (
        !node.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        }) ||
        node.closest('[disabled],[aria-disabled="true"]')
      )
        continue;
      const text = [...node.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      if (!text || !node.getBoundingClientRect().width) continue;
      const chain = [];
      for (let parent = node; parent; parent = parent.parentElement)
        chain.unshift(parent);
      let background = [255, 255, 255];
      for (const parent of chain)
        background = blend(
          rgb(getComputedStyle(parent).backgroundColor),
          background,
        );
      const style = getComputedStyle(node);
      const foreground = blend(rgb(style.color), background);
      const a = luminance(foreground),
        b = luminance(background);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 &&
          Number(style.fontWeight) >= 700);
      checked++;
      if (ratio < (large ? 3 : 4.5))
        issues.push({
          section,
          element: node.tagName.toLowerCase() + "." + node.className,
          text: text.slice(0, 70),
          color: style.color,
          background,
          ratio: Number(ratio.toFixed(2)),
        });
    }
    return { section, checked, issues };
  }, section);
}

export async function runLightThemeReview({ newPage }) {
  const results = [],
    controls = [],
    layouts = [];
  const page = await newPage();
  try {
    assert.equal(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
      "light",
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
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
        results.push(await inspectContrast(page, `${section}-${width}`));
        const fit = await page.evaluate(() => ({
          width: innerWidth,
          content: document.documentElement.scrollWidth,
        }));
        assert.ok(fit.content <= width, `${section}: ${JSON.stringify(fit)}`);
        layouts.push({ section, ...fit });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-page="operation"]').click();
    await page.locator("#ux-advanced-filters > summary").click();
    for (const id of ["own-clients-toggle", "view-toggle-btn"]) {
      const size = await page.locator("#" + id).evaluate((node) => ({
        id: node.id,
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      }));
      assert.ok(size.height <= 36 && size.width < 210, JSON.stringify(size));
      controls.push(size);
    }
    const message = await page
      .locator("#ux-advanced-filters [data-abrir-multi-msg]")
      .evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      }));
    assert.ok(
      message.height <= 36 && message.width < 210,
      JSON.stringify(message),
    );
    controls.push({ id: "mensaje-a-cliente", ...message });
    await page.setViewportSize({ width: 390, height: 1000 });
    for (const selector of [
      "#own-clients-toggle",
      "#view-toggle-btn",
      "[data-abrir-multi-msg]",
    ]) {
      const size = await page
        .locator("#ux-advanced-filters " + selector)
        .evaluate((node) => ({
          id: node.id || "mensaje-a-cliente",
          viewport: innerWidth,
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        }));
      assert.ok(
        size.height >= 40 && size.height <= 44 && size.width < 210,
        JSON.stringify(size),
      );
      controls.push(size);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    results.push(await inspectContrast(page, "opciones"));
    await page.locator("#page-operation").screenshot({
      path: "/tmp/panel-original-comparison/tema-claro-opciones.png",
    });
    await page.locator("#ux-advanced-filters > summary").click();
    results.push(await inspectContrast(page, "tarjetas"));
    const cards = await page
      .locator("#cards-view .card:visible")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        })),
      );
    assert.ok(
      cards.length > 0 &&
        cards.every((card) => card.width < 650 && card.height < 360),
      JSON.stringify(cards),
    );
    await page.locator("#cards-view").screenshot({
      path: "/tmp/panel-original-comparison/tema-claro-tarjetas.png",
    });
    await clickOperationOption(page, "#view-toggle-btn");
    await page.locator('#table-body [data-table-select="VISUAL-001"]').click();
    results.push(await inspectContrast(page, "detalle-rapido"));
    await page.locator("#table-detail-dialog").screenshot({
      path: "/tmp/panel-original-comparison/tema-claro-detalle.png",
    });
    await page
      .locator('#table-detail-body [data-workspace-load="VISUAL-001"]')
      .click();
    await page.locator("#workspace-backdrop.show").waitFor();
    for (const tab of [
      "operacion",
      "tracking",
      "comunicacion",
      "documentos",
      "incidencias",
      "historial",
    ]) {
      await page.locator(`[data-workspace-tab="${tab}"]`).click();
      results.push(await inspectContrast(page, "expediente-" + tab));
    }
    await page.locator("#workspace-close").click();
    // Revisar también los formularios secundarios sin enviar datos.
    for (const name of [
      "comments",
      "incidencia",
      "pendiente",
      "bitacora",
      "apartado",
      "recordatorio",
      "csr",
    ]) {
      await page
        .locator("#" + name + "-backdrop")
        .evaluate((node) => node.classList.add("show"));
      results.push(await inspectContrast(page, "ventana-" + name));
      await page
        .locator("#" + name + "-backdrop")
        .evaluate((node) => node.classList.remove("show"));
    }
    await page.locator('[data-page="home"]').click();
    await page.locator("#page-home").screenshot({
      path: "/tmp/panel-original-comparison/tema-claro-inicio.png",
    });
    await page.screenshot({
      path: "/tmp/panel-original-comparison/tema-claro-panel-completo.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Organizar turno", exact: true })
      .click();
    await page.locator(".organize-hub[open]").waitFor();
    results.push(await inspectContrast(page, "organizar-turno"));
    await page.locator(".organize-hub").screenshot({
      path: "/tmp/panel-original-comparison/tema-claro-organizar.png",
    });
    await page.locator(".organize-hub .organize-close").click();
    for (const view of ["client", "manager"]) {
      const portal = await newPage(false, { width: 1440, height: 1000 }, view);
      try {
        assert.equal(
          await portal.evaluate(
            () => getComputedStyle(document.documentElement).colorScheme,
          ),
          "light",
        );
        results.push(await inspectContrast(portal, view));
        await portal.screenshot({
          path: `/tmp/panel-original-comparison/tema-claro-${view}.png`,
        });
        await portal.locator("#shipments-tbody tr").first().click();
        results.push(await inspectContrast(portal, view + "-detalle"));
      } finally {
        await portal.close();
      }
    }
    const summary = {
      cards,
      results,
      controls,
      layouts,
      issues: results.flatMap((result) => result.issues),
    };
    await writeFile(
      "/tmp/panel-original-comparison/tema-claro.json",
      JSON.stringify(summary, null, 2) + "\n",
    );
    assert.deepEqual(
      summary.issues,
      [],
      "Textos con contraste insuficiente; ver tema-claro.json",
    );
    return summary;
  } finally {
    await page.close();
  }
}
