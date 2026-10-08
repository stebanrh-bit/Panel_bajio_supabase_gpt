/**
 * Panel Bajío: Google aloja la página y consulta mapas; Supabase guarda datos y cuentas.
 * Copiar este archivo al Code.gs del proyecto publicado. El HTML se llama index.
 * La clave de abajo es pública. No poner aquí una clave service_role.
 */
const SUPABASE_URL_ = "https://pwqibuunekrzfcztcfju.supabase.co";
const SUPABASE_PUBLIC_KEY_ = "sb_publishable_slNN4K-4Ak-1RqD9z0GvnA_2hgsAL9J";

/** Solo tres vistas permitidas; no inserta parámetros arbitrarios dentro del HTML. */
function doGet(e) {
  const portal = e && e.parameter && e.parameter.portal;
  const view = ["cliente", "gerencia"].indexOf(portal) >= 0 ? portal : "";
  const bootstrap =
    "<script>window.PANEL_VIEW=" + JSON.stringify(view) + ";<\/script>";
  const html = HtmlService.createHtmlOutputFromFile("index")
    .getContent()
    .replace("<!--PANEL_VIEW-->", bootstrap);
  return HtmlService.createHtmlOutput(html)
    .setTitle(
      view === "cliente"
        ? "Portal Cliente"
        : view === "gerencia"
          ? "Vista Gerencia"
          : "Panel Bajío",
    )
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** Ejecutar desde el editor si Google necesita autorizar UrlFetch para los mapas. */
function autorizarServiciosGoogle_() {
  return UrlFetchApp.fetch(SUPABASE_URL_ + "/auth/v1/health", {
    headers: { apikey: SUPABASE_PUBLIC_KEY_ },
    muteHttpExceptions: true,
  }).getResponseCode();
}

/** Verifica el JWT en Supabase y el rol actual antes de usar la cuota de mapas. */
function requirePanelStaff_(accessToken) {
  if (
    typeof accessToken !== "string" ||
    accessToken.length > 10000 ||
    accessToken.length < 20
  )
    throw new Error("Inicia sesión para consultar mapas.");
  const options = {
    headers: {
      apikey: SUPABASE_PUBLIC_KEY_,
      Authorization: "Bearer " + accessToken,
    },
    muteHttpExceptions: true,
  };
  const response = UrlFetchApp.fetch(SUPABASE_URL_ + "/auth/v1/user", options);
  if (response.getResponseCode() !== 200)
    throw new Error("La sesión venció. Vuelve a entrar.");
  const user = JSON.parse(response.getContentText());
  if (!user.id) throw new Error("La sesión no es válida.");
  const profileResponse = UrlFetchApp.fetch(
    SUPABASE_URL_ +
      "/rest/v1/profiles?select=role,active&id=eq." +
      encodeURIComponent(user.id),
    options,
  );
  if (profileResponse.getResponseCode() !== 200)
    throw new Error("No se pudo verificar el acceso a mapas.");
  const profiles = JSON.parse(profileResponse.getContentText());
  if (
    profiles.length !== 1 ||
    profiles[0].active === false ||
    ["admin", "csr", "manager"].indexOf(profiles[0].role) < 0
  )
    throw new Error("Tu cuenta no tiene acceso a mapas.");
}

function panelGeocode(accessToken, address) {
  requirePanelStaff_(accessToken);
  if (
    typeof address !== "string" ||
    address.trim().length < 2 ||
    address.length > 300
  )
    throw new Error("Escribe una ciudad o dirección válida.");
  const normalized = address.trim();
  const key =
    "geo:" +
    Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        normalized.toLowerCase(),
      ),
    );
  const cache = CacheService.getScriptCache(),
    stored = cache.get(key);
  if (stored) return JSON.parse(stored);
  const result = Maps.newGeocoder().setLanguage("es").geocode(normalized);
  if (result.status !== "OK" || !result.results.length)
    throw new Error(
      "Google no encontró la ubicación. Usa ciudad, estado y país.",
    );
  const found = result.results[0],
    location = found.geometry.location;
  const output = {
    label: normalized,
    formatted: found.formatted_address,
    latitude: location.lat,
    longitude: location.lng,
  };
  cache.put(key, JSON.stringify(output), 21600);
  return output;
}

/** Coordenadas en orden latitud/longitud. La distancia devuelta sí es por carretera. */
function panelRoadDistance(accessToken, origin, destination) {
  requirePanelStaff_(accessToken);
  [origin, destination].forEach(function (point) {
    if (
      !point ||
      typeof point.latitude !== "number" ||
      typeof point.longitude !== "number" ||
      !isFinite(point.latitude) ||
      !isFinite(point.longitude) ||
      Math.abs(point.latitude) > 90 ||
      Math.abs(point.longitude) > 180
    )
      throw new Error("Coordenadas inválidas.");
  });
  const key =
    "route:" +
    [
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    ].join(",");
  const cache = CacheService.getScriptCache(),
    stored = cache.get(key);
  if (stored) return JSON.parse(stored);
  const result = Maps.newDirectionFinder()
    .setOrigin(origin.latitude, origin.longitude)
    .setDestination(destination.latitude, destination.longitude)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .getDirections();
  if (result.status !== "OK" || !result.routes.length)
    throw new Error("Google no encontró una ruta por carretera.");
  const totals = result.routes[0].legs.reduce(
    function (total, leg) {
      total.meters += leg.distance.value;
      total.seconds += leg.duration.value;
      return total;
    },
    { meters: 0, seconds: 0 },
  );
  const output = {
    miles: totals.meters / 1609.344,
    minutes: totals.seconds / 60,
    source: "Google Maps",
    calculated_at: new Date().toISOString(),
  };
  cache.put(key, JSON.stringify(output), 21600);
  return output;
}
