/** Reglas puras compartidas por el servidor y las pruebas; no llaman a Google. */
export function addresses(value) {
  const result = String(value || "")
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (
    result.length > 30 ||
    result.some(
      (x) =>
        !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
          x,
        ),
    )
  )
    throw Error(
      "Usa direcciones de correo separadas por comas, sin nombres ni saltos de línea.",
    );
  return [...new Set(result.map((x) => x.toLowerCase()))];
}
export function header(value) {
  const text = String(value || "");
  if (!text || /[\r\n\x00]/.test(text) || text.length > 998)
    throw Error("Encabezado de correo inválido.");
  return text;
}
export function prepareReply({ thread, from, to, cc, body }) {
  if (!/^[a-f0-9]+$/i.test(thread.id))
    throw Error("Selecciona un hilo desde la búsqueda de Gmail.");
  const messages = thread.messages || [];
  const last = [...messages]
    .reverse()
    .find((m) => !m.labelIds?.includes("DRAFT"));
  const headers = last?.payload?.headers || [];
  const get = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    "";
  const messageId = header(get("Message-ID"));
  if (!/^<[^<>\s]+>$/.test(messageId))
    throw Error(
      "El mensaje original no tiene un identificador válido para responder.",
    );
  const text = String(body || "").trim();
  if (!text || text.length > 20000 || text.includes("\0"))
    throw Error("Escribe un mensaje de hasta 20000 caracteres.");
  const recipients = addresses(to),
    copies = addresses(cc).filter((x) => !recipients.includes(x));
  if (!recipients.length) throw Error("Indica al menos un destinatario.");
  header(recipients.join(", "));
  if (copies.length) header(copies.join(", "));
  const sender = addresses(from);
  if (sender.length !== 1) throw Error("Remitente de Gmail inválido.");
  const subject = header(get("Subject") || "Sin asunto");
  return {
    from: sender[0],
    to: recipients,
    cc: copies,
    body: text,
    subject: /^re:/i.test(subject) ? subject : "Re: " + subject,
    threadId: thread.id,
    inReplyTo: messageId,
    references: [
      ...new Set(
        (get("References").match(/<[^<>\s]+>/g) || []).concat(messageId),
      ),
    ]
      .slice(-15)
      .join(" "),
  };
}
const base64 = (text) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)));
function encodedSubject(value) {
  // Cada palabra codificada respeta el límite MIME y conserva completos los caracteres UTF-8.
  const parts = [];
  let part = "";
  for (const char of value) {
    if (new TextEncoder().encode(part + char).length > 42) {
      parts.push(part);
      part = "";
    }
    part += char;
  }
  if (part) parts.push(part);
  return parts.map((text) => "=?UTF-8?B?" + base64(text) + "?=").join("\r\n ");
}
export function rawReply(preview, id) {
  // El Message-ID estable permite reconciliar una respuesta perdida sin volver a enviar.
  const lines = [
    "From: " + header(preview.from),
    "To: " + header(preview.to.join(", ")),
  ];
  if (preview.cc.length) lines.push("Cc: " + header(preview.cc.join(", ")));
  lines.push(
    "Subject: " + encodedSubject(preview.subject),
    "In-Reply-To: " + header(preview.inReplyTo),
    "References: " + header(preview.references),
    "Message-ID: <panel-" + id + "@panel-bajio.invalid>",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64(preview.body)
      .match(/.{1,76}/g)
      .join("\r\n"),
  );
  return base64(lines.join("\r\n"))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Solo quien ganó la reserva llama al proveedor. Un fallo posterior queda bloqueado. */
export async function deliver({ claim, send, complete, uncertain }) {
  const result = await claim();
  if (!result.claimed) return result.item;
  const item = result.item;
  try {
    const receipt = await send(item);
    if (!receipt?.id || !receipt.threadId)
      throw Error("Google no confirmó el envío.");
    return await complete(item, receipt);
  } catch (_) {
    await uncertain(item).catch(() => {});
    throw Error(
      "Resultado pendiente de verificar. No vuelvas a enviar; usa Verificar envío.",
    );
  }
}
