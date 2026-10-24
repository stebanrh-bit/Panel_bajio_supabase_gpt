import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  instructionNotice,
  instructionCard,
  instructionStages,
} from "../src/original/instructions/content.js";

test("instructivos: avisos por etapa vigente, sin adelantar citas ni repetir por cambiar otro campo", () => {
  const now = Date.parse("2026-10-24T18:00:00Z");
  const record = {
    load: "A",
    instruction_context: {
      state: "ready",
      mode: "current",
      stage: "origin",
      event_key: "origin-approved",
      action: "Confirmar recepción",
      notify_at: "2026-10-25T18:00:00Z",
    },
  };
  assert.equal(instructionNotice(record, now), null);
  assert.ok(instructionNotice(record, now + 86400000));
  record.instruction_context.notify_at = null;
  const first = instructionNotice(record, now);
  assert.equal(
    instructionNotice(
      { ...record, trailer: "T0132", updated_at: "2026-10-25T19:00:00Z" },
      now,
    ).id,
    first.id,
  );
  for (const state of ["completed", "finished", "waiting_date"])
    assert.equal(
      instructionNotice(
        {
          ...record,
          instruction_context: { ...record.instruction_context, state },
        },
        now,
      ),
      null,
    );
  assert.equal(
    instructionNotice(
      {
        ...record,
        instruction_context: { ...record.instruction_context, mode: "next" },
      },
      now,
    ),
    null,
  );
  const unknown = {
    load: "1",
    customer: "ACME",
    origin_city: "Bajío",
    dest_city: "Laredo",
    instruction_context: { state: "no_template" },
  };
  assert.equal(
    instructionNotice(unknown, now).id,
    instructionNotice({ ...unknown, load: "2" }, now).id,
  );
});
test("instructivos: presentación escapa procedimientos y mantiene los recorridos acordados", () => {
  const win = new Window();
  win.document.body.innerHTML = instructionCard({
    load: "A",
    instruction_context: {
      state: "ready",
      stage_key: "s",
      action: "<img src=x onerror=alert(1)>",
      stage_label: "Yarda USA",
    },
  });
  assert.equal(win.document.querySelectorAll("img").length, 0);
  assert.match(win.document.body.textContent, /<img/);
  assert.equal(instructionStages("export").length, 4);
  assert.equal(instructionStages("import").length, 6);
  assert.match(instructionStages("import")[2][1], /USA/);
  assert.match(instructionStages("import")[4][1], /MX/);
});

test("historial de instructivos: registra cambios de estado y requisitos con texto legible", async () => {
  const { loadHistoryItems, presentHistoryChange } = await import(
    "../src/original/history.js"
  );
  const before = {
    state: "waiting",
    stage_label: "Planta del cliente",
    action: "Confirmar salida",
    missing: ["bol"],
  };
  const after = { ...before, state: "ready", missing: [] };
  const changes = loadHistoryItems(
    [
      {
        id: "1",
        actor: "a",
        before_data: { instruction_context: before },
        after_data: { instruction_context: after },
      },
    ],
    "A",
  );
  assert.equal(changes.length, 1);
  const text = presentHistoryChange(changes[0], String);
  assert.match(text.before, /Falta: BOL/);
  assert.match(text.after, /Por atender/);
  assert.ok(!text.after.includes("[object Object]"));
});
