import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  messageVariables,
  variableValues,
  renderMessageTemplate,
  needsLatestComment,
  variableSelectHtml,
} from "../src/original/message-variables.js";

test("variables: catálogo completo, valores de texto, cero y documentos sin datos internos", () => {
  const values = variableValues({
    load: "001",
    truck: "T0132",
    loaded_miles: 0,
    bol: false,
    service_role: "privado",
    instruction_plan: { secret: "no publicar" },
  });
  assert.equal(
    new Set(messageVariables.map((v) => v.key)).size,
    messageVariables.length,
  );
  assert.deepEqual(
    Object.keys(values).sort(),
    messageVariables.map((v) => v.key).sort(),
  );
  assert.ok(Object.values(values).every((value) => typeof value === "string"));
  assert.equal(values.loaded_miles, "0");
  assert.equal(values.bol, "No");
  assert.equal(values.last_comment, "Sin comentarios registrados");
  assert.equal(values.punctual_note, "");
  assert.ok(!JSON.stringify(values).includes("privado"));
});

test("variables: el último comentario y sus marcadores se conservan literalmente, sin sustitución recursiva", () => {
  const text = "En tránsito. $& {{truck}}\n<texto operativo>";
  const values = variableValues(
    { load: "001", truck: "T0132" },
    { text, ts: "2026-10-28T17:00:00Z", usuario: "Esteban" },
  );
  assert.equal(
    renderMessageTemplate("{{last_comment}} / {{truck}}", values),
    text + " / T0132",
  );
  assert.equal(renderMessageTemplate("{{ultimo_comentario}}", values), text);
  assert.equal(renderMessageTemplate("{{latest_comment}}", values), text);
  assert.equal(
    renderMessageTemplate("{{desconocida}}", values),
    "{{desconocida}}",
  );
  assert.match(values.last_comment_at, /11:00/);
  assert.equal(values.last_comment_by, "Esteban");
  for (const key of [
    "last_comment",
    "last_comment_at",
    "last_comment_by",
    "ultimo_comentario",
    "latest_comment",
  ])
    assert.equal(needsLatestComment("{{" + key + "}}"), true);
  assert.equal(needsLatestComment("{{truck}}"), false);
});

test("variables: conserva el significado de los marcadores anteriores y las excepciones vigentes", () => {
  const date = (value) => "fecha:" + value;
  const values = variableValues(
    {
      load: "01",
      customer: "Cliente",
      origin_city: "MTY",
      origin_state: "nl",
      dest_city: "Laredo",
      dest_state: "tx",
      delivery_appt: "entrega",
      delivery_actual: "real",
      cruce_usa_fecha: "cruce",
      client_notify_reason: "Cambio de cita",
      punctual_pending: false,
      punctual_note: "Ya resuelto",
    },
    null,
    date,
  );
  assert.equal(values.load, "Carga 01");
  assert.equal(values.load_number, "01");
  assert.equal(values.route, "MTY, NL → Laredo, TX");
  assert.equal(values.delivery, "fecha:entrega");
  assert.equal(values.delivery_actual, "Entrega registrada: fecha:real.");
  assert.equal(values.crossing, "Cruce a USA registrado: fecha:cruce. ");
  assert.equal(values.reason, " Motivo de actualización: Cambio de cita.");
  assert.equal(values.punctual_note, "");
});

test("variables: menú agrupado, etiquetas legibles y destinos escapados", () => {
  const win = new Window();
  win.document.body.innerHTML = variableSelectHtml('texto"', "<carga>");
  const select = win.document.querySelector("select");
  assert.equal(select.options.length, messageVariables.length + 1);
  assert.equal(select.querySelectorAll("optgroup").length, 7);
  assert.equal(
    select.querySelector('[value="last_comment"]').textContent,
    "Último comentario",
  );
  assert.equal(select.dataset.variableTarget, 'texto"');
  assert.equal(win.document.querySelectorAll("carga").length, 0);
  win.happyDOM.abort();
});

test("último comentario: consulta solo la carga pedida, con orden estable y una fila", async () => {
  const { operationMethods } = await import(
    "../src/original/api/operations.js"
  );
  const calls = [],
    chain = {};
  for (const name of ["select", "eq", "order"])
    chain[name] = (...args) => {
      calls.push([name, ...args]);
      return chain;
    };
  chain.limit = (limit) => {
    calls.push(["limit", limit]);
    return Promise.resolve({
      data: [{ body: "Último", created_at: "fecha", created_by: "autor" }],
      error: null,
    });
  };
  const methods = operationMethods({
    client: {
      from: (table) => {
        assert.equal(table, "comments");
        return chain;
      },
    },
    staff() {},
    safe: (promise) => promise,
    personName: () => "Esteban",
  });
  assert.deepEqual((await methods.getUltimoComentarioCarga("001")).comment, {
    text: "Último",
    ts: "fecha",
    usuario: "Esteban",
  });
  assert.deepEqual(
    calls.filter((call) => call[0] === "eq"),
    [["eq", "load", "001"]],
  );
  assert.deepEqual(
    calls.filter((call) => call[0] === "order").map((call) => call.slice(1)),
    [
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ],
  );
  assert.deepEqual(calls.at(-1), ["limit", 1]);
});
