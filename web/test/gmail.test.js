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

test("Gmail manual: conserva ligas de ventana emergente y sus identificadores sin perder precisión", () => {
  const decimal = "1870123456789012345";
  const popout = `https://mail.google.com/mail/u/0/popout?ver=ejemplo&search=inbox&th=%23thread-f:${decimal}&cvid=1`;
  assert.equal(gmailLink(popout), popout);
  assert.equal(
    new URL(gmailLink(popout)).searchParams.get("th"),
    "#thread-f:" + decimal,
  );
  assert.equal(manualPreview(values, popout).threadUrl, popout);
  for (const thread of [
    "thread-a:1870123456789012345",
    "1a0123456789abcd",
    "FMfcSimulado",
  ])
    assert.equal(
      gmailLink(`https://mail.google.com/mail/u/1/popout?th=${thread}`),
      `https://mail.google.com/mail/u/1/popout?th=${thread}`,
    );
});

test("Gmail manual: acepta consultas, búsquedas, etiquetas y rutas de Gmail sin índice de cuenta", () => {
  for (const link of [
    "https://mail.google.com/mail/u/1/?tab=rm&ogbl#inbox/FMfcSimulado",
    "https://mail.google.com/mail/u/0/#search/cliente%40ejemplo.test/FMfcSimulado",
    "https://mail.google.com/mail/u/0/#label/Clientes/Logistica/FMfcSimulado",
    "https://mail.google.com/mail/u/0/#label/Clientes%2FLogistica/FMfcSimulado",
    "https://mail.google.com/mail/#sent/1a0123456789abcd",
    "https://mail.google.com/mail/u/0/#snoozed/FMfcSimulado",
  ])
    assert.equal(gmailLink("  " + link + "  "), link);
  const unicodeLabel =
    "https://mail.google.com/mail/u/0/#label/Operación/FMfcSimulado";
  assert.equal(gmailLink(unicodeLabel), new URL(unicodeLabel).href);
});

test("Gmail manual: una bandeja, búsqueda sin hilo o ventana incompleta explica qué falta", () => {
  for (const link of [
    "https://mail.google.com/mail/u/0/?tab=rm&ogbl#inbox",
    "https://mail.google.com/mail/u/0/#search/cliente",
    "https://mail.google.com/mail/u/0/#label/Clientes",
    "https://mail.google.com/mail/u/0/#inbox/",
  ])
    assert.throws(() => gmailLink(link), /Abre la conversación/);
  for (const link of [
    "https://mail.google.com/mail/u/0/popout?search=inbox",
    "https://mail.google.com/mail/u/0/popout?th=",
    "https://mail.google.com/mail/u/0/popout?th=%23thread-f:1&th=%23thread-f:2",
  ])
    assert.throws(() => gmailLink(link), /ventana emergente/);
});

test("Gmail manual: rechaza otros sitios, credenciales, rutas desconocidas y direcciones mal formadas", () => {
  for (const link of [
    "",
    "no es una liga",
    "https://mail.google.com/" + "a".repeat(2000),
    "http://mail.google.com/mail/u/0/#inbox/FMfcSimulado",
    "https://mail.google.com:8443/mail/u/0/#inbox/FMfcSimulado",
    "https://usuario@mail.google.com/mail/u/0/#inbox/FMfcSimulado",
    "https://mail.google.com.ejemplo.test/mail/u/0/popout?th=123",
    "https://accounts.google.com/mail/u/0/#inbox/FMfcSimulado",
    "https://mail.google.com/otra-ruta/#inbox/FMfcSimulado",
    "https://mail.google.com/mail/u/0/#inbox/ab\ncd",
    "https://mail.google.com/mail/u/0/#inbox/<script>",
    "https://mail.google.com/mail/u/0/#label/" +
      "ó".repeat(400) +
      "/FMfcSimulado",
  ])
    assert.throws(() => gmailLink(link));
});
