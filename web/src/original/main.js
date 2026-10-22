import { createClient } from "@supabase/supabase-js";
import template from "./index.template.html?raw";
import styles from "./panel-styles.css?raw";
import theme from "./theme-light.css?raw";
import script from "./panel-source.js";
import config from "./config.js";
import { originalPage } from "./page.js";
import { createOriginalApi } from "./api/index.js";
import * as content from "./content.js";
import * as people from "./people.js";
import * as files from "./files.js";
import * as guidance from "./guidance.js";
import guidanceStyles from "./guidance.css?raw";
import * as usability from "./usability.js";
import usabilityStyles from "./usability.css?raw";
import * as history from "./history.js";
import * as validation from "./validation.js";
import * as dialogs from "./dialogs.js";
import { mountOrganization } from "./organization.js";
import organizationStyles from "./organization.css?raw";
import * as rendering from "./rendering.js";
import * as network from "./network.js";
import * as calendar from "./calendar.js";
import * as notices from "./notice-scope.js";
import * as loadOrder from "./load-order.js";
import * as taskTime from "./task-time.js";

/** Arranque único: la presentación original usa una sesión Supabase para todos sus módulos. */
async function start() {
  const client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  const api = createOriginalApi(client);
  window.panelApi = api;
  window.panelDialogs = dialogs;
  window.panelRendering = rendering;
  window.panelLoadOrder = loadOrder;
  window.panelTaskTime = taskTime;
  window.panelNetwork = network;
  window.panelPeople = people;
  window.panelContent = content;
  window.panelFiles = files;
  window.panelGuidance = guidance;
  window.panelUsability = usability;
  window.panelHistory = history;
  window.panelCalendar = calendar;
  window.panelNotices = notices;
  window.panelValidation = validation;
  const view = "internal";
  const page = originalPage({
    template,
    theme,
    styles:
      styles +
      "\n" +
      guidanceStyles +
      "\n" +
      usabilityStyles +
      "\n" +
      organizationStyles,
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
  if (view === "internal") usability.mountUsability(document);
  validation.mountValidation(document);
  for (const source of page.scripts) {
    const tag = document.createElement("script");
    tag.textContent = source;
    document.body.append(tag);
  }
  if (view === "internal") {
    guidance.mountGuidance(document);
    mountOrganization(api, document);
  }
}
start().catch((error) => {
  // textContent evita interpretar mensajes del servidor como HTML.
  document.body.textContent = `No se pudo abrir el panel: ${error.message}`;
});
