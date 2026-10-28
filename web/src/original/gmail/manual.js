/** Reglas del correo manual. No consultan Google ni envían mensajes. */
export function gmailLink(value) {
  const text = String(value || "").trim();
  const invalidLink =
    "Pega la liga completa de una conversación abierta en https://mail.google.com/.";
  if (!text || text.length > 2000 || /[\s\u0000-\u001f\u007f]/.test(text))
    throw Error(invalidLink);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw Error(invalidLink);
  }
  if (
    url.href.length > 2000 ||
    url.origin !== "https://mail.google.com" ||
    url.username ||
    url.password
  )
    throw Error(invalidLink);

  const mailboxPath = /^\/mail(?:\/u\/\d+)?\/?$/.test(url.pathname);
  const popoutPath = /^\/mail(?:\/u\/\d+)?\/popout\/?$/.test(url.pathname);
  if (popoutPath) {
    // URLSearchParams decodifica %23. El identificador decimal permanece como texto:
    // convertirlo a Number puede perder precisión y abrir una conversación distinta.
    const threads = url.searchParams.getAll("th");
    if (
      threads.length === 1 &&
      /^(?:#?thread-[fa]:\d+|[A-Za-z0-9_-]+)$/.test(threads[0])
    )
      return url.href;
    throw Error(
      "La liga de la ventana emergente está incompleta. Vuelve a copiarla completa desde la conversación de Gmail.",
    );
  }
  if (!mailboxPath) throw Error(invalidLink);
  const parts = url.hash.slice(1).split("/");
  const threadId = parts.at(-1);
  const folders = [
    "inbox",
    "all",
    "sent",
    "starred",
    "important",
    "snoozed",
    "drafts",
    "spam",
    "trash",
    "scheduled",
  ];
  const folderThread = parts.length === 2 && folders.includes(parts[0]);
  const searchOrLabelThread =
    parts.length >= 3 &&
    ["search", "label"].includes(parts[0]) &&
    parts.slice(1, -1).every(Boolean);
  if (
    (folderThread || searchOrLabelThread) &&
    /^[A-Za-z0-9_-]+$/.test(threadId)
  )
    return url.href;
  throw Error(
    "Esta liga abre una bandeja o búsqueda. Abre la conversación y copia su liga completa.",
  );
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
