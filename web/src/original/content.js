/** Texto para nodos/atributos HTML. Las etiquetas de la aplicación se construyen por separado. */
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

/** Excel no debe interpretar texto como fórmula. Un número negativo real sigue siendo numérico. */
export function csvCell(value) {
  let text = String(value ?? "");
  const numeric =
    (typeof value === "number" && Number.isFinite(value)) ||
    /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) && !numeric) text = "'" + text;
  if (/[",\r\n]/.test(text)) text = '"' + text.replaceAll('"', '""') + '"';
  return text;
}

/** Un enlace de datos solo puede abrir HTTP(S), nunca javascript:, data: u otro protocolo. */
export function safeLink(value) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
