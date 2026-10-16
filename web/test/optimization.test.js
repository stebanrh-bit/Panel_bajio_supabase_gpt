import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { csvCell, escapeHtml, safeLink } from "../src/original/content.js";
import { renderKeyed } from "../src/original/rendering.js";
import { coordinatePoll } from "../src/original/coordination.js";
import { fetchExternal } from "../src/original/network.js";
test("CSV: neutralizar fórmulas y conservar negativos válidos, cero y saltos", () => {
  for (const value of ["=1+1", " +cmd", "\t@SUM(A1)", '-HYPERLINK("x")'])
    assert.ok(csvCell(value).includes("'"));
  assert.equal(csvCell(-125.5), "-125.5");
  assert.equal(csvCell("-01:30"), "'-01:30");
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("a\nb"), '"a\nb"');
});
test("HTML y vínculos: comillas y etiquetas se muestran como texto", () => {
  const window = new Window();
  window.document.body.innerHTML =
    '<p data-x="' +
    escapeHtml('\" onmouseover=bad() <img src=x>') +
    '">' +
    escapeHtml("<script>bad()</script>") +
    "</p>";
  assert.equal(window.document.querySelectorAll("img,script").length, 0);
  assert.equal(
    window.document.querySelector("p").getAttribute("onmouseover"),
    null,
  );
  for (const url of ["javascript:alert(1)", "data:text/html,bad", "blob:test"])
    assert.equal(safeLink(url), "");
  assert.equal(safeLink("https://example.test"), "https://example.test/");
});
test("DOM: agregar, eliminar y reordenar conserva la fila y su edición activa", () => {
  const window = new Window(),
    container = window.document.createElement("div");
  window.document.body.append(container);
  const key = (r) => r.id,
    html = (r) =>
      '<article data-key="' +
      r.id +
      '"><input value="' +
      r.text +
      '"></article>';
  renderKeyed(
    container,
    [
      { id: "__proto__", text: "A" },
      { id: "B", text: "B" },
    ],
    key,
    html,
  );
  const first = container.firstChild;
  first.firstChild.value = "Sin guardar";
  renderKeyed(
    container,
    [
      { id: "C", text: "C" },
      { id: "B", text: "B" },
      { id: "__proto__", text: "A" },
    ],
    key,
    html,
  );
  assert.equal(container.lastChild, first);
  assert.equal(first.firstChild.value, "Sin guardar");
  renderKeyed(container, [{ id: "__proto__", text: "A" }], key, html);
  assert.equal(container.firstChild, first);
  assert.equal(container.children.length, 1);
});
test("dos pestañas de fondo comparten sondeo; foco y actualizar fuerzan consulta", async () => {
  const map = new Map(),
    env = {
      document: { hidden: true },
      localStorage: {
        getItem: (k) => map.get(k),
        setItem: (k, v) => map.set(k, v),
      },
    };
  let calls = 0;
  const fetch = async () => {
    calls++;
    return { ok: true };
  };
  await coordinatePoll("ana", { loads: 1 }, fetch, env);
  assert.equal(
    (await coordinatePoll("ana", { loads: 1 }, fetch, env)).deferred,
    true,
  );
  await coordinatePoll("luis", { loads: 1 }, fetch, env);
  await coordinatePoll("ana", {}, fetch, env);
  env.document.hidden = false;
  await coordinatePoll("ana", { loads: 1 }, fetch, env);
  assert.equal(calls, 4);
});
test("red externa: cancelar y vencer el tiempo terminan la petición", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  try {
    await assert.rejects(
      fetchExternal("https://maps.test", { timeout: 10 }),
      /demasiado/,
    );
    const controller = new AbortController(),
      promise = fetchExternal("https://maps.test", {
        signal: controller.signal,
      });
    controller.abort();
    await assert.rejects(promise);
  } finally {
    globalThis.fetch = original;
  }
});

test("plantilla: conservar literalmente signos dólar del JavaScript comprimido", async () => {
  const { originalPage } = await import("../src/original/page.js");
  const template = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("../src/original/index.template.html", import.meta.url),
      "utf8",
    ),
  );
  const script = "var $=true;$&&console.log(1);";
  const page = originalPage({ template, script, config: {} });
  assert.ok(page.scripts.includes(script));
});
