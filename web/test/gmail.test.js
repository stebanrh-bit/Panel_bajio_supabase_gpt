import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gmailLink,
  manualPreview,
  manualRecord,
} from "../src/original/gmail/manual.js";
const values = {
  from: "operador@example.com",
  to: "cliente@example.com; CLIENTE@example.com",
  cc: "cc@example.com",
  subject: "Re: Carga 123",
  body: "Entrega confirmada.\nGracias.",
};
const url = "https://mail.google.com/mail/u/0/#inbox/FMfcSimulado";
test("Gmail manual: acepta ligas modernas sin API, revisa los campos y conserva un registro legible", () => {
  const p = manualPreview(values, url);
  assert.deepEqual(p.to, ["cliente@example.com"]);
  for (const text of [p.from, p.to[0], p.cc[0], p.subject, p.body, url])
    assert.ok(manualRecord(p).includes(text));
  assert.equal(gmailLink(url), url);
  for (const bad of [
    "javascript:alert(1)",
    "https://mail.google.com.evil/mail/u/0/#inbox/abc",
    "https://usuario:clave@mail.google.com/mail/u/0/#inbox/abc",
  ])
    assert.throws(() => gmailLink(bad));
  for (const patch of [
    { from: "a@example.com,b@example.com" },
    { to: "" },
    { to: "a@example.com\r\nBcc:b@example.com" },
    { subject: "" },
    { body: "" },
  ])
    assert.throws(() => manualPreview({ ...values, ...patch }, url));
  assert.equal(
    manualRecord(
      manualPreview(
        { ...values, cc: "cliente@example.com; cc@example.com" },
        url,
      ),
    ),
    manualRecord(p),
  );
});
