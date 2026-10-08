import { createClient } from "@supabase/supabase-js";
import template from "./index.template.html?raw";
import clientTemplate from "./client.template.html?raw";
import managerTemplate from "./manager.template.html?raw";
import styles from "./panel-styles.css?raw";
import script from "./panel-script.js?raw";
import config from "./config.js";
import { originalPage } from "./page.js";
import { createOriginalApi } from "./api/index.js";

/** Arranque único: la presentación original usa una sesión Supabase para todos sus módulos. */
async function start() {
  const client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  const api = createOriginalApi(client);
  window.panelApi = api;
  const portal =
    window.PANEL_VIEW ||
    new URLSearchParams(location.search).get("portal") ||
    "";
  const view = { cliente: "client", gerencia: "manager" }[portal] || "internal";
  const page = originalPage({
    template: {
      internal: template,
      client: clientTemplate,
      manager: managerTemplate,
    }[view],
    styles,
    script,
    config,
    view,
  });
  let profile;
  try {
    profile = await api.restore();
  } catch {
    profile = null;
  }
  if (view === "client" && profile?.role !== "client")
    localStorage.removeItem("portalClienteSesion");
  if (view === "manager" && !["manager", "admin"].includes(profile?.role))
    localStorage.removeItem("vistaGerenciaSesion");
  if (view === "internal" && profile?.role === "client") {
    await api.logout();
    profile = null;
  }
  // Las claves antiguas contienen únicamente un marcador. La sesión real la renueva el SDK.
  localStorage.removeItem("bajio_identity_password");
  if (
    profile &&
    view === "internal" &&
    ["admin", "csr", "manager"].includes(profile.role)
  ) {
    localStorage.setItem("bajio_identity_nombre", profile.display_name);
    localStorage.setItem("bajio_identity_token", "supabase-session");
  } else {
    localStorage.removeItem("bajio_identity_nombre");
    localStorage.removeItem("bajio_identity_token");
  }
  // Conserva los scripts del alojamiento y la escala móvil que agrega Google.
  // Retirar un script externo pendiente puede interrumpir el puente de Apps Script.
  const viewport = document.head
    .querySelector('meta[name="viewport"]')
    ?.cloneNode(true);
  for (const node of [...document.head.childNodes]) {
    if (node.nodeName !== "SCRIPT") node.remove();
  }
  const head = document.createElement("template");
  head.innerHTML = page.head;
  document.head.append(head.content);
  if (!document.head.querySelector('meta[name="viewport"]')) {
    const mobile = viewport || document.createElement("meta");
    mobile.name = "viewport";
    mobile.content = "width=device-width, initial-scale=1";
    document.head.append(mobile);
  }
  document.body.innerHTML = page.body;
  for (const source of page.scripts) {
    const tag = document.createElement("script");
    tag.textContent = source;
    document.body.append(tag);
  }
}
start().catch((error) => {
  // textContent evita interpretar mensajes del servidor como HTML.
  document.body.textContent = `No se pudo abrir el panel: ${error.message}`;
});
