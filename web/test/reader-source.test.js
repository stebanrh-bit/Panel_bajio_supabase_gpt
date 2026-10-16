import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { Window } from "happy-dom";
import { decodeReaderSource, parseLoadFile } from "../src/original/files.js";

const packageReader = (source) =>
  execFileSync(
    "python",
    [
      "-c",
      "import sys; from package_google import package_reader; sys.stdout.write(package_reader(sys.stdin.read()))",
    ],
    {
      cwd: new URL("../../scripts/", import.meta.url),
      input: source,
      encoding: "utf8",
    },
  );

test("lector Google: HTML válido conserva el programa, Unicode y cierres de etiquetas sin crear elementos", () => {
  const source =
    'self.example = "</script><img src=x onerror=bad()> & México <?dato?>";';
  const html = packageReader(source);
  const window = new Window();
  window.document.write(html);
  assert.equal(window.document.querySelectorAll("script").length, 1);
  assert.equal(window.document.querySelectorAll("img").length, 0);
  assert.equal(JSON.parse(window.document.body.textContent.trim()), source);
  assert.equal(decodeReaderSource(html), source);
  assert.doesNotThrow(() => new vm.Script(decodeReaderSource(html)));
  for (const invalid of [
    source,
    "<html></html>",
    '<script id="panel-reader-source" type="application/json">null</script>',
  ])
    assert.throws(
      () => decodeReaderSource(invalid),
      /Actualiza index.html y lector.html/,
    );
});

test("lector Google: una excepción de HtmlService muestra instrucciones, oculta el programa y permite reintentar", async () => {
  const previous = { google: globalThis.google, Worker: globalThis.Worker };
  let calls = 0;
  const chain = (success, failure) => ({
    withSuccessHandler: (callback) => chain(callback, failure),
    withFailureHandler: (callback) => chain(success, callback),
    panelFileReader() {
      calls++;
      queueMicrotask(() =>
        failure(
          new Error(
            "Exception: Contenido HTML incorrecto: CODIGO_INTERNO_COMPLETO",
          ),
        ),
      );
    },
  });
  globalThis.google = { script: { run: chain() } };
  globalThis.Worker = class {
    constructor() {
      throw Error("No debe iniciar un Worker si falló la descarga");
    }
  };
  try {
    const file = new File(["contenido de prueba"], "radar.xlsx");
    for (let i = 0; i < 2; i++)
      await assert.rejects(
        parseLoadFile(file, null, { raw: true }),
        (error) => {
          assert.match(error.message, /Actualiza index.html y lector.html/);
          assert.doesNotMatch(error.message, /CODIGO_INTERNO_COMPLETO/);
          return true;
        },
      );
    assert.equal(calls, 2);
  } finally {
    if (previous.google === undefined) delete globalThis.google;
    else globalThis.google = previous.google;
    if (previous.Worker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previous.Worker;
  }
});
