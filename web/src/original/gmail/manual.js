/** Reglas del correo manual. No consultan Google ni envían mensajes. */
export function gmailLink(value) {
  const text = String(value || "").trim();
  if (
    text.length > 2000 ||
    !/^https:\/\/mail\.google\.com\/mail\/u\/\d+\/#(?:inbox|all|sent|starred|important|label\/[^/?#\s]+)\/[A-Za-z0-9_-]+$/.test(
      text,
    )
  )
    throw Error("Pega la liga completa de un hilo abierto en Gmail.");
  return text;
}
function emails(value, required = false) {
  const result = [
    ...new Set(
      String(value || "")
        .split(/[,;]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].sort();
  if (
    (required && !result.length) ||
    result.length > 30 ||
    result.some(
      (x) =>
        x.length > 254 ||
        !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
          x,
        ),
    )
  )
    throw Error("Escribe direcciones de correo válidas separadas por comas.");
  return result;
}
export function manualPreview(values, url) {
  const from = emails(values.from, true);
  if (from.length !== 1) throw Error("Indica un solo remitente.");
  const subject = String(values.subject || "").trim(),
    body = String(values.body || "").trim();
  if (!subject || subject.length > 300 || /[\r\n\0]/.test(subject))
    throw Error("Indica un asunto de hasta 300 caracteres.");
  if (!body || body.length > 7000 || body.includes("\0"))
    throw Error("Escribe un mensaje de hasta 7000 caracteres.");
  const to = emails(values.to, true),
    cc = emails(values.cc).filter((x) => !to.includes(x));
  const preview = {
    from: from[0],
    to,
    cc,
    subject,
    body,
    threadUrl: gmailLink(url),
  };
  if (manualRecord(preview).length > 10000)
    throw Error(
      "El correo completo supera el límite del historial. Reduce el texto o los destinatarios.",
    );
  return preview;
}
export function manualRecord(p) {
  return `Gmail manual · confirmación del usuario\nRemitente: ${p.from}\nPara: ${p.to.join(", ")}\nCC: ${p.cc.join(", ") || "Sin CC"}\nAsunto: ${p.subject}\nHilo: ${p.threadUrl}\n\n${p.body}`;
}
