import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taskFollowUpISO,
  taskFollowUpInput,
  taskReminderDue,
} from "../src/original/task-time.js";

test("tareas: fecha y hora de México se guardan con zona, sin depender del navegador", () => {
  assert.equal(taskFollowUpISO("2026-10-23T09:30"), "2026-10-23T15:30:00.000Z");
  assert.equal(taskFollowUpISO("2026-10-23"), "2026-10-23T06:00:00.000Z");
  assert.equal(taskFollowUpISO("2026-10-23T00:05"), "2026-10-23T06:05:00.000Z");
  assert.equal(
    taskFollowUpInput("2026-10-23T02:30:45.123Z"),
    "2026-10-22T20:30",
  );
  assert.equal(
    taskFollowUpISO("2026-10-23T09:30:45.123-06:00"),
    "2026-10-23T15:30:45.123Z",
  );
  assert.equal(taskFollowUpISO(""), "");
  assert.equal(taskFollowUpInput(null), "");
});

test("tareas: no avisar mañana, ni más tarde hoy; avisar al llegar la hora exacta", () => {
  const task = {
    fecha_seguimiento: "2026-10-23T09:30",
    asignado_a: "Esteban",
    creado_por: "Esteban",
  };
  assert.equal(
    taskReminderDue(task, Date.parse("2026-10-22T23:59:00-06:00")),
    false,
  );
  assert.equal(
    taskReminderDue(task, Date.parse("2026-10-23T09:29:59-06:00")),
    false,
  );
  assert.equal(
    taskReminderDue(task, Date.parse("2026-10-23T09:30:00-06:00")),
    true,
  );
  for (const flags of [{ resuelto: true }, { cancelado: true }])
    assert.equal(
      taskReminderDue(
        { ...task, ...flags },
        Date.parse("2026-10-24T12:00:00Z"),
      ),
      false,
    );
  for (const fecha_seguimiento of ["", null, "2026-02-30T10:00", "inválida"])
    assert.equal(taskReminderDue({ fecha_seguimiento }, Date.now()), false);
});

test("tareas: rechazar fechas inexistentes y respetar reglas históricas de la zona IANA", () => {
  for (const value of [
    "2026-02-30T09:00",
    "2026-13-01T09:00",
    "2026-10-23T25:00",
    "2026-10-23T09:99",
    "abc",
  ])
    assert.throws(() => taskFollowUpISO(value));
  assert.equal(taskFollowUpISO("2021-07-01T09:00"), "2021-07-01T14:00:00.000Z");
  assert.throws(() => taskFollowUpISO("2021-04-04T02:30"), /no existe/);
});
