import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseLoadFileFallback as parseLoadFile } from "../src/original/files-fallback.js";

test("importación original: CSV con encabezado inicial, ceros y booleanos literales", async () => {
  const file = new File(
    [
      "Load,Customers,BOL,DODA,ENTRY,On time pickup\n0007,ACME,false,0,no,-01:30\n",
    ],
    "cargas.csv",
  );
  const [row] = await parseLoadFile(file);
  assert.equal(row.load, "0007");
  assert.equal(row.bol, "false");
  assert.equal(row.doda, "0");
  assert.equal(row.entry, "no");
  assert.equal(row.pickup_delta_min, "-90");
});

test("importación original: XLSX real, filas de título y última fila duplicada revisada por el adaptador", async () => {
  const file = new File(
    [await readFile(new URL("./fixtures/import.xlsx", import.meta.url))],
    "cargas.xlsx",
  );
  const [row] = await parseLoadFile(file);
  assert.equal(row.load, "0007");
  assert.equal(row.customer, "PRUEBA XLSX");
  assert.ok(row.pickup_appt.endsWith("Z"));
  const csv = new File(
    [
      "Reporte TMS\nLoad,Customers,Pickup appt.\n1,PRIMERO,\n,Sin load,fecha inválida descartada\n1,ULTIMO,\n",
    ],
    "cargas.csv",
  );
  const records = await parseLoadFile(csv);
  assert.deepEqual(
    records.map((item) => item.customer),
    ["PRIMERO", "ULTIMO"],
  );
});

test("importación original: formatos, encabezados, fechas, desfases y tamaño inválidos se rechazan antes del servidor", async () => {
  await assert.rejects(
    parseLoadFile(new File(["Carga,Otra"], "datos.txt")),
    /xlsx/,
  );
  await assert.rejects(
    parseLoadFile(new File(["foo,bar\n1,2"], "datos.csv")),
    /encabezado/,
  );
  await assert.rejects(
    parseLoadFile(new File(["Load,Carga\n1,1"], "datos.csv")),
    /repetidos/,
  );
  await assert.rejects(
    parseLoadFile(new File(["Load,Pickup appt.\n1,2026-02-30"], "datos.csv")),
    /inexistente/,
  );
  await assert.rejects(
    parseLoadFile(new File(["Load,On time\n1,01:99"], "datos.csv")),
    /desfase/,
  );
  await assert.rejects(
    parseLoadFile({ name: "datos.xlsx", size: 10 * 1024 * 1024 + 1 }),
    /10 MB/,
  );
});

test("importación original: .xls conserva lectura heredada y las horas locales de Excel", async () => {
  const file = new File(["lector simulado"], "datos.xls");
  let calls = 0;
  const [row] = await parseLoadFile(file, async (actual) => {
    calls += 1;
    assert.equal(actual, file);
    return [
      ["Load", "Pickup appt."],
      ["LEGACY", new Date(2026, 9, 14, 12, 30)],
    ];
  });
  assert.equal(calls, 1);
  assert.equal(new Date(row.pickup_appt).getHours(), 12);
  assert.equal(new Date(row.pickup_appt).getMinutes(), 30);
});
