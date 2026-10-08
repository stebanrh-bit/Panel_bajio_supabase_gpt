import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv, rowsToLoads, parseLoadFile } from "../src/features/imports/parser.js";
import {
  communicationSla,
  calendarEvents,
  indicators,
} from "../src/features/overview/rules.js";
import { straightMiles, mapsUrl } from "../src/features/radar/rules.js";
import { fillTemplate } from "../src/features/team/templates.js";

test("lee un archivo XLSX real con la API de la biblioteca instalada",async()=> {
  const file=new File([await readFile(new URL('./fixtures/import.xlsx',import.meta.url))],'import.xlsx');
  const records=await parseLoadFile(file);
  assert.equal(records.length,1);assert.equal(records[0].load,'0007');assert.equal(records[0].customer,'PRUEBA XLSX');
  assert.ok(records[0].pickup_appt.endsWith('Z'));
});

test("CSV conserva ceros, comillas escapadas, saltos internos y encabezados del Excel original", () => {
  const rows = parseCsv(
    'Load;Customers;City O.;Pickup appt.\r\n001;"Empresa; \"\"Bajío\"\"\nMéxico";Laredo;2026-10-08 12:30\r\n',
  );
  const loads = rowsToLoads(rows);
  assert.equal(loads[0].load, "001");
  assert.equal(loads[0].customer, 'Empresa; "Bajío"\nMéxico');
  assert.equal(loads[0].origin_city, "Laredo");
  assert.ok(loads[0].pickup_appt.endsWith("Z"));
  assert.throws(() => parseCsv('Load,Customer\n1,"Sin cerrar'), /sin cerrar/);
  assert.throws(
    () =>
      rowsToLoads([
        ["Load", "Número de carga"],
        ["1", "1"],
      ]),
    /repetidos/,
  );
  assert.throws(() => rowsToLoads([["Load"], ["1"], ["1"]]), /duplicada/);
  assert.throws(
    () =>
      rowsToLoads([
        ["Load", "Pickup appt."],
        ["1", "2026-02-30"],
      ]),
    /inexistente/,
  );
  assert.throws(
    () =>
      rowsToLoads([
        ["Load", "Pickup appt."],
        ["1", "10/08/2026"],
      ]),
    /AAAA/,
  );
});
test("calendario separa eventos y excluye apartados cerrados; SLA mide el aviso posterior", () => {
  const events = calendarEvents(
    [
      {
        load: "1",
        customer: "ACME",
        pickup_appt: "2026-10-01T10:00Z",
        delivery_appt: "2026-10-02T10:00Z",
      },
    ],
    [
      { load: "2", state: "usado", crossing_at: "2026-10-01T10:00Z" },
      { load: "3", state: "transito", delivery_at: "2026-10-02T12:00Z" },
    ],
  );
  assert.equal(events.length, 3);
  assert.equal(events[2].load, "3");
  const sla = communicationSla([
    { load: "1", event_type: "NOTIFICADO", created_at: "2026-10-01T12:00Z" },
    { load: "1", event_type: "PENDIENTE", created_at: "2026-10-01T11:00Z" },
    { load: "1", event_type: "PENDIENTE", created_at: "2026-10-01T11:30Z" },
    { load: "2", event_type: "NOTIFICADO", created_at: "2026-10-01T12:00Z" },
  ]);
  assert.deepEqual(sla, { samples: 1, average: 60 });
  const stats = indicators(
    [
      {
        load: "1",
        status: "DELIVERED",
        pod_sent: "false",
        delivery_delta_min: "20",
        client_notify_pending: "false",
      },
    ],
    [],
  );
  assert.equal(stats.missingPod, 1);
  assert.equal(stats.notifications, 0);
  assert.equal(stats.onTimeDelivery, 0);
});
test("distancias y plantillas conservan significado y texto literal", () => {
  const laredo = { latitude: 27.5306, longitude: -99.4803 },
    dallas = { latitude: 32.7767, longitude: -96.797 };
  assert.equal(straightMiles(laredo, laredo), 0);
  assert.ok(
    straightMiles(laredo, dallas) > 350 && straightMiles(laredo, dallas) < 420,
  );
  assert.ok(mapsUrl("A&B", "C#D").includes("A%26B"));
  assert.equal(
    fillTemplate("Carga {load}, {customer}, {otra}", {
      load: "001",
      customer: "Bajío",
    }),
    "Carga 001, Bajío, {otra}",
  );
});
