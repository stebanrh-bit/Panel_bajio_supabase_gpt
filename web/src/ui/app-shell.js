import { escapeHtml as escape } from "./html.js";
import { branding } from "./branding.js";

// Nombres e iconos del panel original; los identificadores internos no cambian los permisos.
const icons = {
  home: '<path d="M3 11.5L12 4l9 7.5M5.5 10v10h13V10M9.5 20v-6h5v6"/>',
  loads:
    '<rect x="1" y="7" width="14" height="10" rx="1.5"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="6" cy="19" r="1.8"/><circle cx="17.5" cy="19" r="1.8"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  metrics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pending:
    '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  shifts:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  reserved:
    '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
  radar:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1"/>',
  account: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="8" r="4.5"/>',
  archive: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  team: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M18 5a4 4 0 0 1 0 8M19 16a5 5 0 0 1 3 5"/>',
  templates:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  imports:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15l3 3 3-3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>',
};
export const moduleLabels = {
  home: "Inicio",
  loads: "Operación completa",
  calendar: "Calendario de la semana",
  metrics: "Indicadores",
  pending: "Pendientes de load",
  shifts: "Bitácora de turno",
  reserved: "Loads apartados",
  radar: "Radar de millas",
  account: "Mi cuenta",
  archive: "Archivo de cargas",
  team: "Gestionar CSR y clientes",
  templates: "Mis plantillas",
  imports: "Importar Excel y respaldos",
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.templates}</svg>`;

/** Recupera la barra lateral, encabezado y navegación móvil del original. */
export function appShellMarkup({
  content,
  session,
  profile,
  module,
  attentionCount = 0,
}) {
  const staff =
    session &&
    profile &&
    !["pending", "client"].includes(profile.role) &&
    profile.active !== false;
  const button = (name) =>
    `<button type="button" id="nav-${name}" data-module="${name}" class="sidebar-btn ${module === name ? "active" : ""}" title="${moduleLabels[name]}" aria-label="${moduleLabels[name]}" aria-current="${module === name ? "page" : "false"}">${icon(name)}<span class="sidebar-label">${moduleLabels[name]}</span></button>`;
  const sidebar = staff
    ? `<nav class="sidebar" id="sidebar" aria-label="Navegación rápida"><div class="sidebar-mark"><img src="${branding.sidebar}" alt="Select"></div>
    ${["home", "loads", "calendar", "metrics"].map(button).join("")}<div class="sidebar-sep"></div>
    ${["pending", "shifts", "reserved", "radar"].map(button).join("")}<div class="sidebar-tools"><div class="sidebar-sep"></div>
    ${["account", "archive", "team", "templates", ...(profile.role === "admin" ? ["imports"] : [])].map(button).join("")}</div></nav>`
    : "";
  return `<div class="app-shell">${sidebar}<div class="wrap">
    <header class="top"><div class="header-title-group"><img class="header-logo" src="${branding.header}" alt="Select"><div class="header-titles"><h1>Panel de control</h1><p class="eyebrow">Balance Scorecard Bajío</p></div></div>
    ${
      session
        ? `<div class="meta"><div class="session-chip"><span class="session-chip-avatar">${escape((profile?.display_name || session.user.email || "U").slice(0, 1).toUpperCase())}</span><span class="session-chip-name">${escape(profile?.display_name || session.user.email)}</span></div>
      ${staff ? '<button type="button" class="hdr-mini-btn" data-module="account">Cambiar contraseña</button>' : ""}<button id="logout" class="hdr-mini-btn hdr-mini-btn-danger">Cerrar sesión</button>
      ${
        staff
          ? `<button class="refresh-btn" id="header-avisos" title="Avisos y recordatorios" aria-label="Avisos y recordatorios">${icon("bell")}${attentionCount ? `<span class="avisos-badge">${attentionCount}</span>` : ""}</button>
        <button class="refresh-btn" id="header-refresh" title="Actualizar ahora" aria-label="Actualizar ahora">${icon("refresh")}</button>${profile.role === "admin" ? `<button class="refresh-btn" data-module="imports" title="Importar Excel TMS" aria-label="Importar Excel TMS">${icon("imports")}</button>` : ""}`
          : ""
      }</div>`
        : ""
    }</header>
    <main><p id="message" aria-live="polite"></p>${content}</main></div>
    ${staff ? `<nav class="barra-movil" aria-label="Navegación en celular">${["home", "loads"].map((name) => `<button data-module="${name}" class="${module === name ? "active" : ""}">${icon(name)}<span>${name === "home" ? "Inicio" : "Operación"}</span></button>`).join("")}<button id="mobile-avisos">${icon("bell")}<span>Avisos</span></button><button data-module="radar">${icon("radar")}<span>Radar</span></button><button id="mobile-more" aria-controls="sidebar" aria-expanded="false"><span aria-hidden="true">☰</span><span>Más</span></button></nav>` : ""}</div>`;
}
