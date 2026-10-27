import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addresses,
  prepareReply,
  rawReply,
  deliver,
} from "../../supabase/functions/panel-gmail/domain.js";
import { googleApi } from "../../supabase/functions/panel-gmail/google.js";
import { vault, digest } from "../../supabase/functions/panel-gmail/crypto.js";
const thread = {
  id: "abc123",
  messages: [
    {
      payload: {
        headers: [
          { name: "Message-ID", value: "<original@example.com>" },
          { name: "Subject", value: "Carga México 123" },
        ],
      },
    },
  ],
};
const preview = () =>
  prepareReply({
    thread,
    from: "operador@example.com",
    to: "cliente@example.com",
    cc: "supervisor@example.com",
    body: "Entrega confirmada.\nGracias.",
  });
test("Gmail: vista previa, Unicode e hilo original en MIME", () => {
  const p = preview();
  assert.equal(p.subject, "Re: Carga México 123");
  const mime = Buffer.from(rawReply(p, "id-simulado"), "base64url").toString(
    "utf8",
  );
  assert.match(mime, /From: operador@example.com/);
  assert.match(mime, /Cc: supervisor@example.com/);
  assert.match(mime, /In-Reply-To: <original@example.com>/);
  assert.match(mime, /Message-ID: <panel-id-simulado@panel-bajio.invalid>/);
  assert.equal(
    Buffer.from(mime.split("\r\n\r\n")[1], "base64").toString(),
    p.body,
  );
  assert.deepEqual(addresses("A@example.com; a@example.com"), [
    "a@example.com",
  ]);
  for (const address of [
    "a@example.com\r\nBcc: b@example.com",
    "Nombre <a@example.com>",
    "invalido",
  ])
    assert.throws(() => addresses(address));
  assert.throws(
    () => prepareReply({ thread, from: "a@example.com", to: "", body: "hola" }),
    /destinatario/,
  );
  assert.throws(
    () =>
      prepareReply({
        thread: { ...thread, id: "FMfcAbc" },
        from: "a@example.com",
        to: "b@example.com",
        body: "hola",
      }),
    /hilo/,
  );
});
test("Gmail: doble clic, pérdida de respuesta y fallo al registrar nunca repiten el envío", async () => {
  let state = "prepared",
    sends = 0;
  const item = { id: "simulado", preview: preview() };
  const claim = async () => {
    if (state !== "prepared")
      return { claimed: false, item: { ...item, state } };
    state = "sending";
    return { claimed: true, item };
  };
  const complete = async (_, receipt) => {
    state = "sent";
    return { ...item, state, message_id: receipt.id };
  };
  const dependencies = {
    claim,
    send: async () => {
      sends++;
      return { id: "gmail-id", threadId: "abc123" };
    },
    complete,
    uncertain: async () => {
      state = "uncertain";
    },
  };
  await Promise.all([deliver(dependencies), deliver(dependencies)]);
  assert.equal(sends, 1);
  assert.equal(state, "sent");
  state = "prepared";
  await assert.rejects(
    deliver({
      ...dependencies,
      send: async () => {
        sends++;
        throw Error("timeout después de aceptar");
      },
    }),
    /No vuelvas a enviar/,
  );
  await deliver(dependencies);
  assert.equal(sends, 2);
  assert.equal(state, "uncertain");
  state = "prepared";
  await assert.rejects(
    deliver({
      ...dependencies,
      complete: async () => {
        throw Error("SQL sin respuesta");
      },
    }),
  );
  await deliver(dependencies);
  assert.equal(sends, 3);
  assert.equal(state, "uncertain");
});
test("Gmail: transporte simulado usa users/me y jamás reintenta POST", async () => {
  const calls = [];
  const provider = googleApi(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ id: "simulado", threadId: "abc123" }),
    };
  });
  const receipt = await provider.gmail("TOKEN_SIMULADO", "messages/send", {
    raw: "MIME_SIMULADO",
  });
  assert.equal(receipt.id, "simulado");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /users\/me\/messages\/send$/);
  const failed = googleApi(async () => {
    throw Error("red simulada");
  });
  await assert.rejects(
    failed.gmail("simulado", "messages/send", {}),
    /red simulada/,
  );
});
test("Gmail: cifrado autenticado con clave externa y estados OAuth irreversibles", async () => {
  const key = Buffer.alloc(32, 7).toString("base64"),
    store = await vault(key);
  const a = await store.encrypt("REFRESH_SIMULADO"),
    b = await store.encrypt("REFRESH_SIMULADO");
  assert.notEqual(a, b);
  assert.equal(await store.decrypt(a), "REFRESH_SIMULADO");
  const other = await vault(Buffer.alloc(32, 8).toString("base64"));
  await assert.rejects(other.decrypt(a));
  assert.equal((await digest("estado simulado")).length, 64);
});
