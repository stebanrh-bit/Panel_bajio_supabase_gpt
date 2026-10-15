import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_NO_CLIENT,
  calendarClientKey,
  reservationCalendarClient,
  filterCalendarEvents,
} from "../src/original/calendar.js";

test("calendario: cliente normalizado sin confundir un nombre con la opción sin cliente", () => {
  assert.equal(
    calendarClientKey(" ACME  Bajío "),
    calendarClientKey("acme bajío"),
  );
  assert.equal(calendarClientKey(""), CALENDAR_NO_CLIENT);
  assert.notEqual(calendarClientKey(CALENDAR_NO_CLIENT), CALENDAR_NO_CLIENT);
});

test("calendario: apartado reconoce carga relacionada o nombre exacto de cliente", () => {
  const rows = [
    { load: "A-1", customer: "ACME" },
    { load: "B-2", customer: "Cliente Dos" },
  ];
  assert.equal(reservationCalendarClient({ mi_carga: " a-1 " }, rows), "ACME");
  assert.equal(
    reservationCalendarClient({ mi_carga: "CLIENTE DOS" }, rows),
    "Cliente Dos",
  );
});

test("calendario: sin relación conocida no inventa un cliente ni busca fuera del alcance", () => {
  const rows = [{ load: "A-1", customer: "ACME" }];
  for (const mi_carga of ["", "ACME urgente", "B-2", "Entrega para ACME"])
    assert.equal(reservationCalendarClient({ mi_carga }, rows), "");
  assert.equal(reservationCalendarClient({ mi_carga: "A-1" }, []), "");
});

test("calendario: tipo y cliente se combinan y Todos conserva datos y fechas", () => {
  const events = [
    { tipo: "pickup", customer: "ACME", fecha: "2026-10-08" },
    { tipo: "entrega", customer: "ACME" },
    { tipo: "cruce", customer: "Cliente Dos" },
    { tipo: "apartado", customer: "ACME" },
    { tipo: "apartado", customer: "" },
  ];
  const snapshot = structuredClone(events);
  assert.deepEqual(filterCalendarEvents(events, "pickup"), [events[0]]);
  assert.deepEqual(
    filterCalendarEvents(events, "all", calendarClientKey("ACME")),
    [events[0], events[1], events[3]],
  );
  assert.deepEqual(
    filterCalendarEvents(events, "entrega", calendarClientKey("Cliente Dos")),
    [],
  );
  assert.deepEqual(
    filterCalendarEvents(events, "apartado", CALENDAR_NO_CLIENT),
    [events[4]],
  );
  assert.deepEqual(filterCalendarEvents(events), events);
  assert.deepEqual(events, snapshot);
});
