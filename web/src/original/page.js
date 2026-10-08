/** Extrae HTML sin ejecutar plantillas Apps Script; Google elige la vista antes de arrancar. */
export function originalPage({
  template,
  styles = "",
  script = "",
  config,
  view = "internal",
}) {
  const scripts = [];
  let html = template;
  if (view === "internal") {
    html = html
      .replace(
        /<\?!=\s*include\('PanelEstilos'\);\s*\?>/,
        `<style>${styles}</style>`,
      )
      .replace(
        /<\?!=\s*jsonPagina_\(configPanel_\(\)\)\s*\?>/,
        JSON.stringify(config).replace(/</g, "\\u003c"),
      )
      .replace(
        /<\?!=\s*include\('PanelScript'\);\s*\?>/,
        `<script>${script}</script>`,
      );
  }
  html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_tag, body) => {
    scripts.push(body.replace(/google\.script\.run/g, "window.panelApi.run"));
    return "";
  });
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "";
  if (html.includes("<?"))
    throw Error("La plantilla original contiene instrucciones sin resolver.");
  return { head, body, scripts };
}
