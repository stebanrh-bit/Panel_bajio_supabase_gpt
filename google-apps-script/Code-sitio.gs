/**
 * Panel Bajío: Google aloja la página y consulta mapas; Supabase guarda datos y cuentas.
 * Copiar este archivo al Code.gs del proyecto publicado. El HTML se llama index.
 * La clave de abajo es pública. No poner aquí una clave service_role.
 */
const SUPABASE_URL_ = "https://pwqibuunekrzfcztcfju.supabase.co";
const SUPABASE_PUBLIC_KEY_ = "sb_publishable_slNN4K-4Ak-1RqD9z0GvnA_2hgsAL9J";

/** Versión interna: todos los enlaces abren el control de cargas. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("Panel Bajío · Mis cargas")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** Recurso público fijo. No acepta rutas ni devuelve datos o credenciales. */
function panelFileReader() {
  return HtmlService.createHtmlOutputFromFile("lector").getContent();
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
    ["admin", "csr"].indexOf(profiles[0].role) < 0
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
  const result = googleRoadRoute_(origin, destination);
  if (!result) throw new Error("Google no encontró una ruta por carretera.");
  return result;
}

/** Consulta compartida por el recálculo autorizado y el proceso privado, sin duplicar llamadas. */
function googleRoadRoute_(origin, destination) {
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
  let result;
  try {
    result = Maps.newDirectionFinder()
      .setOrigin(origin.latitude, origin.longitude)
      .setDestination(destination.latitude, destination.longitude)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();
  } catch (error) {
    const failure = new Error(
      "Google no pudo calcular el trayecto en esta ejecución.",
    );
    failure.mapsCode =
      /too many times|quota|limit exceeded|daily limit|cuota/i.test(
        String(error.message || error),
      )
        ? "quota"
        : "retry";
    throw failure;
  }
  if (result.status === "ZERO_RESULTS") return null;
  if (result.status !== "OK" || !result.routes || !result.routes.length) {
    const failure = new Error(
      "Google no pudo calcular el trayecto en esta ejecución.",
    );
    failure.mapsCode = /OVER_QUERY_LIMIT|OVER_DAILY_LIMIT/.test(result.status)
      ? "quota"
      : "retry";
    throw failure;
  }
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

// ===== Millas Google en segundo plano =====
// El núcleo termina en _ y permanece privado. Los accesos visibles del editor verifican la cuenta Google.
const GOOGLE_MILES_TOKEN_PROPERTY_ = "PANEL_MAPS_WORKER_TOKEN";
const GOOGLE_MILES_LAST_RUN_PROPERTY_ = "PANEL_MAPS_LAST_RUN";
const GOOGLE_MILES_HANDLER_ = "procesarMillasGoogle_";
const GOOGLE_MILES_BATCH_ = 20;

/** Ejecutar primero en el editor. Solo imprime el hash y el SQL de vinculación, nunca el secreto. */
function prepararMillasGoogle_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000))
    throw new Error("Hay otra configuración en curso. Intenta de nuevo.");
  try {
    const properties = PropertiesService.getScriptProperties();
    let token = properties.getProperty(GOOGLE_MILES_TOKEN_PROPERTY_);
    if (!token) {
      token =
        "panel_maps_" +
        (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
      properties.setProperty(GOOGLE_MILES_TOKEN_PROPERTY_, token);
    }
    const digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      token,
      Utilities.Charset.UTF_8,
    );
    const hash = digest
      .map(function (byte) {
        return ("0" + ((byte + 256) % 256).toString(16)).slice(-2);
      })
      .join("");
    const sql =
      "insert into public.original_google_worker_config(singleton,token_hash,enabled,paused_until) values(true,'" +
      hash +
      "',true,null) on conflict(singleton) do update set token_hash=excluded.token_hash,enabled=true,paused_until=null,updated_at=now();";
    Logger.log(
      "Copia únicamente este SQL a Supabase → SQL Editor → New query → Run:\n" +
        sql,
    );
    return { configured: true }; // El secreto nunca se devuelve ni forma parte del HTML.
  } finally {
    lock.releaseLock();
  }
}

/** Llamadas con alcance limitado. No usa service_role ni guarda una sesión de una persona. */
function googleMilesRpc_(name, values) {
  if (
    [
      "ops_google_worker_claim",
      "ops_google_worker_complete",
      "ops_google_worker_status",
      "ops_worker_task_tick",
    ].indexOf(name) < 0
  )
    throw new Error("Operación de millas no permitida.");
  const token = PropertiesService.getScriptProperties().getProperty(
    GOOGLE_MILES_TOKEN_PROPERTY_,
  );
  if (!token)
    throw new Error(
      "Ejecuta prepararMillasGoogle y vincula su SQL en Supabase primero.",
    );
  const response = UrlFetchApp.fetch(SUPABASE_URL_ + "/rest/v1/rpc/" + name, {
    method: "post",
    contentType: "application/json",
    headers: { apikey: SUPABASE_PUBLIC_KEY_ },
    payload: JSON.stringify(
      Object.assign({}, values || {}, { p_token: token }),
    ),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300)
    throw new Error(
      "Supabase no aceptó la operación de millas (HTTP " +
        code +
        "). Revisa SQL 010 y la vinculación de prepararMillasGoogle.",
    );
  return JSON.parse(response.getContentText());
}

/** Activa una sola ejecución por hora para esta cuenta de Google y realiza el primer lote. */
function activarMillasGoogle_() {
  googleMilesRpc_("ops_google_worker_status"); // Verifica la instalación antes de programar o gastar cuota.
  const triggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === GOOGLE_MILES_HANDLER_;
  });
  if (!triggers.length)
    ScriptApp.newTrigger(GOOGLE_MILES_HANDLER_)
      .timeBased()
      .everyHours(1)
      .create();
  else
    triggers.slice(1).forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  Logger.log(
    "Proceso de millas programado cada hora. Se ejecutará con la cuenta que lo activó.",
  );
  return procesarMillasGoogle_();
}

/** Desactiva el activador de esta cuenta; no borra trayectos, resultados ni la conexión. */
function desactivarMillasGoogle_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === GOOGLE_MILES_HANDLER_)
      ScriptApp.deleteTrigger(trigger);
  });
  Logger.log(
    "Proceso automático desactivado para esta cuenta. Las distancias se conservan.",
  );
}

/** Resumen verificable desde el editor, sin devolver claves, direcciones ni datos personales. */
function estadoMillasGoogle_() {
  const properties = PropertiesService.getScriptProperties();
  const output = {
    triggers: ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === GOOGLE_MILES_HANDLER_;
    }).length,
    queue: googleMilesRpc_("ops_google_worker_status"),
    lastRun: JSON.parse(
      properties.getProperty(GOOGLE_MILES_LAST_RUN_PROPERTY_) || "null",
    ),
  };
  Logger.log(JSON.stringify(output));
  return output;
}

/** Lote acotado a cuatro minutos. Reservas abandonadas se liberan solas en diez minutos. */
function procesarMillasGoogle_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { status: "running" };
  const started = Date.now();
  const summary = {
    at: new Date().toISOString(),
    status: "ok",
    claimed: 0,
    completed: 0,
    noRoute: 0,
    retry: 0,
    stale: 0,
    deferred: 0,
  };
  try {
    // La actualización SQL 012 puede instalarse después del código: un fallo del turno no
    // interrumpe las millas ni registra datos personales o el secreto del worker.
    try {
      procesarTareasTurno_();
    } catch (error) {
      Logger.log("Organización del turno pendiente de vincular con SQL 012.");
    }
    const jobs = googleMilesRpc_("ops_google_worker_claim", {
      p_limit: GOOGLE_MILES_BATCH_,
    });
    if (!Array.isArray(jobs))
      throw new Error("Supabase devolvió un lote inválido.");
    summary.claimed = jobs.length;
    for (let index = 0; index < jobs.length; index++) {
      if (Date.now() - started > 4 * 60 * 1000) {
        summary.status = "time_limit";
        break;
      }
      const job = jobs[index];
      let result = null,
        outcome = "ok";
      try {
        result = googleRoadRoute_(
          { latitude: job.origin_lat, longitude: job.origin_lon },
          { latitude: job.destination_lat, longitude: job.destination_lon },
        );
        if (!result) outcome = "no_route";
        else if (
          !isFinite(result.miles) ||
          !isFinite(result.minutes) ||
          result.miles < 0 ||
          result.miles > 6000 ||
          result.minutes < 0 ||
          result.minutes > 12000
        )
          outcome = "retry";
      } catch (error) {
        outcome = error.mapsCode === "quota" ? "quota" : "retry";
      }
      // Si falla la escritura, se detiene: no informa como guardado lo que Supabase no confirmó.
      const saved = googleMilesRpc_("ops_google_worker_complete", {
        p_key: job.route_key,
        p_claim: job.claim_id,
        p_outcome: outcome,
        p_miles: outcome === "ok" ? result.miles : null,
        p_hours: outcome === "ok" ? result.minutes / 60 : null,
      });
      if (saved !== true) summary.stale++;
      else if (outcome === "ok") summary.completed++;
      else if (outcome === "no_route") summary.noRoute++;
      else summary.retry++;
      if (outcome === "quota") {
        summary.status = "quota";
        break;
      }
    }
  } catch (error) {
    // No registrar respuestas, credenciales o payloads. El editor permite verificar la vinculación por separado.
    summary.status = "connection_error";
    Logger.log(
      "No se completó el lote. Revisa la conexión de Supabase con estadoMillasGoogle.",
    );
  } finally {
    summary.deferred =
      summary.claimed -
      summary.completed -
      summary.noRoute -
      summary.retry -
      summary.stale;
    try {
      PropertiesService.getScriptProperties().setProperty(
        GOOGLE_MILES_LAST_RUN_PROPERTY_,
        JSON.stringify(summary),
      );
      // El resumen no contiene credenciales ni ubicaciones; SQL 020 lo presenta a Admin.
      try {
        googleMilesRpc_("ops_google_worker_report", { p_summary: summary });
      } catch (_) {
        Logger.log("Estado de millas disponible en el editor; instala SQL 020 para verlo en el panel.");
      }
      Logger.log(JSON.stringify(summary));
    } finally {
      lock.releaseLock();
    }
  }
  return summary;
}

/**
 * Accesos visibles en el selector del editor.
 * La publicación debe ejecutarse como su propietario (ver INSTALAR_SITIO.md).
 * Un visitante anónimo u otra cuenta activa no puede ejecutar estas acciones como el propietario.
 */
function requireGoogleMilesEditor_() {
  try {
    const active = Session.getActiveUser().getEmail();
    const effective = Session.getEffectiveUser().getEmail();
    if (active && effective && active === effective) return;
  } catch (error) {
    // Ante una identidad no disponible, rechazar antes de leer propiedades o consumir servicios.
  }
  throw new Error(
    "Abre el editor de Google Apps Script con tu cuenta para ejecutar esta acción.",
  );
}

function prepararMillasGoogle() {
  requireGoogleMilesEditor_();
  return prepararMillasGoogle_();
}

function activarMillasGoogle() {
  requireGoogleMilesEditor_();
  return activarMillasGoogle_();
}

function estadoMillasGoogle() {
  requireGoogleMilesEditor_();
  return estadoMillasGoogle_();
}

function procesarMillasGoogle() {
  requireGoogleMilesEditor_();
  return procesarMillasGoogle_();
}

function desactivarMillasGoogle() {
  requireGoogleMilesEditor_();
  return desactivarMillasGoogle_();
}

/** Organización del turno: el mismo secreto limitado autentica este lote en Supabase.
 * Crea tareas y avisos internos. El envío externo permanece desactivado hasta elegir canal.
 * La retención nunca se ejecuta en este proceso.
 */
function procesarTareasTurno_() {
  return googleMilesRpc_("ops_worker_task_tick", {});
}
function procesarTareasTurno() {
  requireGoogleMilesEditor_();
  const result = procesarTareasTurno_();
  Logger.log(JSON.stringify(result));
  return result;
}

/** Opcional: un activador propio para tareas si decides detener el de millas.
 * No activa canales externos ni borra datos. Requiere la misma vinculación SQL del worker.
 */
function activarTareasTurno() {
  requireGoogleMilesEditor_();
  googleMilesRpc_("ops_google_worker_status", {});
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "procesarTareasTurno_")
      ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("procesarTareasTurno_")
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log(
    "Organización del turno programada cada hora. No se activó envío externo.",
  );
}
