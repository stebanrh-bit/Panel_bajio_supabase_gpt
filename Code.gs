/**
 * Panel Esteban Bajío — backend (Google Apps Script)
 * Base de datos: la hoja "Loads" de este mismo Google Sheet (container-bound).
 */

var SHEET_NAME = 'Loads';

var COLUMNS = [
  'load', 'customer', 'origin_city', 'origin_state', 'origin_address',
  'dest_city', 'dest_state', 'dest_address', 'pickup_appt', 'pickup_actual', 'pickup_delta_min',
  'delivery_appt', 'delivery_actual', 'delivery_delta_min', 'truck', 'trailer',
  'status', 'work_order', 'bol', 'doc_status', 'doda', 'entry', 'exportacion',
  'importacion', 'pedimentos', 'regresos', 'sobre_listo', 'loaded_miles',
  'empty_miles', 'rpm', 'charges', 'created_at', 'tracking_link', 'eta_note',
  'updated_at', 'pod_sent', 'recargos_vg', 'recordatorio_fecha', 'color',
  'salida_mexico_fecha', 'cruce_usa_fecha', 'updated_by',
  'client_notify_pending', 'client_notify_reason', 'client_notified_at', 'client_notified_by',
  'next_review_at', 'next_review_note', 'next_review_by',
  'truck_source', 'truck_manual_by', 'truck_manual_at', 'truck_vg_value',
  'trailer_source', 'trailer_manual_by', 'trailer_manual_at', 'trailer_vg_value',
  // ultima_revision_csr(_by): ya no se usan, pero se quedan para no recorrer las columnas de la hoja.
  'operacion_pais', 'llegada_planta_fecha', 'ultima_revision_csr', 'ultima_revision_csr_by',
  'siguiente_movimiento', 'etd_operativa',
  'cruce_confirmado',
  'bol_source', 'bol_manual_by', 'bol_manual_at',
  'doda_source', 'doda_manual_by', 'doda_manual_at',
  'entry_source', 'entry_manual_by', 'entry_manual_at',
  'sobre_listo_source', 'sobre_listo_manual_by', 'sobre_listo_manual_at',
  // Hora exacta en que el cliente quedó pendiente de avisar (la del ÚLTIMO cambio sin avisar, igual
  // que el tiempo de respuesta). Antes se aproximaba con updated_at, que cambia con cualquier edición.
  'client_notify_since'
];

// Estatus que cuentan como "entregado" para efectos de archivado. El panel usa esta misma lista
// (ver configPanel_: index.html se la pasa a PanelScript.html), no tiene copia propia.
var DONE_STATUSES_GS = ['Delivered', 'Completed', 'DELIVERED', 'COMPLETED', 'Entregado', 'ENTREGADO', 'Completado', 'COMPLETADO'];

// Estatus que usan el recordatorio en el panel (Descompuesta, En resguardo, Patio
// permisionario). Es la misma lista que usa el panel (ver configPanel_). Para Patio
// permisionario, la fecha del recordatorio ES la
// fecha estimada de despacho. El aviso es solo visual dentro del panel (no se manda correo).
// FIX: se había quedado sin 'Patio permisionario' en este arreglo (y en el gemelo del
// cliente), lo que rompía por completo el recordatorio de fecha estimada de despacho para
// ese estatus: saveStatus() le borraba la fecha en cuanto detectaba que el estatus "no
// necesitaba" recordatorio.
var REMINDER_STATUSES_GS = ['Descompuesta', 'En resguardo', 'Patio permisionario'];

// Días de antigüedad (desde updated_at) que debe tener una carga ya entregada y con
// POD confirmado antes de moverse a la hoja de archivo. Ajustable según necesidad.
var ARCHIVE_AFTER_DAYS = 60;

/** Marca que algo cambió en un área (loads, comentarios, pendientes, bitácora, apartados, cierres,
 * personas) — se llama al final de cada función que guarda algo. Ver getPanelCambios: el panel usa
 * estas marcas para pedir solo lo que de verdad cambió. Sin área = todas. */
function touchLastModified_(areas) {
  var props = PropertiesService.getScriptProperties();
  var ahora = String(Date.now());
  [].concat(areas || AREAS_CAMBIO_).forEach(function (a) { props.setProperty('lm_' + a, ahora); });
}

// Áreas que el panel refresca solo (cada una con su marca "lm_<área>" en las Propiedades).
var AREAS_CAMBIO_ = ['loads', 'comentarios', 'pendientes', 'bitacora', 'apartados', 'cierres', 'personas'];

/** Marca actual de cada área ('0' si nunca ha cambiado). Una sola lectura de Propiedades. */
function marcasCambios_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var out = {};
  AREAS_CAMBIO_.forEach(function (a) { out[a] = all['lm_' + a] || '0'; });
  return out;
}

/** Refresco del panel en UNA sola llamada: recibe las marcas que el panel ya conoce y regresa solo
 * los datos de las áreas cuya marca cambió (antes eran hasta 9 llamadas cada minuto). Sin cambios,
 * regresa solo las marcas. marcas vacío = traer todo (primer pedido después del login). */
var memoLogin_ = null;
function getPanelCambios(marcas, sinceMs, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Sin sesión' };
  memoLogin_ = {};
  memoLogin_[String(usuario || '').trim() + '|' + String(password || '').trim()] = check;
  try {
    marcas = marcas || {};
    var actuales = marcasCambios_();
    var datos = {};
    var cambio = function (a) { return marcas[a] !== actuales[a]; };
    if (cambio('loads')) datos.loads = getLoadsDelta(sinceMs, usuario, password);
    if (cambio('personas')) {
      datos.personas = getPersonas(usuario, password);
      datos.asignaciones = getAsignaciones(usuario, password);
      datos.seguimientos = getLoadSeguimientos(usuario, password);
    }
    if (cambio('comentarios')) datos.comentarios = getUltimosComentarios(usuario, password);
    if (cambio('pendientes')) datos.pendientes = getPendientes(usuario, password);
    if (cambio('bitacora')) datos.bitacora = getBitacoraTurno(usuario, password);
    if (cambio('apartados')) datos.apartados = getApartados(usuario, password);
    if (cambio('cierres')) datos.cierres = getCierresTurnoRecibidos(usuario, password);
    return { ok: true, marcas: actuales, datos: datos };
  } finally {
    memoLogin_ = null;
  }
}

/** Listas de estatus compartidas por el servidor y el panel. Son la ÚNICA fuente: index.html las
 * mete en la página (window.PANEL_CONFIG) y PanelScript.html las lee de ahí, así ya no pueden
 * quedar distintas entre el panel y la Vista Gerencia. */
function configPanel_() {
  return {
    DONE_STATUSES: DONE_STATUSES_GS,
    REMINDER_STATUSES: REMINDER_STATUSES_GS,
    AUTO_REVIEW_STATUSES: AUTO_REVIEW_STATUSES_GS,
    AUTO_REVIEW_HOURS: AUTO_REVIEW_HOURS_GS,
    PROBLEM_STATUSES: PROBLEM_STATUSES_GS,
    ATTENTION_DELAY_MIN: ATTENTION_DELAY_MIN_GS,
    TIMELINE_STAGES: TIMELINE_STAGES_GS
  };
}

/** Para los archivos .html: <?!= jsonPagina_(configPanel_()) ?> sin romper la etiqueta <script>. */
function jsonPagina_(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/* Funciones de mantenimiento (archivar, activadores, millas de Google, diagnóstico): solo pueden
 * correr desde el editor de Apps Script o desde su activador. Antes cualquiera con el enlace del
 * panel podía llamarlas desde la consola del navegador (google.script.run) sin contraseña.
 * - Desde el editor: el usuario activo es el dueño del script.
 * - Desde un activador: el evento trae el triggerUid de un activador real de este proyecto.
 * - Desde la página publicada (visitante anónimo o de otra cuenta): no hay usuario activo. */
function esMantenimientoPermitido_(e) {
  try {
    if (e && e.triggerUid) {
      var uid = String(e.triggerUid);
      var real = ScriptApp.getProjectTriggers().some(function (t) { return String(t.getUniqueId()) === uid; });
      if (real) return true;
    }
  } catch (err) {}
  try {
    var activo = Session.getActiveUser().getEmail();
    return !!activo && activo === Session.getEffectiveUser().getEmail();
  } catch (err2) {
    return false;
  }
}
var MANTENIMIENTO_ERROR_ = 'Esta función solo se corre desde el editor de Apps Script.';

function getImportInfo() {
  var props = PropertiesService.getScriptProperties();
  return { lastImportAt: props.getProperty('lastImportAt') || '', deshacerDisponibleDesde: props.getProperty('importBackupAt') || '' };
}

function acquireLock_(maxWaitMs, retries) {
  var lock = LockService.getScriptLock();
  var attempts = retries || 3;
  for (var i = 0; i < attempts; i++) {
    try {
      lock.waitLock(maxWaitMs || 8000);
      return lock;
    } catch (e) {
      if (i === attempts - 1) throw e;
      Utilities.sleep(250 + Math.floor(Math.random() * 400));
    }
  }
}

var LOAD_ROW_INDEX_CACHE_KEY_ = 'loadRowIndex_v1';
var LOAD_ROW_INDEX_CACHE_TTL_ = 21600; // 6h — el máximo que permite CacheService

function cachePutSeguro_(cache, key, value) {
  try {
    if (value.length < 95000) cache.put(key, value, LOAD_ROW_INDEX_CACHE_TTL_);
    else cache.remove(key);
  } catch (e) {
    // sin caché: findLoadRow_ sigue funcionando con la lectura completa
  }
}

function buildLoadRowIndex_(sheet) {
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v !== '' && v !== null) map[String(v)] = i + 2;
  }
  return map;
}

/** Regresa el número de fila (1-based) donde está "load" en la hoja Loads, o -1 si no existe.
 * Usa el índice en caché cuando puede, pero SIEMPRE verifica con una lectura de una celda antes de
 * confiar en él (ver comentario arriba) — nunca regresa una fila sin confirmar que de verdad
 * corresponde a ese load. */
function findLoadRow_(sheet, load) {
  load = String(load);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var cache = CacheService.getScriptCache();
  var raw = cache.get(LOAD_ROW_INDEX_CACHE_KEY_);
  var parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  }
  if (parsed && parsed.rowCount === lastRow && parsed.map.hasOwnProperty(load)) {
    var candidate = parsed.map[load];
    if (String(sheet.getRange(candidate, 1).getValue()) === load) {
      return candidate; // acierto de caché, verificado contra la hoja real
    }
  }
  // Caché ausente, de otro tamaño de hoja, no trae este load, o la verificación falló —
  // reconstruir el índice completo (mismo costo que el comportamiento de antes) y reintentar.
  var map = buildLoadRowIndex_(sheet);
  cachePutSeguro_(cache, LOAD_ROW_INDEX_CACHE_KEY_, JSON.stringify({ rowCount: lastRow, map: map }));
  return map.hasOwnProperty(load) ? map[load] : -1;
}

var LOAD_ROW_INDEX_NORM_CACHE_KEY_ = 'loadRowIndexNorm_v1';

function buildLoadRowIndexNormalized_(sheet) {
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var key = normalizeLoadKey_(values[i][0]);
    if (key) map[key] = i + 2;
  }
  return map;
}

/** Regresa, de un jalón, el índice {loadNormalizado: fila} completo — para los pocos casos que
 * necesitan checar VARIOS loads a la vez (addBitacoraTurno valida una lista completa) sin leer la
 * columna completa por cada uno. Se usa solo para checar EXISTENCIA, nunca para decidir en qué fila
 * escribir — para eso siempre hay que pasar por findLoadRowNormalized_(), que sí verifica cada
 * acierto contra la hoja real antes de confiar en él. */
function loadRowIndexNormalizedMap_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var cache = CacheService.getScriptCache();
  var raw = cache.get(LOAD_ROW_INDEX_NORM_CACHE_KEY_);
  var parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  }
  if (parsed && parsed.rowCount === lastRow) return parsed.map;
  var map = buildLoadRowIndexNormalized_(sheet);
  cachePutSeguro_(cache, LOAD_ROW_INDEX_NORM_CACHE_KEY_, JSON.stringify({ rowCount: lastRow, map: map }));
  return map;
}

/** Igual que findLoadRow_, pero comparando con normalizeLoadKey_ en vez de comparación exacta —
 * ver nota arriba de LOAD_ROW_INDEX_NORM_CACHE_KEY_. SIEMPRE verifica el acierto de caché contra
 * una lectura real de una celda antes de confiar en él. */
function findLoadRowNormalized_(sheet, load) {
  var key = normalizeLoadKey_(load);
  if (!key) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var cache = CacheService.getScriptCache();
  var raw = cache.get(LOAD_ROW_INDEX_NORM_CACHE_KEY_);
  var parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  }
  if (parsed && parsed.rowCount === lastRow && parsed.map.hasOwnProperty(key)) {
    var candidate = parsed.map[key];
    if (normalizeLoadKey_(sheet.getRange(candidate, 1).getValue()) === key) {
      return candidate; // acierto de caché, verificado contra la hoja real
    }
  }
  var map = buildLoadRowIndexNormalized_(sheet);
  cachePutSeguro_(cache, LOAD_ROW_INDEX_NORM_CACHE_KEY_, JSON.stringify({ rowCount: lastRow, map: map }));
  return map.hasOwnProperty(key) ? map[key] : -1;
}

var HISTORIAL_COLUMNS = ['id', 'load', 'timestamp', 'campo', 'valor_anterior', 'valor_nuevo', 'usuario'];

function getHistorialSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Historial');
  if (!sheet) {
    sheet = ss.insertSheet('Historial');
    sheet.appendRow(HISTORIAL_COLUMNS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HISTORIAL_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Da formato uniforme a un valor de celda para el historial — Date, booleano, número o texto
 * siempre se ven (y se comparan) igual, sin importar cómo haya llegado. */
function formatHistorialValor_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Mexico_City', 'yyyy-MM-dd HH:mm');
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Deja un renglón en el historial — solo si el valor de verdad cambió (si antes y después son
 * iguales, no escribe nada; evita ensuciar el historial con "guardados" que no cambiaron nada). */
function logHistorialCambio_(load, campo, valorAnterior, valorNuevo, usuario) {
  if (valorAnterior === valorNuevo) return;
  try {
    var sheet = getHistorialSheet_();
    sheet.appendRow([Utilities.getUuid(), String(load || ''), new Date(), campo, valorAnterior, valorNuevo, String(usuario || '')]);
  } catch (e) {
    // El historial es un registro de apoyo — si por lo que sea no se pudo escribir esta fila,
    // el guardado principal del campo ya se hizo y no debe fallar por esto.
  }
}

/** Guarda un valor en una celda de "Loads" y, si de verdad cambió, deja un renglón en el
 * historial de cambios (ver bloque de arriba). campoLabel es el nombre legible que se muestra
 * ahí (no el nombre interno de la columna) — p.ej. "Estatus", "Truck", "Cita de pickup". */
function setCampoConHistorial_(sheet, rowIndex, col, load, campoLabel, nuevoValor, usuario) {
  var anterior = formatHistorialValor_(sheet.getRange(rowIndex, col).getValue());
  sheet.getRange(rowIndex, col).setValue(nuevoValor);
  logHistorialCambio_(load, campoLabel, anterior, formatHistorialValor_(nuevoValor), usuario);
}

/** Historial de cambios de un load, más reciente primero — lo pinta el Load Workspace. */
function getHistorialLoad(load, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad', items: [] };
  try {
    var sheet = getHistorialSheet_();
    if (sheet.getLastRow() < 2) return { ok: true, items: [] };
    var key = normalizeLoadKey_(load);
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HISTORIAL_COLUMNS.length).getValues();
    var items = values
      .map(function (r, idx) {
        var ts = r[2];
        return {
          _origIdx: idx,
          id: String(r[0] || ''),
          load: String(r[1] || ''),
          timestamp: ts instanceof Date ? ts.toISOString() : String(ts || ''),
          campo: String(r[3] || ''),
          valor_anterior: String(r[4] || ''),
          valor_nuevo: String(r[5] || ''),
          usuario: String(r[6] || '')
        };
      })
      .filter(function (it) { return normalizeLoadKey_(it.load) === key; })
      .sort(function (a, b) {
        var byTs = new Date(b.timestamp) - new Date(a.timestamp);
        return byTs !== 0 ? byTs : (b._origIdx - a._origIdx);
      })
      .map(function (it) { delete it._origIdx; return it; });
    return { ok: true, items: items };
  } catch (err) {
    return { ok: false, error: 'No se pudo cargar el historial: ' + (err && err.message ? err.message : err), items: [] };
  }
}

/** Marca "updated_at" y "updated_by" en una fila de Loads que se acaba de modificar — usado por
 * TODAS las funciones que guardan un cambio en una carga (status, POD, recargos, truck, trailer,
 * fechas, color…), ahora que cualquier cambio exige tener sesión iniciada (ver requireLogin_).
 * Antes cada función repetía a mano "sheet.getRange(rowIndex, updatedCol).setValue(new Date())";
 * esto centraliza eso y de paso dice QUIÉN hizo el cambio. */
function stampUpdated_(sheet, rowIndex, usuario) {
  var updatedCol = COLUMNS.indexOf('updated_at') + 1;
  var updatedByCol = COLUMNS.indexOf('updated_by') + 1;
  sheet.getRange(rowIndex, updatedCol).setValue(new Date());
  sheet.getRange(rowIndex, updatedByCol).setValue(usuario || '');
}


/** V2 Communication Control: hoja de auditoría de comunicaciones con cliente. */
function getComunicacionesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Comunicaciones');
  var headers = ['id', 'load', 'timestamp', 'tipo', 'motivo', 'usuario', 'canal', 'mensaje'];
  if (!sheet) {
    sheet = ss.insertSheet('Comunicaciones');
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    var currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
    headers.forEach(function(h, i) {
      if (String(currentHeaders[i] || '').trim() !== h) sheet.getRange(1, i + 1).setValue(h);
    });
  }
  return sheet;
}

function appendComunicacion_(load, tipo, motivo, usuario, canal, mensaje) {
  var sheet = getComunicacionesSheet_();
  sheet.appendRow([
    Utilities.getUuid(),
    String(load || ''),
    new Date(),
    String(tipo || ''),
    String(motivo || ''),
    String(usuario || ''),
    String(canal || ''),
    String(mensaje || '')
  ]);
}

/** Marca una carga como pendiente de comunicación. Si ya había un pendiente, agrega el motivo
 * sin borrar el anterior, para que una segunda actualización importante no quede escondida. */
function markClientNotifyPending_(sheet, rowIndex, load, reason, usuario) {
  var pendingCol = COLUMNS.indexOf('client_notify_pending') + 1;
  var reasonCol = COLUMNS.indexOf('client_notify_reason') + 1;
  var notifiedAtCol = COLUMNS.indexOf('client_notified_at') + 1;
  var notifiedByCol = COLUMNS.indexOf('client_notified_by') + 1;
  var currentReason = String(sheet.getRange(rowIndex, reasonCol).getValue() || '').trim();
  var cleanReason = String(reason || 'Actualización operativa').trim();
  if (currentReason && currentReason.indexOf(cleanReason) === -1) cleanReason = currentReason + ' · ' + cleanReason;
  else if (currentReason) cleanReason = currentReason;
  sheet.getRange(rowIndex, pendingCol).setValue(true);
  sheet.getRange(rowIndex, reasonCol).setValue(cleanReason);
  sheet.getRange(rowIndex, notifiedAtCol).setValue('');
  sheet.getRange(rowIndex, notifiedByCol).setValue('');
  sheet.getRange(rowIndex, COLUMNS.indexOf('client_notify_since') + 1).setValue(new Date());
  appendComunicacion_(load, 'PENDIENTE', cleanReason, usuario || 'Sistema');
}

/** El CSR confirma que ya comunicó el cambio al cliente. */
function markClientNotified(load, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var pendingCol = COLUMNS.indexOf('client_notify_pending') + 1;
    var reasonCol = COLUMNS.indexOf('client_notify_reason') + 1;
    var notifiedAtCol = COLUMNS.indexOf('client_notified_at') + 1;
    var notifiedByCol = COLUMNS.indexOf('client_notified_by') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    var reason = String(sheet.getRange(rowIndex, reasonCol).getValue() || 'Actualización operativa');
    sheet.getRange(rowIndex, pendingCol).setValue(false);
    sheet.getRange(rowIndex, reasonCol).setValue('');
    sheet.getRange(rowIndex, notifiedAtCol).setValue(new Date());
    sheet.getRange(rowIndex, notifiedByCol).setValue(usuario || '');
    sheet.getRange(rowIndex, COLUMNS.indexOf('client_notify_since') + 1).setValue('');
    stampUpdated_(sheet, rowIndex, usuario);
    var revision = reiniciarRevisionTransito_(sheet, rowIndex, usuario); // avisar al cliente = revisó la carga
    appendComunicacion_(load, 'NOTIFICADO', reason, usuario);
    touchLastModified_('loads');
    return { ok: true, reason: reason, recordatorio_fecha: revision };
  } finally {
    lock.releaseLock();
  }
}


/** Registra QUÉ aviso se le mandó al cliente (canal + tipo: Retraso, Cruce, Entrega…) y deja el
 * pendiente como atendido. El texto del mensaje ya no se guarda: el historial solo dice qué fue
 * ("WhatsApp · Retraso"), no el mensaje completo. "tipo" se guarda en la columna "mensaje" de
 * Comunicaciones (los registros viejos ahí traen el texto completo). */
function registrarComunicacionCliente(load, canal, tipo, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok:false, error:check.error || 'No se pudo verificar tu identidad' };

  load = String(load || '').trim();
  canal = String(canal || 'Otro').trim();
  var mensaje = String(tipo || '').trim().slice(0, 80);
  if (!load) return { ok:false, error:'Load no válido' };
  if (!mensaje) return { ok:false, error:'Falta el tipo de aviso' };

  var reason = 'Actualización operativa';
  var savedAt = new Date();
  var lock = LockService.getScriptLock();

  // La modificación del Load es la única parte que necesita exclusión mutua.
  // tryLock evita dejar la interfaz esperando indefinidamente si otra operación está escribiendo.
  if (!lock.tryLock(5000)) {
    return { ok:false, error:'La operación está ocupada. Intenta nuevamente en unos segundos.' };
  }
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok:false, error:'Sin datos todavía' };

    var pendingCol = COLUMNS.indexOf('client_notify_pending') + 1;
    var reasonCol = COLUMNS.indexOf('client_notify_reason') + 1;
    var notifiedAtCol = COLUMNS.indexOf('client_notified_at') + 1;
    var notifiedByCol = COLUMNS.indexOf('client_notified_by') + 1;
    var row = findLoadRowNormalized_(sheet, load);
    if (row === -1) return { ok:false, error:'Load no encontrado' };

    reason = String(sheet.getRange(row, reasonCol).getDisplayValue() || 'Actualización operativa');
    sheet.getRange(row, pendingCol, 1, 4).setValues([[
      false,
      '',
      savedAt,
      String(usuario || '')
    ]]);
    sheet.getRange(row, COLUMNS.indexOf('client_notify_since') + 1).setValue('');
    stampUpdated_(sheet, row, usuario);
    var revision = reiniciarRevisionTransito_(sheet, row, usuario); // avisar al cliente = revisó la carga
    SpreadsheetApp.flush();
  } catch (err) {
    return { ok:false, error:'No se pudo actualizar el Load: ' + (err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }

  // Auditoría fuera del lock: no bloquea la actualización principal del Load.
  try {
    appendComunicacion_(load, 'ENVIADO', reason, usuario, canal, mensaje);
  } catch (auditErr) {
    // El Load ya quedó notificado; devolvemos éxito con advertencia para no duplicar el envío.
    touchLastModified_('loads');
    return {
      ok:true,
      warning:'La comunicación quedó marcada como enviada, pero no se pudo escribir el historial: ' +
        (auditErr && auditErr.message ? auditErr.message : auditErr),
      reason:reason,
      canal:canal,
      notified_at:savedAt.toISOString(),
      recordatorio_fecha:revision
    };
  }

  touchLastModified_('loads');
  return {
    ok:true,
    reason:reason,
    canal:canal,
    notified_at:savedAt.toISOString(),
    recordatorio_fecha:revision
  };
}

/** Historial de comunicación de un load para futuras vistas de auditoría/Gerencia. */
function getComunicaciones(load, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok:false, error:check.error || 'No se pudo verificar tu identidad', items:[] };

  try {
    var sheet = getComunicacionesSheet_();
    if (sheet.getLastRow() < 2) return { ok:true, items:[] };

    var key = normalizeLoadKey_(load);
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    var items = values.filter(function (r) {
      return normalizeLoadKey_(r[1]) === key;
    }).map(function (r) {
      var ts = r[2];
      return {
        id:String(r[0] || ''),
        load:String(r[1] || ''),
        timestamp:ts instanceof Date ? ts.toISOString() : String(ts || ''),
        tipo:String(r[3] || ''),
        motivo:String(r[4] || ''),
        usuario:String(r[5] || ''),
        canal:String(r[6] || ''),
        mensaje:String(r[7] || '')
      };
    }).sort(function(a,b){ return new Date(b.timestamp) - new Date(a.timestamp); });

    return { ok:true, items:items };
  } catch (err) {
    return { ok:false, error:'No se pudo cargar el historial: ' + (err && err.message ? err.message : err), items:[] };
  }
}

function getComunicacionesPorCliente(cliente, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok:false, error:check.error || 'No se pudo verificar tu identidad', items:[] };

  try {
    cliente = String(cliente || '').trim();
    if (!cliente) return { ok:false, error:'Cliente no válido', items:[] };
    var clienteKey = cliente.toLowerCase();

    var mainSheet = getSheet_();
    var mainLastRow = mainSheet.getLastRow();
    var loadsDelCliente = {};
    if (mainLastRow >= 2) {
      var loadCol = COLUMNS.indexOf('load') + 1;
      var customerCol = COLUMNS.indexOf('customer') + 1;
      var mainValues = mainSheet.getRange(2, 1, mainLastRow - 1, Math.max(loadCol, customerCol)).getValues();
      mainValues.forEach(function (row) {
        var load = row[loadCol - 1];
        var customer = String(row[customerCol - 1] || '').trim();
        if (load !== '' && load !== null && customer.toLowerCase() === clienteKey) {
          loadsDelCliente[normalizeLoadKey_(load)] = true;
        }
      });
    }
    if (!Object.keys(loadsDelCliente).length) return { ok:true, items:[], cliente:cliente };

    var sheet = getComunicacionesSheet_();
    if (sheet.getLastRow() < 2) return { ok:true, items:[], cliente:cliente };
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    var items = values.filter(function (r) {
      return !!loadsDelCliente[normalizeLoadKey_(r[1])];
    }).map(function (r) {
      var ts = r[2];
      return {
        id:String(r[0] || ''),
        load:String(r[1] || ''),
        timestamp:ts instanceof Date ? ts.toISOString() : String(ts || ''),
        tipo:String(r[3] || ''),
        motivo:String(r[4] || ''),
        usuario:String(r[5] || ''),
        canal:String(r[6] || ''),
        mensaje:String(r[7] || '')
      };
    }).sort(function(a,b){ return new Date(b.timestamp) - new Date(a.timestamp); });

    return { ok:true, items:items, cliente:cliente };
  } catch (err) {
    return { ok:false, error:'No se pudo cargar el historial del cliente: ' + (err && err.message ? err.message : err), items:[] };
  }
}

var SLA_LOOKBACK_DAYS_GS = 30;
function getSlaComunicacion(usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Sin sesión', pairs: [] };
  try {
    var sheet = getComunicacionesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, pairs: [] };
    var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues(); // id, load, timestamp, tipo, motivo, usuario, canal, mensaje
    var cutoff = new Date(Date.now() - SLA_LOOKBACK_DAYS_GS * 24 * 60 * 60 * 1000);
    var byLoad = {};
    values.forEach(function (row) {
      var ts = row[2];
      if (!(ts instanceof Date) || ts < cutoff) return;
      var load = String(row[1] || '').trim();
      if (!load) return;
      if (!byLoad[load]) byLoad[load] = [];
      byLoad[load].push({ ts: ts, tipo: String(row[3] || '').toUpperCase() });
    });
    var pairs = [];
    Object.keys(byLoad).forEach(function (load) {
      // La hoja ya se escribe en orden cronológico (appendComunicacion_ hace appendRow), pero se
      // ordena de todos modos por si algún día se edita/importa a mano.
      var events = byLoad[load].sort(function (a, b) { return a.ts - b.ts; });
      var openPendingTs = null;
      events.forEach(function (ev) {
        if (ev.tipo === 'PENDIENTE') {
          // Decisión de Esteban (oct 2026): el tiempo se mide desde el ÚLTIMO cambio sin avisar,
          // no desde el primero — una PENDIENTE nueva reinicia el reloj, igual que en el panel.
          openPendingTs = ev.ts;
        } else if ((ev.tipo === 'NOTIFICADO' || ev.tipo === 'ENVIADO') && openPendingTs) {
          var minutes = (ev.ts.getTime() - openPendingTs.getTime()) / 60000;
          if (minutes >= 0) pairs.push({ load: load, minutes: minutes, resolvedAt: ev.ts.toISOString() });
          openPendingTs = null;
        }
      });
    });
    return { ok: true, pairs: pairs };
  } catch (err) {
    return { ok: false, error: 'No se pudo calcular el tiempo de respuesta: ' + (err && err.message ? err.message : err), pairs: [] };
  }
}

function doGet(e) {
  var param = (e && e.parameter && e.parameter.portal) || '';
  var page = 'index';
  var title = 'Panel Esteban Bajío';
  if (param === 'cliente') {
    page = 'PortalCliente';
    title = 'Portal de Seguimiento';
  } else if (param === 'gerencia') {
    page = 'VistaGerencia';
    title = 'Vista Gerencia';
  }
  return HtmlService.createTemplateFromFile(page)
    .evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Normaliza un valor de "load" para poder compararlo de forma confiable, sin importar
 * si llega como número, texto, con espacios o con un ".0" de más (cosas que cambian
 * de un archivo del TMS a otro). Así nunca se duplica un load por un problema de formato.
 */
function normalizeLoadKey_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  if (s === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    var n = Number(s);
    if (!isNaN(n)) return String(n);
  }
  return s;
}

/** Convierte una cita (pickup_appt/delivery_appt) a su instante real en milisegundos, sin
 * importar si llega como objeto Date (así la regresa sheet.getValues()) o como texto/ISO
 * (así llega del Excel vía importLoads). null si está vacía o no se puede interpretar como
 * fecha. Usado por apptChanged_ para comparar por el VALOR, no por el formato de texto. */
function apptTimestamp_(v) {
  if (v === null || v === undefined || v === '') return null;
  var d = (v instanceof Date) ? v : new Date(v);
  var t = d.getTime();
  return isNaN(t) ? null : t;
}

/** ¿Cambió de verdad una cita entre lo que trae el Excel y lo que ya había en la hoja? Compara
 * el instante real (ver apptTimestamp_), no el texto — una misma hora escrita distinto
 * (Date de Apps Script vs. string del Excel) no cuenta como cambio. */
function apptChanged_(newVal, oldVal) {
  var nt = apptTimestamp_(newVal), ot = apptTimestamp_(oldVal);
  if (nt === null && ot === null) return false;
  return nt !== ot;
}

/** Devuelve (y crea si hace falta) la hoja "Loads" con encabezados. */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  } else {
    // Migración: si se agregaron columnas nuevas al final de COLUMNS, asegura que existan en la hoja.
    var lastCol = sheet.getLastColumn();
    if (lastCol < COLUMNS.length) {
      sheet.getRange(1, lastCol + 1, 1, COLUMNS.length - lastCol).setValues([COLUMNS.slice(lastCol)]);
    }
  }
  return sheet;
}

/** Lee todas las filas de la hoja y las regresa como arreglo de objetos. */
/** Cuenta cuántas incidencias tiene registradas cada load, en una sola lectura de la hoja
 * "Incidencias" (en vez de una llamada por carga) — usado por getLoads() para mostrar el
 * contador en el botón "Incidencias" del panel sin pedir nada extra por carga. */
function getIncidenciasCounts_() {
  var sheet = getIncidenciasSheet_();
  var lastRow = sheet.getLastRow();
  var counts = {};
  if (lastRow < 2) return counts;
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // id, load
  values.forEach(function (row) {
    if (row[0] === '' || row[0] === null) return;
    var key = String(row[1]);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

/** Convierte una fila cruda de la hoja Loads (arreglo alineado con COLUMNS) en el objeto que
 * espera el panel — etapa del timeline, alerta automática y contador de incidencias incluidos.
 * Extraído de getLoads() para que getLoadsDelta() (refresco incremental) arme exactamente los
 * mismos objetos para las cargas que sí cambiaron, sin duplicar esta lógica aparte y arriesgar
 * que las dos versiones se desalineen con el tiempo. */
function buildLoadObj_(row, incidenciasCounts) {
  var obj = {};
  COLUMNS.forEach(function (col, i) { obj[col] = row[i]; });
  // Etapa del timeline + alerta automática — mismo motor que ya usan Portal Cliente y Vista
  // Gerencia (ver deriveTimelineStage_/deriveAlertLevel_), para que el panel interno muestre
  // la misma señal de urgencia en vez de solo el borde rojo genérico de "needsAttention".
  var stageIndex = deriveTimelineStage_(obj);
  var alert = deriveAlertLevel_(obj, stageIndex);
  obj.stageIndex = stageIndex;
  obj.stageKey = TIMELINE_STAGES_GS[stageIndex].key;
  obj.stageLabel = TIMELINE_STAGES_GS[stageIndex].label;
  obj.alertLevel = alert.level;
  obj.alertMessage = alert.message;
  obj.incidenciasCount = (incidenciasCounts && incidenciasCounts[String(obj.load)]) || 0;
  return obj;
}

/* FIX: seguridad — antes cualquier función "pública" de este archivo se podía llamar desde el
 * navegador (google.script.run) sin haber iniciado sesión: getLoads() entregaba TODAS las cargas
 * de todos los clientes a quien tuviera el enlace del panel, aunque nunca pasara del login. Las
 * lecturas ahora exigen sesión (nombre + contraseña o token, ver requireLogin_) y, sin ella,
 * regresan vacío del mismo tipo que siempre (para que el panel no truene antes del login). La
 * lectura en sí vive en leerLoads_(), privada (el "_" final la oculta de google.script.run), y la
 * siguen usando getLoadsDelta() y el resto del servidor tal cual. */
function sesionOk_(usuario, password) {
  return requireLogin_(usuario, password).ok;
}

function getLoads(usuario, password) {
  if (!sesionOk_(usuario, password)) return [];
  return leerLoads_();
}

function leerLoads_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  var incidenciasCounts = getIncidenciasCounts_();
  var result = values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(function (row) { return buildLoadObj_(row, incidenciasCounts); });
  return JSON.parse(JSON.stringify(result));
}

/** FIX: "refresco incremental" — a petición de Esteban (ver la conversación sobre eficientar
 * velocidad/UX; segunda de las dos optimizaciones, junto con findLoadRow_/buildLoadRowIndex_ más
 * arriba). Antes, cada vez que autoRefresh() detectaba un cambio (hoy: vía getPanelCambios), el
 * panel pedía getLoads() COMPLETO otra vez — TODAS las columnas de TODAS las cargas, aunque solo
 * una sola hubiera cambiado un campo. getLoadsDelta() resuelve esto en dos pasos:
 *  1) Lee solo las columnas "load" y "updated_at" de TODA la hoja — una lectura angosta (2
 *     columnas en vez de las ~60+ de COLUMNS), para (a) saber qué cargas existen ahora mismo en
 *     el servidor, así se detectan las que ya no están (por ejemplo, se archivaron) y (b) ver
 *     cuáles tienen updated_at más reciente que sinceMs (el momento del último refresco exitoso
 *     del panel que pregunta).
 *  2) Solo para esas filas que de verdad cambiaron (normalmente muy pocas) se leen las columnas
 *     completas — igual que hacía getLoads() para todas.
 * El panel (ver mergeLoadsDelta_/aplicarCambiosPanel_ en PanelScript.html) combina esto con lo que ya
 * tenía en memoria en vez de reemplazar todo. Una carga que no cambió nunca se vuelve a leer ni
 * a tocar — se conserva tal cual estaba en el navegador.
 *
 * Importante para que esto nunca muestre datos viejos: CUALQUIER función que modifique un campo
 * de una carga debe llamar a stampUpdated_() sobre esa fila (casi todas ya lo hacían, por el badge
 * de "Última actualización"; se completaron las pocas que faltaban — saveNextReview,
 * clearNextReview — precisamente para que este refresco incremental no se
 * los saltara).
 *
 * Casos borde, resueltos cayendo de vuelta a getLoads() completo (nunca se arriesga mostrar datos
 * a medias): sinceMs ausente o inválido (primera carga del panel, no hay "desde cuándo" todavía),
 * hoja vacía, o más de la mitad de las cargas cambiadas (ej. una importación grande de Excel) —
 * en ese caso leer todo de una vez sale más barato que muchas lecturas sueltas. */
function getLoadsDelta(sinceMs, usuario, password) {
  // Sin sesión: lista vacía con ts 0, así el primer pedido después del login es completo.
  if (!sesionOk_(usuario, password)) return { full: true, ts: 0, loads: [], ok: false };
  var nowTs = Date.now();
  sinceMs = Number(sinceMs);
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { full: true, ts: nowTs, loads: [] };
  if (!sinceMs || isNaN(sinceMs)) {
    return { full: true, ts: nowTs, loads: leerLoads_() };
  }

  var loadCol = COLUMNS.indexOf('load') + 1;
  var updatedCol = COLUMNS.indexOf('updated_at') + 1;
  var minCol = Math.min(loadCol, updatedCol);
  var maxCol = Math.max(loadCol, updatedCol);
  // Lectura angosta: todas las filas, solo estas 2 columnas (nunca las ~60+ completas).
  var narrow = sheet.getRange(2, minCol, lastRow - 1, maxCol - minCol + 1).getValues();
  var loadOffset = loadCol - minCol;
  var updatedOffset = updatedCol - minCol;

  var currentLoads = [];
  var changedRows = []; // filas (1-based de la hoja) que cambiaron desde sinceMs
  for (var i = 0; i < narrow.length; i++) {
    var loadVal = narrow[i][loadOffset];
    if (loadVal === '' || loadVal === null) continue;
    var key = String(loadVal);
    currentLoads.push(key);
    var updatedVal = narrow[i][updatedOffset];
    var updatedMs = (updatedVal instanceof Date) ? updatedVal.getTime() : (updatedVal ? new Date(updatedVal).getTime() : NaN);
    if (isNaN(updatedMs) || updatedMs >= sinceMs) {
      changedRows.push(i + 2);
    }
  }

  // Caso borde: demasiados cambios (ej. importación grande) — sale más barato traer todo junto.
  if (changedRows.length > narrow.length * 0.5) {
    return { full: true, ts: nowTs, loads: leerLoads_() };
  }

  var incidenciasCounts = changedRows.length ? getIncidenciasCounts_() : {};
  var updated = changedRows.map(function (rowIndex) {
    var row = sheet.getRange(rowIndex, 1, 1, COLUMNS.length).getValues()[0];
    return buildLoadObj_(row, incidenciasCounts);
  });

  return {
    full: false,
    ts: nowTs,
    updated: JSON.parse(JSON.stringify(updated)),
    currentLoads: currentLoads
  };
}

/**
 * Recibe un arreglo de registros ya parseados y filtrados (solo cargas de nuestro equipo)
 * desde el HTML (que los sacó del Excel con SheetJS), y hace upsert por número de load.
 * Preserva tracking_link, eta_note y pod_sent si ya existían (el import nunca los trae).
 * El status NUNCA se toma del Excel: es siempre manual (se guarda con saveStatus desde el
 * panel); en cada import se conserva tal cual estaba, y en una carga nueva queda vacío
 * hasta que alguien lo asigne a mano.
 * Truck, trailer, pickup cita y entrega cita sí vienen del Excel, pero con prioridad del
 * sistema sobre lo capturado a mano en el panel (ver saveTruck/saveTrailer/savePickupAppt/
 * saveDeliveryAppt): si el Excel de ese día SÍ trae un valor para ese load, ese valor gana
 * (así se refleja la información real en cuanto el documento la reporte). Si el Excel no trae
 * nada para ese campo (vacío), se conserva lo que se haya capturado a mano mientras tanto —
 * así no se pierde algo que alguien anotó en el panel durante el día, antes de que el
 * documento lo reporte en la importación de la mañana siguiente.
 * El match se hace con normalizeLoadKey_ (no comparación directa) para que un mismo load
 * nunca se duplique aunque el Excel de un día a otro lo traiga con formato distinto
 * (número vs texto, espacios, "834545.0", etc.), y también se protege contra que el
 * propio archivo traiga el mismo load repetido dos veces en una sola carga.
 */
/** ¿Dos celdas de Loads guardan lo mismo? Compara por valor, no por formato: la fila vieja
 * viene de getValues() (Date, número, booleano) y la nueva del Excel (texto/ISO), así que
 * "2026-10-03 14:56" vs Date de esa misma hora, "2.40" vs 2.4 o '' vs false cuentan como iguales. */
function celdaIgual_(a, b) {
  var vacio = function (v) { return v === '' || v === null || v === undefined || v === false; };
  if (vacio(a) && vacio(b)) return true;
  if (vacio(a) !== vacio(b)) return false;
  if (a instanceof Date || b instanceof Date) {
    var ta = apptTimestamp_(a), tb = apptTimestamp_(b);
    if (ta !== null && tb !== null) return ta === tb;
  }
  var sa = String(a).trim(), sb = String(b).trim();
  if (sa === sb) return true;
  if (sa !== '' && sb !== '' && !isNaN(Number(sa)) && !isNaN(Number(sb))) return Number(sa) === Number(sb);
  return false;
}

/** true si las dos filas son iguales en todas las columnas excepto updated_at. */
function filaIgualSinUpdated_(nueva, vieja, updatedAtIdx) {
  for (var i = 0; i < nueva.length; i++) {
    if (i === updatedAtIdx) continue;
    if (!celdaIgual_(nueva[i], vieja[i])) return false;
  }
  return true;
}

/** Escribe {fila: valores} agrupando las filas consecutivas en un solo setValues por bloque. */
function escribirFilasPorBloques_(sheet, porFila) {
  var filas = Object.keys(porFila).map(Number).sort(function (a, b) { return a - b; });
  var i = 0;
  while (i < filas.length) {
    var inicio = filas[i], bloque = [porFila[inicio]];
    while (i + 1 < filas.length && filas[i + 1] === filas[i] + 1) {
      i++;
      bloque.push(porFila[filas[i]]);
    }
    sheet.getRange(inicio, 1, bloque.length, COLUMNS.length).setValues(bloque);
    i++;
  }
}

/** Importa el Excel (escribe en Loads). Ver importarLoads_. */
function importLoads(records, adminPw) {
  return importarLoads_(records, adminPw, true);
}

/** Vista previa de la importación: calcula exactamente lo mismo que importLoads pero no escribe
 * nada — el panel la muestra para que quien importa confirme antes de guardar. */
function previewImport(records, adminPw) {
  return importarLoads_(records, adminPw, false);
}

var IMPORT_BACKUP_SHEET_ = 'Loads_RespaldoImport';

/** Copia Loads tal como estaba justo antes de importar, para poder deshacer la importación. */
function respaldarLoadsAntesDeImportar_(values) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var b = ss.getSheetByName(IMPORT_BACKUP_SHEET_) || ss.insertSheet(IMPORT_BACKUP_SHEET_);
  var last = b.getLastRow();
  if (last > 0) b.getRange(1, 1, last, Math.max(b.getLastColumn(), COLUMNS.length)).clearContent();
  b.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  if (values.length) b.getRange(2, 1, values.length, COLUMNS.length).setValues(values);
  PropertiesService.getScriptProperties().setProperty('importBackupAt', new Date().toISOString());
}

/** Regresa Loads a como estaba antes de la última importación. Solo se puede una vez por
 * importación. OJO: cualquier cambio que el equipo haya hecho en Loads DESPUÉS de esa
 * importación también se pierde — el panel lo advierte antes de confirmar. */
function deshacerUltimaImportacion(adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  var props = PropertiesService.getScriptProperties();
  var desde = props.getProperty('importBackupAt');
  var b = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(IMPORT_BACKUP_SHEET_);
  if (!desde || !b) return { ok: false, error: 'No hay una importación que deshacer' };
  var lock = acquireLock_(20000, 3);
  try {
    var sheet = getSheet_();
    var respaldo = b.getLastRow() >= 2 ? b.getRange(2, 1, b.getLastRow() - 1, COLUMNS.length).getValues() : [];
    var actuales = sheet.getLastRow();
    if (actuales >= 2) sheet.getRange(2, 1, actuales - 1, COLUMNS.length).clearContent();
    if (respaldo.length) sheet.getRange(2, 1, respaldo.length, COLUMNS.length).setValues(respaldo);
    props.deleteProperty('importBackupAt');
    props.deleteProperty('lastImportAt');
    touchLastModified_('loads');
    logAdmin_(adminPw, 'Deshizo la última importación', respaldo.length + ' cargas restauradas');
    return { ok: true, restauradas: respaldo.length, desde: desde };
  } finally {
    lock.releaseLock();
  }
}

function importarLoads_(records, adminPw, aplicar) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  var lock = acquireLock_(15000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    var existing = {};
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
      values.forEach(function (row, idx) {
        var key = normalizeLoadKey_(row[0]);
        if (key) existing[key] = { rowIndex: idx + 2, data: row };
      });
    }

    var now = new Date();
    var inserted = 0, updated = 0, skipped = 0, sinCambios = 0;
    var vistosEnArchivo = {}, duplicadosEnArchivo = [], citasMovidas = 0;
    var filasCambiadas = {}; // {númeroDeFila: fila} — se escriben al final, por bloques
    var filasNuevas = [];     // se agregan al final en una sola llamada
    var comunicacionesNuevas = [];
    var trackingLinkIdx = COLUMNS.indexOf('tracking_link');
    var etaNoteIdx = COLUMNS.indexOf('eta_note');
    var podSentIdx = COLUMNS.indexOf('pod_sent');
    var recargosVgIdx = COLUMNS.indexOf('recargos_vg');
    var statusIdx = COLUMNS.indexOf('status');
    var recordatorioFechaIdx = COLUMNS.indexOf('recordatorio_fecha');
    var truckIdx = COLUMNS.indexOf('truck');
    var trailerIdx = COLUMNS.indexOf('trailer');
    var pickupApptIdx = COLUMNS.indexOf('pickup_appt');
    var deliveryApptIdx = COLUMNS.indexOf('delivery_appt');
    var salidaMexicoFechaIdx = COLUMNS.indexOf('salida_mexico_fecha');
    var cruceUsaFechaIdx = COLUMNS.indexOf('cruce_usa_fecha');
    var colorIdx = COLUMNS.indexOf('color');
    var notifyPendingIdx = COLUMNS.indexOf('client_notify_pending');
    var notifyReasonIdx = COLUMNS.indexOf('client_notify_reason');
    var notifiedAtIdx = COLUMNS.indexOf('client_notified_at');
    var notifiedByIdx = COLUMNS.indexOf('client_notified_by');
    var notifySinceIdx = COLUMNS.indexOf('client_notify_since');
    var truckSourceIdx = COLUMNS.indexOf('truck_source');
    var truckManualByIdx = COLUMNS.indexOf('truck_manual_by');
    var truckManualAtIdx = COLUMNS.indexOf('truck_manual_at');
    var trailerSourceIdx = COLUMNS.indexOf('trailer_source');
    var trailerManualByIdx = COLUMNS.indexOf('trailer_manual_by');
    var trailerManualAtIdx = COLUMNS.indexOf('trailer_manual_at');

    records.forEach(function (rec) {
      var key = normalizeLoadKey_(rec.load);
      if (!key) { skipped++; return; }
      if (vistosEnArchivo[key]) duplicadosEnArchivo.push(key);
      vistosEnArchivo[key] = true;

      var newRow = COLUMNS.map(function (col) {
        if (col === 'updated_at') return now;
        if (col === 'pod_sent' || col === 'recargos_vg' || col === 'client_notify_pending') return false;
        if (col === 'client_notify_reason' || col === 'client_notified_at' || col === 'client_notified_by' || col === 'client_notify_since') return '';
        if (col === 'recordatorio_fecha') return '';
        if (col === 'status') return ''; // el status nunca viene del Excel, siempre es manual
        if (col === 'color') return ''; // el color nunca viene del Excel, siempre es manual
        if (col === 'tracking_link' || col === 'eta_note') return rec[col] || '';
        return (rec[col] === undefined || rec[col] === null) ? '' : rec[col];
      });

      if (existing[key]) {
        var prev = existing[key].data;
        if (!newRow[trackingLinkIdx] && prev[trackingLinkIdx]) newRow[trackingLinkIdx] = prev[trackingLinkIdx];
        if (!newRow[etaNoteIdx] && prev[etaNoteIdx]) newRow[etaNoteIdx] = prev[etaNoteIdx];
        var truckKeptManual = !newRow[truckIdx] && prev[truckIdx];
        if (truckKeptManual) {
          newRow[truckIdx] = prev[truckIdx];
          newRow[truckSourceIdx] = prev[truckSourceIdx] || '';
          newRow[truckManualByIdx] = prev[truckManualByIdx] || '';
          newRow[truckManualAtIdx] = prev[truckManualAtIdx] || '';
        } else {
          newRow[truckSourceIdx] = '';
          newRow[truckManualByIdx] = '';
          newRow[truckManualAtIdx] = '';
        }
        var trailerKeptManual = !newRow[trailerIdx] && prev[trailerIdx];
        if (trailerKeptManual) {
          newRow[trailerIdx] = prev[trailerIdx];
          newRow[trailerSourceIdx] = prev[trailerSourceIdx] || '';
          newRow[trailerManualByIdx] = prev[trailerManualByIdx] || '';
          newRow[trailerManualAtIdx] = prev[trailerManualAtIdx] || '';
        } else {
          newRow[trailerSourceIdx] = '';
          newRow[trailerManualByIdx] = '';
          newRow[trailerManualAtIdx] = '';
        }
        DOC_ITEM_FIELDS_.forEach(function (campo) {
          var idx = COLUMNS.indexOf(campo);
          var srcIdx = COLUMNS.indexOf(campo + '_source');
          var byIdx = COLUMNS.indexOf(campo + '_manual_by');
          var atIdx = COLUMNS.indexOf(campo + '_manual_at');
          var keptManual = !newRow[idx] && prev[idx];
          if (keptManual) {
            newRow[idx] = prev[idx];
            newRow[srcIdx] = prev[srcIdx] || '';
            newRow[byIdx] = prev[byIdx] || '';
            newRow[atIdx] = prev[atIdx] || '';
          } else {
            newRow[srcIdx] = '';
            newRow[byIdx] = '';
            newRow[atIdx] = '';
          }
        });
        if (!newRow[pickupApptIdx] && prev[pickupApptIdx]) newRow[pickupApptIdx] = prev[pickupApptIdx];
        if (!newRow[deliveryApptIdx] && prev[deliveryApptIdx]) newRow[deliveryApptIdx] = prev[deliveryApptIdx];
        if (!newRow[salidaMexicoFechaIdx] && prev[salidaMexicoFechaIdx]) newRow[salidaMexicoFechaIdx] = prev[salidaMexicoFechaIdx];
        if (!newRow[cruceUsaFechaIdx] && prev[cruceUsaFechaIdx]) newRow[cruceUsaFechaIdx] = prev[cruceUsaFechaIdx];
        newRow[podSentIdx] = !!prev[podSentIdx];
        newRow[recargosVgIdx] = !!prev[recargosVgIdx];
        newRow[statusIdx] = prev[statusIdx] || ''; // se mantiene siempre el status manual anterior
        // El recordatorio se conserva igual que el status (el import nunca lo toca).
        newRow[recordatorioFechaIdx] = prev[recordatorioFechaIdx] || '';
        // El color de la tarjeta tampoco lo toca el import — es solo para identificarla a mano.
        newRow[colorIdx] = prev[colorIdx] || '';
        // Communication Control: conserva el estado de comunicación existente.
        newRow[notifyPendingIdx] = !!prev[notifyPendingIdx];
        newRow[notifyReasonIdx] = prev[notifyReasonIdx] || '';
        newRow[notifiedAtIdx] = prev[notifiedAtIdx] || '';
        newRow[notifiedByIdx] = prev[notifiedByIdx] || '';
        newRow[notifySinceIdx] = prev[notifySinceIdx] || '';
        // Campos internos/manuales del Control Tower: el Excel no es su fuente y nunca debe
        // borrarlos al reconstruir la fila durante una importación. (truck_source/
        // trailer_source y sus *_manual_by/*_manual_at ya se resolvieron arriba, así que aquí
        // se excluyen de esta copia genérica para no pisar lo que se acaba de decidir.)
        ['next_review_at','next_review_note','next_review_by','truck_vg_value',
         'trailer_vg_value','operacion_pais','llegada_planta_fecha',
         'ultima_revision_csr','ultima_revision_csr_by','siguiente_movimiento','etd_operativa','updated_by'].forEach(function(col){
          var idx=COLUMNS.indexOf(col); if(idx>=0) newRow[idx]=prev[idx] || '';
        });

        var importReasons = [];
        if (newRow[pickupApptIdx] && apptChanged_(newRow[pickupApptIdx], prev[pickupApptIdx])) importReasons.push('Cambio detectado en cita de pickup');
        if (newRow[deliveryApptIdx] && apptChanged_(newRow[deliveryApptIdx], prev[deliveryApptIdx])) importReasons.push('Cambio detectado en cita de entrega');

        var updatedAtIdx = COLUMNS.indexOf('updated_at');
        if (filaIgualSinUpdated_(newRow, prev, updatedAtIdx)) {
          newRow[updatedAtIdx] = prev[updatedAtIdx];
          existing[key].data = newRow;
          sinCambios++;
          return;
        }
        if (importReasons.length) {
          citasMovidas++;
          // Misma regla que markClientNotifyPending_, pero en memoria (se escribe en el lote):
          // si ya había un motivo pendiente, se le agrega el nuevo sin borrar el anterior.
          var motivoNuevo = importReasons.join(' · ');
          var motivoActual = String(newRow[notifyReasonIdx] || '').trim();
          if (motivoActual && motivoActual.indexOf(motivoNuevo) === -1) motivoNuevo = motivoActual + ' · ' + motivoNuevo;
          else if (motivoActual) motivoNuevo = motivoActual;
          newRow[notifyPendingIdx] = true;
          newRow[notifyReasonIdx] = motivoNuevo;
          newRow[notifiedAtIdx] = '';
          newRow[notifiedByIdx] = '';
          newRow[notifySinceIdx] = now;
          comunicacionesNuevas.push([Utilities.getUuid(), key, now, 'PENDIENTE', motivoNuevo, 'Importación', '', '']);
        }
        if (existing[key].nuevaIdx !== undefined) {
          filasNuevas[existing[key].nuevaIdx] = newRow; // el mismo load venía dos veces en el archivo
        } else {
          filasCambiadas[existing[key].rowIndex] = newRow;
        }
        existing[key].data = newRow;
        updated++;
      } else {
        existing[key] = { nuevaIdx: filasNuevas.length, data: newRow };
        filasNuevas.push(newRow);
        inserted++;
      }
    });

    // Clientes del archivo que no tienen CSR asignado: sus cargas no le aparecen a ningún CSR.
    var csrMap = getCsrParaCliente_(), sinCsr = {};
    records.forEach(function (rec) {
      var c = String(rec.customer || '').trim();
      if (c && !csrMap[c.toLowerCase()]) sinCsr[c] = true;
    });
    var resumen = {
      inserted: inserted, updated: updated, unchanged: sinCambios, skipped: skipped, total: records.length,
      citasMovidas: citasMovidas, clientesSinCsr: Object.keys(sinCsr).sort(),
      duplicadosEnArchivo: duplicadosEnArchivo.filter(function (k, i) { return duplicadosEnArchivo.indexOf(k) === i; })
    };
    if (!aplicar) { resumen.ok = true; resumen.vistaPrevia = true; return resumen; }

    respaldarLoadsAntesDeImportar_(values || []);
    escribirFilasPorBloques_(sheet, filasCambiadas);
    if (filasNuevas.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, filasNuevas.length, COLUMNS.length).setValues(filasNuevas);
    }
    if (comunicacionesNuevas.length) {
      var commSheet = getComunicacionesSheet_();
      commSheet.getRange(commSheet.getLastRow() + 1, 1, comunicacionesNuevas.length, 8).setValues(comunicacionesNuevas);
    }

    touchLastModified_('loads');
    PropertiesService.getScriptProperties().setProperty('lastImportAt', new Date().toISOString());
    logAdmin_(adminPw, 'Importó Excel', inserted + ' nuevas · ' + updated + ' actualizadas · ' + sinCambios + ' sin cambios');
    resumen.ok = true;
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Utilidad de diagnóstico: revisa la hoja "Loads" y regresa los números de load que
 * aparecen más de una vez (considerando la misma normalización que usa el import).
 * Se puede correr manualmente desde el editor de Apps Script (menú Ejecutar) si alguna
 * vez hay sospecha de loads duplicados, sin borrar ni modificar nada.
 */
function findDuplicateLoads(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var seen = {};
  var dupKeys = {};
  values.forEach(function (row, idx) {
    var key = normalizeLoadKey_(row[0]);
    if (!key) return;
    if (seen[key]) {
      seen[key].push(idx + 2);
      dupKeys[key] = true;
    } else {
      seen[key] = [idx + 2];
    }
  });
  var out = Object.keys(dupKeys).map(function (key) {
    return { load: key, filas: seen[key] };
  });
  Logger.log(JSON.stringify(out));
  return out;
}


/** Guarda el truck a mano desde el panel — por ejemplo, cuando ya se sabe qué truck va a llevar
 * la carga pero el Excel de la mañana todavía no lo trae (se sube una vez al día). En el
 * siguiente import, si el TMS ya reporta un truck para ese load, ese valor gana sobre este;
 * si el Excel sigue sin traer nada, este valor capturado a mano se conserva (ver importLoads). */
function saveTruck(load, truck, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var truckCol = COLUMNS.indexOf('truck') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, truckCol, load, 'Truck', String(truck || '').trim(), usuario);
    var srcCol=COLUMNS.indexOf('truck_source')+1, byCol=COLUMNS.indexOf('truck_manual_by')+1, atCol=COLUMNS.indexOf('truck_manual_at')+1;
    sheet.getRange(rowIndex,srcCol).setValue('MANUAL');
    sheet.getRange(rowIndex,byCol).setValue(String(usuario||''));
    sheet.getRange(rowIndex,atCol).setValue(new Date());
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}



/** V6: agenda la próxima revisión operativa de un Load. */
function saveNextReview(load, nextReviewAt, note, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return {ok:false,error:check.error || 'No se pudo verificar tu identidad'};

  load = String(load || '').trim();
  nextReviewAt = String(nextReviewAt || '').trim();
  note = String(note || '').trim();
  if (!load) return {ok:false,error:'Load no válido'};
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(nextReviewAt)) {
    return {ok:false,error:'Fecha de próxima revisión no válida'};
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return {ok:false,error:'La operación está ocupada. Intenta nuevamente en unos segundos.'};
  }

  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return {ok:false,error:'Sin datos todavía'};

    var row = findLoadRowNormalized_(sheet, load);
    if (row === -1) return {ok:false,error:'Load no encontrado'};

    var dateCol = COLUMNS.indexOf('next_review_at') + 1;
    var noteCol = COLUMNS.indexOf('next_review_note') + 1;
    var byCol = COLUMNS.indexOf('next_review_by') + 1;
    if (dateCol < 1 || noteCol < 1 || byCol < 1) {
      return {ok:false,error:'Faltan columnas de próxima revisión en Loads'};
    }

    // Las tres columnas son consecutivas: una sola escritura reduce llamadas a Sheets.
    var anteriorNextReview = formatHistorialValor_(sheet.getRange(row, dateCol).getValue());
    sheet.getRange(row,dateCol,1,3).setValues([[
      nextReviewAt,
      note,
      String(usuario || '')
    ]]);
    logHistorialCambio_(load, 'Próxima revisión', anteriorNextReview, formatHistorialValor_(nextReviewAt), usuario);
    stampUpdated_(sheet, row, usuario);
    SpreadsheetApp.flush();
  } catch (err) {
    return {ok:false,error:'No se pudo guardar la próxima revisión: ' + (err && err.message ? err.message : err)};
  } finally {
    lock.releaseLock();
  }

  touchLastModified_('loads');
  return {
    ok:true,
    next_review_at:nextReviewAt,
    next_review_note:note,
    next_review_by:String(usuario || '')
  };
}

function clearNextReview(load, usuario, password) {
  var check=requireLogin_(usuario,password);
  if(!check.ok)return {ok:false,error:check.error||'No se pudo verificar tu identidad'};
  var lock = acquireLock_(10000, 3);
  try{
    var sheet=getSheet_(), lastRow=sheet.getLastRow();
    if(lastRow<2)return {ok:false,error:'Sin datos todavía'};
    var start=COLUMNS.indexOf('next_review_at')+1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return {ok:false,error:'Load no encontrado'};
    var anteriorClear = formatHistorialValor_(sheet.getRange(rowIndex, start).getValue());
    sheet.getRange(rowIndex,start,1,3).clearContent();
    logHistorialCambio_(load, 'Próxima revisión', anteriorClear, '', usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return {ok:true};
  } finally {lock.releaseLock();}
}

/** V5: guarda el enlace público/compartible de tracking Samsara para el Load. */
function saveTrackingLink(load, trackingLink, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok:false, error:check.error || 'No se pudo verificar tu identidad' };
  trackingLink = String(trackingLink || '').trim();
  if (trackingLink && !/^https?:\/\//i.test(trackingLink)) return { ok:false, error:'El tracking debe iniciar con http:// o https://' };
  if (trackingLink.length > 2000) return { ok:false, error:'El enlace es demasiado largo' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet=getSheet_(), lastRow=sheet.getLastRow();
    if(lastRow<2) return {ok:false,error:'Sin datos todavía'};
    var col=COLUMNS.indexOf('tracking_link')+1;
    var row = findLoadRow_(sheet, load);
    if (row === -1) return {ok:false,error:'Load no encontrado'};
    setCampoConHistorial_(sheet, row, col, load, 'Tracking link', trackingLink, usuario);
    stampUpdated_(sheet,row,usuario);
    touchLastModified_('loads');
    return {ok:true,tracking_link:trackingLink};
  } finally { lock.releaseLock(); }
}

/** Guarda el trailer a mano desde el panel — mismo mecanismo y misma prioridad que saveTruck:
 * el Excel del día siguiente gana si trae un valor; si no trae nada, se conserva este. */
function saveTrailer(load, trailer, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var trailerCol = COLUMNS.indexOf('trailer') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, trailerCol, load, 'Trailer', String(trailer || '').trim(), usuario);
    var srcCol=COLUMNS.indexOf('trailer_source')+1, byCol=COLUMNS.indexOf('trailer_manual_by')+1, atCol=COLUMNS.indexOf('trailer_manual_at')+1;
    sheet.getRange(rowIndex,srcCol).setValue('MANUAL');
    sheet.getRange(rowIndex,byCol).setValue(String(usuario||''));
    sheet.getRange(rowIndex,atCol).setValue(new Date());
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Campos de "Documentación" (los circulitos BOL/DODA/Entry/Sobre listo del panel) que se pueden
 * marcar/desmarcar a mano con saveDocItem — ver también el merge de importLoads más arriba. */
var DOC_ITEM_FIELDS_ = ['bol', 'doda', 'entry', 'sobre_listo'];
var DOC_ITEM_LABELS_ = { bol: 'BOL', doda: 'DODA', entry: 'Entry', sobre_listo: 'Sobre listo' };

/** Marca/desmarca a mano uno de los documentos (BOL/DODA/Entry/Sobre listo) desde el panel — por
 * ejemplo, cuando ya se sabe que el BOL quedó listo pero el Excel de la mañana todavía no lo trae
 * marcado. En el siguiente import, si el Excel ya trae ese campo en true, ese valor gana sobre
 * este; si sigue sin traer nada, este marcado a mano se conserva (ver importLoads). Misma lógica
 * que saveTruck/saveTrailer, aplicada a un campo booleano en vez de texto. */
function saveDocItem(load, campo, valor, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  if (DOC_ITEM_FIELDS_.indexOf(campo) === -1) return { ok: false, error: 'Campo no válido' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var col = COLUMNS.indexOf(campo) + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, col, load, DOC_ITEM_LABELS_[campo], !!valor, usuario);
    var srcCol = COLUMNS.indexOf(campo + '_source') + 1, byCol = COLUMNS.indexOf(campo + '_manual_by') + 1, atCol = COLUMNS.indexOf(campo + '_manual_at') + 1;
    sheet.getRange(rowIndex, srcCol).setValue('MANUAL');
    sheet.getRange(rowIndex, byCol).setValue(String(usuario || ''));
    sheet.getRange(rowIndex, atCol).setValue(new Date());
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Guarda el color de la tarjeta de un load activo — solo para identificarla visualmente en el
 * panel (no cambia el status ni ningún otro dato). El import de Excel nunca lo toca (ver
 * importLoads). Pasar '' quita el color manual y deja que la tarjeta vuelva a su color automático
 * según su estatus. */
function saveLoadColor(load, color, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  color = String(color || '').trim();
  if (color && CARD_COLORES_GS.indexOf(color) === -1) return { ok: false, error: 'Color no válido' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var colorCol = COLUMNS.indexOf('color') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, colorCol, load, 'Color de tarjeta', color, usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Guarda la fecha/hora de pickup cita a mano desde el panel — por ejemplo, cuando el cliente
 * confirma o mueve la cita antes de que el Excel de la mañana lo refleje. En el siguiente
 * import, si el documento SÍ trae una fecha para ese load, esa gana sobre esta; si el
 * documento no trae nada, se conserva lo capturado a mano (ver importLoads). */
function savePickupAppt(load, value, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var col = COLUMNS.indexOf('pickup_appt') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, col, load, 'Cita de pickup', String(value || '').trim(), usuario);
    markClientNotifyPending_(sheet, rowIndex, load, 'Cambio en cita de pickup', usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Guarda la fecha/hora de entrega cita a mano desde el panel — mismo mecanismo y misma
 * prioridad que savePickupAppt: el documento gana si trae una fecha; si no trae nada, se
 * conserva esta. */
function saveDeliveryAppt(load, value, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var col = COLUMNS.indexOf('delivery_appt') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, col, load, 'Cita de entrega', String(value || '').trim(), usuario);
    markClientNotifyPending_(sheet, rowIndex, load, 'Cambio en cita de entrega', usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Guarda la fecha/hora en que la carga salió de la planta de origen (etapa "Salida planta" del
 * timeline del Portal Cliente — columna interna sigue llamándose salida_mexico_fecha). Captura
 * manual desde el panel interno. */
function saveSalidaMexico(load, value, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(8000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var col = COLUMNS.indexOf('salida_mexico_fecha') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, col, load, 'Salida planta', String(value || '').trim(), usuario);
    markClientNotifyPending_(sheet, rowIndex, load, 'Salida de planta actualizada', usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Guarda la fecha/hora en que la carga cruzó a EUA (etapa "Cruce USA" del timeline del Portal
 * Cliente). Captura manual desde el panel interno. */
function saveCruceUsa(load, value, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(8000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var col = COLUMNS.indexOf('cruce_usa_fecha') + 1;
    var confirmadoCol = COLUMNS.indexOf('cruce_confirmado') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, col, load, 'Cruce aduana', String(value || '').trim(), usuario);
    sheet.getRange(rowIndex, confirmadoCol).setValue('');
    markClientNotifyPending_(sheet, rowIndex, load, 'Cruce aduana actualizada', usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Guarda la respuesta a "¿ya cruzó la caja?" — aviso que el panel dispara cuando ya pasó la
 * fecha/hora de Cruce aduana capturada y todavía no se confirmó (ver loadsNeedingCruceConfirm_ en
 * PanelScript.html). confirmado=true marca la carga como confirmada (no se vuelve a preguntar salvo que
 * se edite Cruce aduana otra vez, sea aquí o desde "Ruta y cruce"). confirmado=false reprograma
 * Cruce aduana a nuevaFecha y dispara el aviso de nuevo cuando esa fecha pase. A petición de
 * Esteban: mecanismo aparte, no reutiliza next_review_at/recordatorio_fecha. */
function confirmarCruceUsa(load, confirmado, nuevaFecha, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(8000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var cruceCol = COLUMNS.indexOf('cruce_usa_fecha') + 1;
    var confirmadoCol = COLUMNS.indexOf('cruce_confirmado') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    if (confirmado) {
      setCampoConHistorial_(sheet, rowIndex, confirmadoCol, load, 'Cruce aduana confirmado', true, usuario);
    } else {
      setCampoConHistorial_(sheet, rowIndex, cruceCol, load, 'Cruce aduana', String(nuevaFecha || '').trim(), usuario);
      sheet.getRange(rowIndex, confirmadoCol).setValue('');
      markClientNotifyPending_(sheet, rowIndex, load, 'Cruce aduana actualizada', usuario);
    }
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Guarda el estatus manual de una carga. Si el nuevo estatus ya no es de los que usan
 * recordatorio (Descompuesta / En resguardo / Patio permisionario), limpia cualquier
 * recordatorio pendiente que hubiera quedado del estatus anterior, para no dejar fechas viejas
 * dando vueltas ni disparar una alerta fantasma. Para ENTRAR a uno de esos 3 estatus con
 * recordatorio, el panel usa saveStatusConRecordatorio (exige la fecha antes de guardar). */
function saveStatus(load, status, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var statusCol = COLUMNS.indexOf('status') + 1;
    var fechaCol = COLUMNS.indexOf('recordatorio_fecha') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, statusCol, load, 'Estatus', status || '', usuario);
    markClientNotifyPending_(sheet, rowIndex, load, 'Cambio de estatus: ' + (status || 'Sin estatus'), usuario);
    if (REMINDER_STATUSES_GS.indexOf(status) === -1) {
      setCampoConHistorial_(sheet, rowIndex, fechaCol, load, 'Recordatorio', '', usuario);
    }
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Guarda el estatus junto con la fecha/hora del recordatorio en una sola operación. El panel
 * exige llamar a esta función (en vez de saveStatus) cuando el estatus elegido es Descompuesta,
 * En resguardo o Patio permisionario — no se puede dejar sin fecha. Para Patio permisionario,
 * fechaISO es la fecha estimada de despacho: si se pasa y sigue en ese estatus, el panel lo
 * marca en rojo (aviso solo visual, no se manda correo). */
function saveStatusConRecordatorio(load, status, fechaISO, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  fechaISO = String(fechaISO || '').trim();
  if (!fechaISO) return { ok: false, error: 'Falta la fecha del recordatorio' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var statusCol = COLUMNS.indexOf('status') + 1;
    var fechaCol = COLUMNS.indexOf('recordatorio_fecha') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, statusCol, load, 'Estatus', status || '', usuario);
    markClientNotifyPending_(sheet, rowIndex, load, 'Cambio de estatus: ' + (status || 'Sin estatus'), usuario);
    setCampoConHistorial_(sheet, rowIndex, fechaCol, load, 'Recordatorio', fechaISO, usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Reprograma la fecha/hora del recordatorio de una carga que ya está en Descompuesta, En
 * resguardo o Patio permisionario, sin tocar el estatus (por ejemplo, para moverla porque
 * todavía no se resuelve). */
function saveRecordatorio(load, fechaISO, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  fechaISO = String(fechaISO || '').trim();
  if (!fechaISO) return { ok: false, error: 'Falta la fecha del recordatorio' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var fechaCol = COLUMNS.indexOf('recordatorio_fecha') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, fechaCol, load, 'Recordatorio', fechaISO, usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Marca (o desmarca) si ya se compartió el POD con el cliente. Solo con esto marcado, y estatus Delivered/Completed, la carga pasa a "Entregados". */
function savePodSent(load, sent, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var podCol = COLUMNS.indexOf('pod_sent') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, podCol, load, 'POD enviado', sent ? true : false, usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Acciones masivas desde "Operación completa" (varias cargas seleccionadas a la vez). Hace
 * exactamente lo mismo que cambiarlas una por una (historial, aviso al cliente, revisión de
 * "En transito"), con una sola verificación de sesión. accion: 'status' | 'pod'. Los estatus que
 * piden fecha de recordatorio (Descompuesta, En resguardo, Patio permisionario) no se permiten
 * aquí: cada carga necesita su propia fecha. */
var MASIVO_MAX_ = 100;
function guardarMasivo(loads, accion, valor, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  if (!Array.isArray(loads) || !loads.length) return { ok: false, error: 'No elegiste ninguna carga' };
  if (loads.length > MASIVO_MAX_) return { ok: false, error: 'Máximo ' + MASIVO_MAX_ + ' cargas a la vez' };
  valor = accion === 'status' ? String(valor || '').trim() : !!valor;
  if (accion === 'status' && !valor) return { ok: false, error: 'Elige el estatus' };
  if (accion === 'status' && REMINDER_STATUSES_GS.indexOf(valor) !== -1) return { ok: false, error: 'Ese estatus pide fecha de recordatorio: cámbialo carga por carga' };
  if (accion !== 'status' && accion !== 'pod') return { ok: false, error: 'Acción no válida' };
  memoLogin_ = {};
  memoLogin_[String(usuario || '').trim() + '|' + String(password || '').trim()] = check;
  try {
    var hechos = [], fallas = [];
    loads.forEach(function (load) {
      var r;
      if (accion === 'pod') r = savePodSent(load, valor, usuario, password);
      else if (AUTO_REVIEW_STATUSES_GS.indexOf(valor) !== -1) r = saveStatusConRecordatorio(load, valor, new Date(Date.now() + AUTO_REVIEW_HOURS_GS * 3600000).toISOString(), usuario, password);
      else r = saveStatus(load, valor, usuario, password);
      if (r && r.ok) hechos.push(String(load));
      else fallas.push({ load: String(load), error: (r && r.error) || 'Error' });
    });
    return { ok: true, hechos: hechos, fallas: fallas };
  } finally {
    memoLogin_ = null;
  }
}

/** Marca (o desmarca) si ya se ingresaron los recargos (cobro) en VG para una carga TONU. Solo
 * con esto marcado la carga se considera finalizada y pasa a "Canceladas/Finalizadas". */
function saveRecargosVg(load, sent, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos todavía' };
    var col = COLUMNS.indexOf('recargos_vg') + 1;
    var rowIndex = findLoadRow_(sheet, load);
    if (rowIndex === -1) return { ok: false, error: 'Load no encontrado' };
    setCampoConHistorial_(sheet, rowIndex, col, load, 'Recargos VG cobrados', sent ? true : false, usuario);
    stampUpdated_(sheet, rowIndex, usuario);
    touchLastModified_('loads');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve (y crea si hace falta) la hoja "Comentarios", con historial por carga. */
function getCommentsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Comentarios');
  if (!sheet) {
    sheet = ss.insertSheet('Comentarios');
    sheet.appendRow(['load', 'timestamp', 'comentario', 'usuario']);
    sheet.setFrozenRows(1);
  } else if (String(sheet.getRange(1, 4).getValue()) !== 'usuario') {
    sheet.getRange(1, 4).setValue('usuario');
  }
  return sheet;
}

/** Agrega un comentario nuevo al historial de una carga (nunca sobrescribe). Regresa el timestamp
 * guardado para poder mostrarlo al instante sin volver a leer todo. Antes de guardar, verifica el
 * contraseña personal de "usuario" contra lo guardado en "Personas" — así nadie puede guardar un
 * comentario a nombre de alguien más sin saber su contraseña, aunque manipule el navegador a mano. */
function addComment(load, text, usuario, password) {
  text = String(text || '').trim();
  usuario = String(usuario || '').trim();
  if (!text) return { ok: false, error: 'Comentario vacío' };
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getCommentsSheet_();
    var now = new Date();
    sheet.appendRow([String(load), now, text, usuario]);
    // Comentar una carga "En transito" cuenta como revisarla (ver reiniciarRevisionTransito_).
    var loads = getSheet_();
    var row = findLoadRowNormalized_(loads, load);
    var revision = row !== -1 ? reiniciarRevisionTransito_(loads, row, usuario) : '';
    SpreadsheetApp.flush();
    touchLastModified_(['loads', 'comentarios']);
    return { ok: true, ts: now.toISOString(), usuario: usuario, recordatorio_fecha: revision };
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve el historial de comentarios de una carga, más reciente primero. */
function getComments(load, usuario, password) {
  if (!sesionOk_(usuario, password)) return JSON.stringify([]);
  var sheet = getCommentsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify([]);
  var values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(load)) {
      var tsVal = values[i][1];
      var tsStr = (tsVal instanceof Date) ? tsVal.toISOString() : String(tsVal);
      out.push({ ts: tsStr, text: values[i][2], usuario: String(values[i][3] || '') });
    }
  }
  out.sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
  return JSON.stringify(out);
}

/** Devuelve el último comentario de cada carga, como mapa { load: {ts, text, usuario} }. */
function getUltimosComentarios(usuario, password) {
  if (!sesionOk_(usuario, password)) return JSON.stringify({});
  var sheet = getCommentsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify({});
  var values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var load = String(values[i][0]);
    var tsVal = values[i][1];
    var tsStr = (tsVal instanceof Date) ? tsVal.toISOString() : String(tsVal);
    var text = values[i][2];
    var usuario = String(values[i][3] || '');
    if (!map[load] || new Date(tsStr) > new Date(map[load].ts)) {
      map[load] = { ts: tsStr, text: text, usuario: usuario };
    }
  }
  return JSON.stringify(map);
}

/**
 * ===== Archivado =====
 * La hoja "Loads" crece todos los días (se sube un Excel nuevo cada mañana) y nunca se
 * borra nada, así que con el tiempo llegaría a miles de filas y el panel se pondría lento
 * (tanto leer la hoja completa como dibujar todas las tarjetas en el navegador). La
 * solución: las cargas que ya están Delivered/Completed, con el POD ya confirmado, y que
 * llevan más de ARCHIVE_AFTER_DAYS días sin actualizarse, se mueven (no se borran, se
 * mueven) a hojas de archivo aparte. La hoja "Loads" activa se mantiene siempre chica.
 */

/** Devuelve (y crea si hace falta) la hoja de archivo de cargas, con las mismas columnas que "Loads". */
function getArchiveSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Loads_Archivo');
  if (!sheet) {
    sheet = ss.insertSheet('Loads_Archivo');
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < COLUMNS.length) {
    // Columnas nuevas agregadas al final de COLUMNS (igual que la migración de getSheet_).
    var lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1, 1, COLUMNS.length - lastCol).setValues([COLUMNS.slice(lastCol)]);
  }
  return sheet;
}

/** Devuelve (y crea si hace falta) la hoja de archivo de comentarios. */
function getCommentsArchiveSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Comentarios_Archivo');
  if (!sheet) {
    sheet = ss.insertSheet('Comentarios_Archivo');
    sheet.appendRow(['load', 'timestamp', 'comentario', 'usuario']);
    sheet.setFrozenRows(1);
  } else if (String(sheet.getRange(1, 4).getValue()) !== 'usuario') {
    sheet.getRange(1, 4).setValue('usuario');
  }
  return sheet;
}

/**
 * Mueve a "Comentarios_Archivo" los comentarios de los loads indicados (los quita de la
 * hoja "Comentarios" activa). Se llama desde archiveOldLoads(), ya dentro de su lock —
 * por eso no toma su propio lock aquí.
 */
function moveCommentsToArchive_(loadKeys) {
  if (!loadKeys || !loadKeys.length) return 0;
  var keySet = {};
  loadKeys.forEach(function (k) { keySet[k] = true; });

  return moverFilasAArchivo_(getCommentsSheet_(), getCommentsArchiveSheet_(), 4, function (row) {
    var key = normalizeLoadKey_(row[0]);
    return !!(key && keySet[key]);
  });
}

function moverFilasAArchivo_(sheet, archiveSheet, numCols, debeArchivarse) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var mover = [], quedan = [];
  values.forEach(function (row) {
    if (row[0] !== '' && row[0] !== null && debeArchivarse(row)) mover.push(row);
    else quedan.push(row);
  });
  if (!mover.length) return 0;
  archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, mover.length, numCols).setValues(mover);
  if (quedan.length) sheet.getRange(2, 1, quedan.length, numCols).setValues(quedan);
  sheet.getRange(2 + quedan.length, 1, mover.length, numCols).clearContent();
  return mover.length;
}

/** Hoja "<nombre>" de archivo con los mismos encabezados que la original (la crea si no existe). */
function getHojaArchivo_(nombre, encabezados) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(nombre);
  if (!sheet) {
    sheet = ss.insertSheet(nombre);
    sheet.appendRow(encabezados);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Mueve a su hoja "_Archivo" las filas de Comunicaciones, Historial e Incidencias de los loads
 * que se acaban de archivar — estas tres hojas solo crecían y se leen completas a cada rato (el
 * SLA cada 5 min por usuario, el historial al abrir cada carga, el conteo de incidencias en cada
 * refresco). Ningún lugar del panel muestra ya esas cargas, así que no se pierde nada visible. */
function moverHistorialesAArchivo_(loadKeys) {
  var keySet = {};
  loadKeys.forEach(function (k) { keySet[k] = true; });
  var porLoad = function (col) {
    return function (row) { var k = normalizeLoadKey_(row[col]); return !!(k && keySet[k]); };
  };
  var comunicaciones = getComunicacionesSheet_();
  var historial = getHistorialSheet_();
  var incidencias = getIncidenciasSheet_();
  return {
    comunicaciones: moverFilasAArchivo_(comunicaciones, getHojaArchivo_('Comunicaciones_Archivo',
      ['id', 'load', 'timestamp', 'tipo', 'motivo', 'usuario', 'canal', 'mensaje']), 8, porLoad(1)),
    historial: moverFilasAArchivo_(historial, getHojaArchivo_('Historial_Archivo', HISTORIAL_COLUMNS),
      HISTORIAL_COLUMNS.length, porLoad(1)),
    incidencias: moverFilasAArchivo_(incidencias, getHojaArchivo_('Incidencias_Archivo',
      incidencias.getRange(1, 1, 1, 8).getValues()[0]), 8, porLoad(1))
  };
}

/**
 * Revisa "Loads" y mueve a "Loads_Archivo" (junto con sus comentarios) las cargas ya
 * entregadas con POD confirmado y con más de ARCHIVE_AFTER_DAYS días sin actualizarse.
 * No borra nada — todo queda accesible en las hojas de archivo. Se puede correr manualmente
 * desde el editor de Apps Script, y también corre sola cada semana una vez que se instale
 * el trigger (ver installWeeklyArchiveTrigger).
 */
function archiveOldLoads(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  var lock = acquireLock_(20000, 3);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { archived: 0, comentariosArchivados: 0 };

    var statusIdx = COLUMNS.indexOf('status');
    var podIdx = COLUMNS.indexOf('pod_sent');
    var recargosIdx = COLUMNS.indexOf('recargos_vg');
    var updatedIdx = COLUMNS.indexOf('updated_at');
    var cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    var loadKeys = [];

    var archived = moverFilasAArchivo_(sheet, getArchiveSheet_(), COLUMNS.length, function (row) {
      var status = String(row[statusIdx] || '').trim();
      var terminada = (DONE_STATUSES_GS.indexOf(status) !== -1 && !!row[podIdx]) ||
        status.toLowerCase().replace(/\.$/, '') === 'cancelado' ||
        (status === 'TONU' && !!row[recargosIdx]);
      if (!terminada) return false;
      var updated = row[updatedIdx];
      var updatedDate = (updated instanceof Date) ? updated : new Date(updated);
      if (isNaN(updatedDate.getTime()) || updatedDate > cutoff) return false;
      loadKeys.push(normalizeLoadKey_(row[0]));
      return true;
    });

    if (!archived) return { archived: 0, comentariosArchivados: 0 };

    var comentariosArchivados = moveCommentsToArchive_(loadKeys);
    var historiales = moverHistorialesAArchivo_(loadKeys);

    touchLastModified_(['loads', 'comentarios']);
    return {
      archived: archived,
      comentariosArchivados: comentariosArchivados,
      comunicacionesArchivadas: historiales.comunicaciones,
      historialArchivado: historiales.historial,
      incidenciasArchivadas: historiales.incidencias
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Configura el archivado automático semanal. Se corre UNA sola vez, manualmente, desde el
 * editor de Apps Script (selecciona "installWeeklyArchiveTrigger" en el menú de funciones
 * y dale Ejecutar). De ahí en adelante, archiveOldLoads() corre sola cada domingo de
 * madrugada, sin que nadie tenga que hacer nada. Es seguro volver a correrla si hace falta:
 * primero quita cualquier trigger anterior de esta misma función para no duplicarlo.
 */
function installWeeklyArchiveTrigger(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'archiveOldLoads') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('archiveOldLoads')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();
  Logger.log('Archivado automático configurado: correrá cada domingo ~3am.');
  return { ok: true };
}

/* Respaldo semanal del Google Sheet completo (todas las hojas) en una carpeta de Drive. Gratis.
 * Se activa UNA vez desde el editor con activarRespaldoSemanal. Guarda las últimas
 * RESPALDOS_MAX_ copias; las más viejas se mandan a la papelera de Drive (se pueden recuperar
 * durante 30 días). */
var RESPALDOS_CARPETA_ = 'Respaldos Panel Bajío';
var RESPALDOS_MAX_ = 8;

function respaldarHojaSemanal(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var carpetas = DriveApp.getFoldersByName(RESPALDOS_CARPETA_);
  var carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(RESPALDOS_CARPETA_);
  var nombre = 'Respaldo ' + ss.getName() + ' ' + Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd HH.mm');
  DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);
  var archivos = [], it = carpeta.getFiles();
  while (it.hasNext()) archivos.push(it.next());
  archivos.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  archivos.slice(RESPALDOS_MAX_).forEach(function (f) { f.setTrashed(true); });
  Logger.log('Respaldo creado en Drive › ' + RESPALDOS_CARPETA_ + ' › ' + nombre);
  return { ok: true, nombre: nombre };
}

/** Ejecútala UNA vez desde el editor: deja el respaldo corriendo solo cada sábado ~2am y hace el
 * primero en ese momento. Es seguro volver a correrla (no duplica el activador). */
function activarRespaldoSemanal(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'respaldarHojaSemanal') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('respaldarHojaSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(2).create();
  Logger.log('Paso 1 OK: respaldo semanal activado (cada sábado ~2am).');
  var r = respaldarHojaSemanal();
  Logger.log(r.ok ? 'Paso 2 OK: primer respaldo hecho.' : 'Paso 2 FALLÓ: ' + r.error);
  return r;
}

/* =========================================================================================
 * CONTRASEÑAS — seguridad (oct 2026). Tres reglas para todas las contraseñas del proyecto
 * (personas del panel, cuentas del Portal Cliente, "Gestionar CSR" y Vista Gerencia):
 *  1) Se guardan cifradas (hash SHA-256 con sal, PW_HASH_ROUNDS_ vueltas), nunca legibles. Las
 *     que ya estaban en texto plano se siguen aceptando y se cifran solas la primera vez que su
 *     dueño entra (passwordCoincide_ + el "migrar" de cada login).
 *  2) Tras INTENTOS_MAX_ intentos fallidos seguidos, esa cuenta queda bloqueada BLOQUEO_MIN_
 *     minutos — el panel está abierto a internet (ANYONE_ANONYMOUS) y antes se podían probar
 *     contraseñas sin límite. El contador vive en CacheService y se borra al entrar bien.
 *  3) Las contraseñas nuevas deben tener al menos PW_MIN_LEN_ caracteres (las actuales más
 *     cortas siguen sirviendo hasta que se cambien).
 * Ya no hay contraseñas por defecto escritas en el código: CSR_PASSWORD y
 * VISTA_LECTURA_PASSWORD tienen que existir en las Propiedades del script.
 * ========================================================================================= */
var PW_MIN_LEN_ = 8;
var PW_HASH_PREFIX_ = 'h1$';
var PW_HASH_ROUNDS_ = 50;
var INTENTOS_MAX_ = 5;
var BLOQUEO_MIN_ = 15;
var BLOQUEO_ERROR_ = 'Demasiados intentos fallidos. Espera ' + BLOQUEO_MIN_ + ' minutos e intenta de nuevo.';

function hashPassword_(pw, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, '');
  var h = salt + '|' + String(pw);
  for (var i = 0; i < PW_HASH_ROUNDS_; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h));
  }
  return PW_HASH_PREFIX_ + salt + '$' + h;
}

function esHashPassword_(stored) {
  return String(stored || '').indexOf(PW_HASH_PREFIX_) === 0;
}

/** ¿pw coincide con lo guardado? Acepta el formato cifrado y el texto plano de antes. */
function passwordCoincide_(pw, stored) {
  stored = String(stored || '');
  if (!stored) return false;
  if (esHashPassword_(stored)) {
    var salt = stored.slice(PW_HASH_PREFIX_.length).split('$')[0];
    return hashPassword_(pw, salt) === stored;
  }
  return stored === String(pw);
}

/** Mensaje de error si una contraseña nueva no sirve, o '' si está bien. */
function validarPasswordNueva_(pw) {
  pw = String(pw || '').trim();
  if (pw.length < PW_MIN_LEN_) return 'La contraseña debe tener al menos ' + PW_MIN_LEN_ + ' caracteres';
  if (pw.indexOf(SESSION_TOKEN_PREFIX_) === 0) return 'La contraseña no puede empezar con "' + SESSION_TOKEN_PREFIX_ + '"';
  return '';
}

function bloqueado_(clave) {
  try { return Number(CacheService.getScriptCache().get('fail_' + clave) || 0) >= INTENTOS_MAX_; } catch (e) { return false; }
}
function registrarFallo_(clave) {
  try {
    var c = CacheService.getScriptCache();
    c.put('fail_' + clave, String(Number(c.get('fail_' + clave) || 0) + 1), BLOQUEO_MIN_ * 60);
  } catch (e) {}
}
function limpiarFallos_(clave) {
  try { CacheService.getScriptCache().remove('fail_' + clave); } catch (e) {}
}

/** Verifica la contraseña para acceder a "Gestionar CSR". Se guarda (cifrada) en las
 * propiedades del script, en CSR_PASSWORD. */
function checkCsrPassword(pw) {
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('CSR_PASSWORD');
  if (!stored) return { ok: false, error: 'La contraseña de administración no está configurada (falta CSR_PASSWORD en las Propiedades del script).' };
  if (bloqueado_('admin')) return { ok: false, error: BLOQUEO_ERROR_ };
  if (!passwordCoincide_(String(pw || ''), stored)) {
    registrarFallo_('admin');
    return { ok: false, error: 'Contraseña incorrecta.' };
  }
  limpiarFallos_('admin');
  if (!esHashPassword_(stored)) props.setProperty('CSR_PASSWORD', hashPassword_(String(pw || '')));
  return { ok: true };
}

/** Cambia la contraseña de acceso a "Gestionar CSR" (requiere la contraseña actual). */
/* FIX: seguridad — la contraseña de "Gestionar CSR" solo se revisaba en la pantalla
 * (checkCsrPassword abría o no el modal), pero las funciones que ese modal llama (addPersona,
 * removePersona, setPersonaPassword, setPersonaRol, asignarCliente, importLoads…) no la
 * revisaban: cualquiera con el enlace del panel podía llamarlas desde la consola del navegador
 * — por ejemplo, cambiarle la contraseña a otra persona con setPersonaPassword y entrar como ella.
 * Ahora cada una recibe la contraseña de admin como último parámetro y la valida aquí. */
function requireAdmin_(adminPw) {
  return checkCsrPassword(pwAdmin_(adminPw)).ok;
}
var ADMIN_PW_ERROR_ = 'Contraseña de administración incorrecta o vencida. Vuelve a abrir "Gestionar CSR".';

function changeCsrPassword(currentPw, newPw) {
  var lock = acquireLock_(10000, 3);
  try {
    var check = checkCsrPassword(currentPw);
    if (!check.ok) return { ok: false, error: check.error || 'Contraseña actual incorrecta' };
    newPw = String(newPw || '').trim();
    var problema = validarPasswordNueva_(newPw);
    if (problema) return { ok: false, error: problema };
    PropertiesService.getScriptProperties().setProperty('CSR_PASSWORD', hashPassword_(newPw));
    logAdmin_(null, 'Contraseña de Gestionar CSR cambiada', '');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================================
 * VISTA GERENCIA (Fase 3 — Usuarios/roles)
 * Página de solo lectura con TODAS las cargas (sin filtrar por cliente) para quien necesite
 * ver el estatus general sin tener permiso — ni riesgo — de editar nada. Protegida con una
 * contraseña compartida (mismo patrón que "Gestionar CSR"), no con contraseña individual, porque aquí
 * nadie firma nada — solo mira.
 * ========================================================================================= */

/** Verifica la contraseña de acceso a la Vista Gerencia. Se guarda en las propiedades del
 * script, separada de CSR_PASSWORD — cambiar una no afecta la otra. */
function vistaPasswordActual_() {
  return PropertiesService.getScriptProperties().getProperty('VISTA_LECTURA_PASSWORD') || '';
}

/** Login de la Vista Gerencia: si la contraseña es correcta regresa un token (ver
 * crearTokenAcceso_) que la página manda en cada pedido de datos. */
function checkVistaLecturaPassword(pw) {
  var stored = vistaPasswordActual_();
  if (!stored) return { ok: false, error: 'La contraseña de la Vista Gerencia no está configurada (falta VISTA_LECTURA_PASSWORD en las Propiedades del script).' };
  if (bloqueado_('vista')) return { ok: false, error: BLOQUEO_ERROR_ };
  if (!passwordCoincide_(String(pw || ''), stored)) {
    registrarFallo_('vista');
    return { ok: false, error: 'Contraseña incorrecta' };
  }
  limpiarFallos_('vista');
  if (!esHashPassword_(stored)) {
    stored = hashPassword_(String(pw || ''));
    PropertiesService.getScriptProperties().setProperty('VISTA_LECTURA_PASSWORD', stored);
  }
  return { ok: true, token: crearTokenAcceso_('vg', { h: huellaPassword_(stored) }) };
}

/** true si el token de la Vista Gerencia sigue vigente y se creó con la contraseña actual. */
function vistaTokenValido_(token) {
  var d = leerTokenAcceso_('vg', token);
  return !!d && d.h === huellaPassword_(vistaPasswordActual_());
}

// Estatus que se consideran "algo anda mal" para efectos de "necesita acción" en la Vista
// Gerencia y en el panel interno (es la misma lista, ver configPanel_). Antes el servidor tenía
// además TONU, Cancelado. y Patio permisionario, así que la Vista Gerencia marcaba como "necesita
// acción" cargas que el panel no. Aquí no se repite la señal de "sin comentarios recientes"
// porque esta vista no carga el historial de comentarios.
var PROBLEM_STATUSES_GS = ['Descompuesta', 'En resguardo', '(HOS)'];
var AUTO_REVIEW_STATUSES_GS = ['En transito'];
// Cada cuántas horas toca revisar una carga "En transito" (el panel usa este mismo valor).
var AUTO_REVIEW_HOURS_GS = 3;

/** Las cargas "En transito" piden revisión cada AUTO_REVIEW_HOURS_GS horas (el aviso "Van más
 * de 3h sin revisar"). Antes solo se apagaba con el botón "Ya revisé"; ahora también cuenta como
 * revisión agregar un comentario o registrar un aviso al cliente, porque para hacerlo el CSR ya
 * revisó la carga. Si la carga no está en un estatus de revisión automática, no hace nada.
 * Regresa la nueva fecha (ISO) o '' si no aplicó. */
function reiniciarRevisionTransito_(sheet, rowIndex, usuario) {
  var status = String(sheet.getRange(rowIndex, COLUMNS.indexOf('status') + 1).getValue() || '').trim();
  if (AUTO_REVIEW_STATUSES_GS.indexOf(status) === -1) return '';
  var proxima = new Date(Date.now() + AUTO_REVIEW_HOURS_GS * 3600000);
  sheet.getRange(rowIndex, COLUMNS.indexOf('recordatorio_fecha') + 1).setValue(proxima.toISOString());
  stampUpdated_(sheet, rowIndex, usuario);
  return proxima.toISOString();
}
var ATTENTION_DELAY_MIN_GS = 90;

/** Mismo criterio que isRecordatorioVencido() en PanelScript.html: true si el estatus exige un
 * recordatorio (manual o de revisión automática) y ya se cumplió (o, para los de revisión
 * automática, nunca se ha puesto fecha, lo cual también cuenta como vencido). */
function estaVencidoRecordatorio_(rec) {
  var status = String(rec.status || '').trim();
  var esAutoReview = AUTO_REVIEW_STATUSES_GS.indexOf(status) !== -1;
  if (!esAutoReview && REMINDER_STATUSES_GS.indexOf(status) === -1) return false;
  if (!rec.recordatorio_fecha) return esAutoReview;
  var fecha = new Date(rec.recordatorio_fecha);
  return !isNaN(fecha.getTime()) && fecha.getTime() <= Date.now();
}

/** Versión simplificada de needsAttention() (PanelScript.html) para la Vista Gerencia: mismas señales
 * salvo la de "sin comentarios recientes" (ver comentario arriba). Se apoya en el alertLevel ya
 * calculado por deriveAlertLevel_ en vez de repetir esa cuenta de horas aquí. */
function deriveNeedsAction_(rec, alertLevel) {
  var status = String(rec.status || '').trim();
  if (status === 'TONU' && !!rec.recargos_vg) return false; // ya cancelada/finalizada, no aplica
  if (DONE_STATUSES_GS.indexOf(status) !== -1) return !rec.pod_sent; // entregada, solo falta el POD
  if (alertLevel === 'critical') return true;
  if (PROBLEM_STATUSES_GS.indexOf(status) !== -1) return true;
  if (estaVencidoRecordatorio_(rec)) return true;
  if (rec.pickup_delta_min !== null && rec.pickup_delta_min !== '' && Math.abs(Number(rec.pickup_delta_min)) > ATTENTION_DELAY_MIN_GS) return true;
  if (rec.delivery_delta_min !== null && rec.delivery_delta_min !== '' && Math.abs(Number(rec.delivery_delta_min)) > ATTENTION_DELAY_MIN_GS) return true;
  if (Number(rec.incidenciasCount) > 0) return true;
  return false;
}

/** Mapa {cliente en minúsculas -> csr} a partir de la hoja "CSR_Clientes", para agrupar la
 * Vista Gerencia por CSR sin tener que buscar cliente por cliente. Mismo criterio de comparación
 * (sin importar mayúsculas/minúsculas) que ya usa el panel interno para su propio filtro por CSR. */
function getCsrParaCliente_() {
  var sheet = getCsrClientesSheet_();
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  values.forEach(function (row) {
    var cliente = String(row[0] || '').trim().toLowerCase();
    if (cliente) map[cliente] = String(row[1] || '').trim();
  });
  return map;
}

/** Todas las cargas activas (sin filtrar por cliente, a diferencia de getLoadsForCliente), ya
 * con su etapa de timeline y su nivel de alerta calculados — para no repetir esa lógica en el
 * navegador. A diferencia del Portal Cliente, aquí SÍ se manda todo el registro (es uso
 * interno, no hay nada que esconder entre compañeros de equipo). Además trae el CSR asignado
 * (rec.csr, vía CSR_Clientes) y si necesita acción (rec.needsAction) para que la vista pueda
 * agrupar por CSR y separar lo urgente sin tener que recalcularlo en el navegador. */
function getLoadsParaVista(token) {
  if (!vistaTokenValido_(token)) return { ok: false, error: SESION_PORTAL_VENCIDA_ };
  var loads = leerLoads_();
  var csrMap = getCsrParaCliente_();
  loads.forEach(function (rec) {
    var stageIndex = deriveTimelineStage_(rec);
    var alert = deriveAlertLevel_(rec, stageIndex);
    rec.stageIndex = stageIndex;
    rec.stageKey = TIMELINE_STAGES_GS[stageIndex].key;
    rec.stageLabel = TIMELINE_STAGES_GS[stageIndex].label;
    rec.alertLevel = alert.level;
    rec.alertMessage = alert.message;
    rec.csr = csrMap[String(rec.customer || '').trim().toLowerCase()] || '';
    rec.needsAction = deriveNeedsAction_(rec, alert.level);
  });
  return JSON.parse(JSON.stringify(loads));
}

/** Incidencias de una carga para la Vista Gerencia — antes la vista usaba getIncidencias (la del
 * panel), que ahora exige sesión de CSR; esta valida el token de la vista. */
function getIncidenciasParaVista(load, token) {
  if (!vistaTokenValido_(token)) return { ok: false, error: SESION_PORTAL_VENCIDA_ };
  return leerIncidencias_(load);
}

/** Devuelve (y crea si hace falta) la hoja "Pendientes" — registros de cargas que el cliente
 * todavía no ha confirmado, por eso no tienen número de load. En cuanto se confirme y se genere
 * el load real, se captura normal en "Loads" (por Excel) y este registro se borra a mano desde el
 * panel. Nunca se mezcla con la hoja "Loads". */
function getPendientesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Pendientes');
  if (!sheet) {
    sheet = ss.insertSheet('Pendientes');
    sheet.appendRow(['id', 'cliente', 'origen', 'destino', 'fecha_estimada', 'nota', 'creado_por', 'creado_en']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getPendientes(usuario, password) {
  usuario = String(usuario || '').trim();
  if (!usuario) return JSON.stringify([]);
  // Antes bastaba con mandar cualquier nombre para ver los pendientes de esa persona.
  if (!sesionOk_(usuario, password)) return JSON.stringify([]);
  var miInfo = getPersonaInfo_(usuario);
  var esSupervisor = !!(miInfo && miInfo.rol === 'Supervisor');
  var sheet = getPendientesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify([]);
  var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var out = values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .filter(function (row) { return esSupervisor || namesMatch_(row[6], usuario); })
    .map(function (row) {
      var creadoEn = row[7];
      return {
        id: String(row[0]),
        cliente: String(row[1] || ''),
        origen: String(row[2] || ''),
        destino: String(row[3] || ''),
        fecha_estimada: row[4] ? String(row[4]) : '',
        nota: String(row[5] || ''),
        creado_por: String(row[6] || ''),
        creado_en: (creadoEn instanceof Date) ? creadoEn.toISOString() : String(creadoEn || '')
      };
    });
  out.sort(function (a, b) { return new Date(b.creado_en) - new Date(a.creado_en); });
  return JSON.stringify(out);
}

/** Agrega un registro sin load todavía. Verifica la contraseña de quien lo captura (mismo mecanismo que
 * los comentarios) para saber con certeza quién lo dio de alta. */
function addPendiente(cliente, origen, destino, fechaEstimada, nota, creadoPor, password) {
  cliente = String(cliente || '').trim();
  if (!cliente) return { ok: false, error: 'Falta el cliente' };
  var check = requireLogin_(creadoPor, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPendientesSheet_();
    var id = Utilities.getUuid();
    var now = new Date();
    sheet.appendRow([id, cliente, String(origen || '').trim(), String(destino || '').trim(), String(fechaEstimada || '').trim(), String(nota || '').trim(), creadoPor, now]);
    SpreadsheetApp.flush();
    touchLastModified_('pendientes');
    return { ok: true, id: id, creado_en: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/** Elimina un registro pendiente (por ejemplo, en cuanto el cliente confirma y ya se generó el load real). */
function removePendiente(id, usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para continuar' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPendientesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(id)) {
        sheet.deleteRow(i + 2);
        touchLastModified_('pendientes');
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrado' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Vincula un registro de "Pendientes de load" con el load real una vez que el cliente ya lo
 * confirmó y se capturó en "Loads" (por Excel). Combina todo el historial en uno solo:
 *  - Si el pendiente tenía una nota libre, se pasa como primer comentario del load (para no
 *    perderla).
 *  - Todos los comentarios que ya tenía el pendiente (misma hoja "Comentarios", solo que
 *    guardados bajo su id en vez de un número de load) se re-etiquetan bajo el load real, así
 *    quedan mezclados con el resto del historial de esa carga, en orden cronológico.
 *  - Se agrega un comentario de rastro dejando claro de dónde salió todo esto.
 *  - Por último, se borra el registro de "Pendientes" (ya cumplió su función).
 * Verifica la contraseña de quien lo hace, igual que addComment/addPendiente.
 */
function vincularPendiente(pendienteId, load, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  load = String(load || '').trim();
  if (!load) return { ok: false, error: 'Falta elegir el load' };

  var lock = acquireLock_(15000, 3);
  try {
    // El load tiene que existir ya en "Loads" (se captura por Excel, nunca a mano).
    var sheet = getSheet_();
    var loadExiste = findLoadRow_(sheet, load) !== -1;
    if (!loadExiste) return { ok: false, error: 'Ese load todavía no está en "Loads" — impórtalo primero' };

    var pSheet = getPendientesSheet_();
    var pLastRow = pSheet.getLastRow();
    var pRowIndex = -1, pData = null;
    if (pLastRow >= 2) {
      var pValues = pSheet.getRange(2, 1, pLastRow - 1, 8).getValues();
      for (var j = 0; j < pValues.length; j++) {
        if (String(pValues[j][0]) === String(pendienteId)) { pRowIndex = j + 2; pData = pValues[j]; break; }
      }
    }
    if (!pData) return { ok: false, error: 'Ese registro pendiente ya no existe' };

    var cSheet = getCommentsSheet_();
    var now = new Date();

    // La nota libre del pendiente (si tenía) se pasa como comentario, para que no se pierda.
    var cliente = String(pData[1] || '');
    var nota = String(pData[5] || '').trim();
    if (nota) {
      cSheet.appendRow([load, now, 'Nota de "Pendientes de load": ' + nota, String(pData[6] || usuario)]);
    }

    // Re-etiqueta (mueve) los comentarios que ya tenía el pendiente al load real.
    var cLastRow = cSheet.getLastRow();
    var comentariosMovidos = 0;
    if (cLastRow >= 2) {
      var cValues = cSheet.getRange(2, 1, cLastRow - 1, 1).getValues();
      for (var k = 0; k < cValues.length; k++) {
        if (String(cValues[k][0]) === String(pendienteId)) {
          cSheet.getRange(k + 2, 1).setValue(load);
          comentariosMovidos++;
        }
      }
    }

    // Comentario de rastro, para que quede claro en el historial de dónde salió todo esto.
    cSheet.appendRow([load, now, 'Vinculado desde "Pendientes de load" (cliente: ' + cliente + ') por ' + usuario + '.', usuario]);
    SpreadsheetApp.flush();

    // Ya se combinó todo con el load real — el registro pendiente se borra.
    pSheet.deleteRow(pRowIndex);

    touchLastModified_(['pendientes', 'loads', 'comentarios']);
    return { ok: true, comentariosMovidos: comentariosMovidos };
  } finally {
    lock.releaseLock();
  }
}

// ===== Loads apartados (regreso cargado) =====
// Loads de otros CSR (en Vanguard) que alguien aparta para regresar cargado. Flujo:
//   cruce     → monitorear que el viaje cruce frontera y sea despachado
//   transito  → ya cruzó: revisar cuándo entrega en destino
//   entregado → ya entregó: decidir si sirve para mi carga
//   broker    → no hubo carga propia: se ofrece a broker y se sigue recordando cada X horas
//   usado / liberado → cerrado
// "proxima_revision" es lo que dispara el aviso en la campana del panel; se recalcula en cada
// cambio (ver proximaRevisionApartado_). Hoja propia, nunca se mezcla con "Loads".
var APARTADOS_COLUMNS = ['id', 'load', 'csr_dueno', 'origen', 'destino', 'fecha_cruce', 'fecha_entrega', 'mi_carga',
  'fecha_mi_carga', 'frecuencia_horas', 'estado', 'proxima_revision', 'nota', 'creado_por', 'creado_en',
  'actualizado_por', 'actualizado_en', 'historial'];
var APARTADO_ESTADOS_ = {
  cruce: 'Monitoreando cruce', transito: 'Cruzó — esperando entrega', entregado: 'Entregó en destino',
  broker: 'En broker', usado: 'Usado para mi carga', liberado: 'Liberado'
};
var APARTADO_CERRADOS_ = ['usado', 'liberado'];
var APARTADO_FRECUENCIA_DEFAULT_ = 3;
var APARTADO_FECHAS_ = ['fecha_cruce', 'fecha_entrega', 'fecha_mi_carga', 'proxima_revision', 'creado_en', 'actualizado_en'];

function getApartadosSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Apartados');
  if (!sheet) {
    sheet = ss.insertSheet('Apartados');
    sheet.appendRow(APARTADOS_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function fechaApartadoIso_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  v = String(v || '').trim();
  if (!v) return '';
  var d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function apartadoDesdeFila_(row) {
  var a = {};
  APARTADOS_COLUMNS.forEach(function (c, i) { a[c] = row[i] === null || row[i] === undefined ? '' : row[i]; });
  APARTADO_FECHAS_.forEach(function (c) { a[c] = fechaApartadoIso_(a[c]); });
  ['id', 'load', 'csr_dueno', 'origen', 'destino', 'mi_carga', 'estado', 'nota', 'creado_por', 'actualizado_por'].forEach(function (c) { a[c] = String(a[c]); });
  a.frecuencia_horas = Number(a.frecuencia_horas) || APARTADO_FRECUENCIA_DEFAULT_;
  if (!APARTADO_ESTADOS_[a.estado]) a.estado = 'cruce';
  var hist = [];
  try { hist = JSON.parse(String(a.historial || '[]')); } catch (e) {}
  a.historial = Array.isArray(hist) ? hist : [];
  return a;
}

function apartadoAFila_(a) {
  return APARTADOS_COLUMNS.map(function (c) {
    if (c === 'historial') return JSON.stringify((a.historial || []).slice(-40));
    return a[c] === undefined || a[c] === null ? '' : a[c];
  });
}

/** Cuándo toca volver a revisar el apartado según en qué paso va:
 *  - cruce: en la fecha de cruce; si ya pasó (o no hay), cada "frecuencia_horas" hasta que cruce.
 *  - transito: en la fecha de entrega en destino; si ya pasó (o no hay), cada "frecuencia_horas".
 *  - entregado / broker: cada "frecuencia_horas" hasta que se cierre.
 *  - usado / liberado: ya no se recuerda. */
function proximaRevisionApartado_(a, ahora) {
  if (APARTADO_CERRADOS_.indexOf(a.estado) !== -1) return '';
  var ms = ahora.getTime(), cada = ms + (Number(a.frecuencia_horas) || APARTADO_FRECUENCIA_DEFAULT_) * 3600000;
  var objetivo = a.estado === 'cruce' ? a.fecha_cruce : (a.estado === 'transito' ? a.fecha_entrega : '');
  var o = objetivo ? new Date(objetivo).getTime() : NaN;
  return new Date(!isNaN(o) && o > ms ? o : cada).toISOString();
}

function agregarHistorialApartado_(a, usuario, texto, ahora) {
  a.historial = (a.historial || []).concat([{ ts: ahora.toISOString(), por: usuario, txt: texto }]);
}

function buscarApartado_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !id) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, APARTADOS_COLUMNS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return { rowIndex: i + 2, a: apartadoDesdeFila_(values[i]) };
  }
  return null;
}

function puedeEditarApartado_(a, check) {
  return check.rol === 'Supervisor' || namesMatch_(a.creado_por, check.nombre);
}

/** Lee el apartado, valida permisos, aplica "cambio" y lo guarda. Regresa el apartado actualizado. */
function modificarApartado_(id, usuario, password, cambio) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getApartadosSheet_();
    var hit = buscarApartado_(sheet, id);
    if (!hit) return { ok: false, error: 'Ese apartado ya no existe' };
    if (!puedeEditarApartado_(hit.a, check)) return { ok: false, error: 'Solo quien lo apartó (o un supervisor) puede cambiarlo' };
    var ahora = new Date();
    var err = cambio(hit.a, ahora, check.nombre);
    if (err) return { ok: false, error: err };
    hit.a.actualizado_por = check.nombre;
    hit.a.actualizado_en = ahora.toISOString();
    sheet.getRange(hit.rowIndex, 1, 1, APARTADOS_COLUMNS.length).setValues([apartadoAFila_(hit.a)]);
    SpreadsheetApp.flush();
    touchLastModified_('apartados');
    return { ok: true, apartado: hit.a };
  } finally {
    lock.releaseLock();
  }
}

/** Apartados de quien inició sesión (un supervisor ve los de todos). */
function getApartados(usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar', items: [] };
  var sheet = getApartadosSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, items: [] };
  var items = sheet.getRange(2, 1, lastRow - 1, APARTADOS_COLUMNS.length).getValues()
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(apartadoDesdeFila_)
    .filter(function (a) { return check.rol === 'Supervisor' || namesMatch_(a.creado_por, check.nombre); });
  return { ok: true, items: items };
}

/** Alta (sin datos.id) o edición (con datos.id) de un apartado. */
function guardarApartado(datos, usuario, password) {
  datos = datos || {};
  var load = String(datos.load || '').trim();
  if (!load) return { ok: false, error: 'Falta el número de load apartado' };
  var limpiar = function (a) {
    a.load = load;
    ['csr_dueno', 'origen', 'destino', 'mi_carga', 'nota'].forEach(function (c) { a[c] = String(datos[c] || '').trim().slice(0, 500); });
    ['fecha_cruce', 'fecha_entrega', 'fecha_mi_carga'].forEach(function (c) { a[c] = fechaApartadoIso_(datos[c]); });
    var f = Number(datos.frecuencia_horas);
    a.frecuencia_horas = f >= 0.5 && f <= 48 ? f : APARTADO_FRECUENCIA_DEFAULT_;
  };
  if (datos.id) {
    return modificarApartado_(datos.id, usuario, password, function (a, ahora, quien) {
      limpiar(a);
      a.proxima_revision = proximaRevisionApartado_(a, ahora);
      agregarHistorialApartado_(a, quien, 'Editó los datos', ahora);
    });
  }
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  var lock = acquireLock_(10000, 3);
  try {
    var ahora = new Date();
    var a = { id: Utilities.getUuid(), estado: 'cruce', creado_por: check.nombre, creado_en: ahora.toISOString(),
      actualizado_por: check.nombre, actualizado_en: ahora.toISOString(), historial: [] };
    limpiar(a);
    a.proxima_revision = proximaRevisionApartado_(a, ahora);
    agregarHistorialApartado_(a, check.nombre, 'Apartó el load', ahora);
    getApartadosSheet_().appendRow(apartadoAFila_(a));
    SpreadsheetApp.flush();
    touchLastModified_('apartados');
    return { ok: true, apartado: a };
  } finally {
    lock.releaseLock();
  }
}

/** Avanza (o regresa) el apartado de paso: cruce → transito → entregado → usado | broker | liberado. */
function cambiarEstadoApartado(id, estado, nota, usuario, password) {
  estado = String(estado || '').trim();
  if (!APARTADO_ESTADOS_[estado]) return { ok: false, error: 'Estado no válido' };
  nota = String(nota || '').trim().slice(0, 500);
  return modificarApartado_(id, usuario, password, function (a, ahora, quien) {
    if (a.estado === estado && !nota) return 'Ya está en "' + APARTADO_ESTADOS_[estado] + '"';
    var antes = a.estado;
    a.estado = estado;
    a.proxima_revision = proximaRevisionApartado_(a, ahora);
    agregarHistorialApartado_(a, quien, (antes === estado ? '' : APARTADO_ESTADOS_[antes] + ' → ' + APARTADO_ESTADOS_[estado]) + (nota ? (antes === estado ? '' : ' · ') + nota : ''), ahora);
  });
}

/** "Ya revisé": recalcula la próxima revisión (vuelve a avisar en la fecha clave o en X horas). */
function revisarApartado(id, nota, usuario, password) {
  nota = String(nota || '').trim().slice(0, 500);
  return modificarApartado_(id, usuario, password, function (a, ahora, quien) {
    if (APARTADO_CERRADOS_.indexOf(a.estado) !== -1) return 'Este apartado ya está cerrado';
    a.proxima_revision = proximaRevisionApartado_(a, ahora);
    agregarHistorialApartado_(a, quien, 'Revisó' + (nota ? ': ' + nota : ''), ahora);
  });
}

function eliminarApartado(id, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getApartadosSheet_();
    var hit = buscarApartado_(sheet, id);
    if (!hit) return { ok: false, error: 'Ese apartado ya no existe' };
    if (!puedeEditarApartado_(hit.a, check)) return { ok: false, error: 'Solo quien lo apartó (o un supervisor) puede borrarlo' };
    sheet.deleteRow(hit.rowIndex);
    touchLastModified_('apartados');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ===== Radar de millas: coordenadas de ciudades =====
// El panel ubica cada ciudad UNA sola vez (OpenStreetMap, desde el navegador — gratis, sin
// cuenta) y la guarda aquí para todo el equipo; las siguientes veces ya no consulta afuera.
// Llave = ciudad|estado normalizados (minúsculas, sin acentos, sin puntos), igual que en el panel.
var COORDENADAS_COLUMNS = ['key', 'ciudad', 'estado', 'lat', 'lon', 'guardado_por', 'guardado_en'];

function getCoordenadasSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Coordenadas');
  if (!sheet) {
    sheet = ss.insertSheet('Coordenadas');
    sheet.appendRow(COORDENADAS_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** { ok, items: { key: [lat, lon] } } */
function getCoordenadas(usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para continuar', items: {} };
  return { ok: true, items: cacheGeoLeer_('coord', leerCoordenadas_) };
}

function leerCoordenadas_() {
  var sheet = getCoordenadasSheet_();
  var items = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().forEach(function (r) {
      var lat = Number(r[3]), lon = Number(r[4]);
      if (r[0] && r[3] !== '' && !isNaN(lat) && !isNaN(lon)) items[String(r[0])] = [lat, lon];
    });
  }
  return items;
}

/** Guarda las ciudades que el panel acaba de ubicar. Ignora las que ya existen o traen datos raros. */
function guardarCoordenadas(lista, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  if (!Array.isArray(lista) || !lista.length) return { ok: true, guardadas: 0 };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getCoordenadasSheet_();
    var existentes = {};
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { existentes[String(r[0])] = true; });
    }
    var ahora = new Date(), filas = [];
    lista.slice(0, 200).forEach(function (c) {
      var key = String(c && c.key || '').trim().slice(0, 120);
      var lat = Number(c && c.lat), lon = Number(c && c.lon);
      if (!key || key.indexOf('|') === -1 || existentes[key]) return;
      if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      existentes[key] = true;
      filas.push([key, String(c.ciudad || '').slice(0, 80), String(c.estado || '').slice(0, 40), lat, lon, check.nombre, ahora]);
    });
    if (filas.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, filas.length, COORDENADAS_COLUMNS.length).setValues(filas);
      cacheGeoBorrar_('coord');
    }
    return { ok: true, guardadas: filas.length };
  } finally {
    lock.releaseLock();
  }
}

// Distancias ya calculadas entre dos ciudades (millas por carretera de OSRM — el ruteo gratuito
// de OpenStreetMap — y la línea recta). Se guardan para que el mismo trayecto no se vuelva a
// consultar nunca; con el tiempo queda una base propia de distancias del equipo.
// Millas "certificadas" con Google Maps: un proceso automático (procesarMillasGoogle, cada hora)
// completa millas_google/horas_google de los trayectos que no las tengan, con el servicio de
// mapas incluido en Apps Script (gratis, con límite diario de consultas). Una vez guardadas
// quedan FIJAS: el proceso nunca las vuelve a consultar ni las sobrescribe. Solo un supervisor
// puede pedir que se recalcule un trayecto (recalcularMillasGoogle).
var DISTANCIAS_COLUMNS = ['key', 'origen', 'destino', 'millas_carretera', 'horas', 'millas_recta', 'fuente', 'guardado_por', 'guardado_en',
  'millas_google', 'horas_google', 'google_en', 'google_estado'];
var DC_ = function (c) { return DISTANCIAS_COLUMNS.indexOf(c); };

function getDistanciasSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Distancias');
  if (!sheet) {
    sheet = ss.insertSheet('Distancias');
    sheet.appendRow(DISTANCIAS_COLUMNS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < DISTANCIAS_COLUMNS.length) {
    // Hoja creada con la versión anterior (sin columnas de Google): se agregan los encabezados.
    sheet.getRange(1, 1, 1, DISTANCIAS_COLUMNS.length).setValues([DISTANCIAS_COLUMNS]);
  }
  return sheet;
}

function leerDistanciasFilas_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, DISTANCIAS_COLUMNS.length).getValues();
}

/** Filas de "Distancias" para LEER (getDistancias, búsquedas guardadas): salen de la memoria
 * temporal del servidor si ya se leyeron hace poco. Quien escribe usa leerDistanciasFilas_. */
function distanciasConCache_() {
  return cacheGeoLeer_('dist', function () { return leerDistanciasFilas_(getDistanciasSheet_()); });
}

/* Memoria temporal (CacheService, 6 h) para las hojas del Radar, que crecen sin parar y antes se
 * leían completas en cada consulta. Se guarda en pedazos porque cada valor del caché tiene límite
 * de tamaño. Cualquier escritura en esas hojas borra su copia (cacheGeoBorrar_). */
var GEO_CACHE_TTL_ = 21600;
var GEO_CACHE_PEDAZO_ = 45000;
function cacheGeoLeer_(nombre, leer) {
  var cache = CacheService.getScriptCache(), base = 'geo_' + nombre + '_';
  try {
    var n = Number(cache.get(base + 'n') || 0);
    if (n > 0) {
      var claves = [];
      for (var i = 0; i < n; i++) claves.push(base + i);
      var partes = cache.getAll(claves), txt = '';
      for (var j = 0; j < n && txt !== null; j++) txt = (partes[claves[j]] === undefined || partes[claves[j]] === null) ? null : txt + partes[claves[j]];
      if (txt !== null) return JSON.parse(txt);
    }
  } catch (e) {}
  var datos = leer();
  try {
    var s = JSON.stringify(datos), pedazos = {}, k = 0;
    for (var p = 0; p < s.length; p += GEO_CACHE_PEDAZO_) pedazos[base + (k++)] = s.slice(p, p + GEO_CACHE_PEDAZO_);
    if (k > 0 && k <= 40) {
      cache.putAll(pedazos, GEO_CACHE_TTL_);
      cache.put(base + 'n', String(k), GEO_CACHE_TTL_);
    }
  } catch (e2) {}
  // Siempre la misma forma que lo que sale del caché (las fechas como texto).
  return JSON.parse(JSON.stringify(datos));
}
function cacheGeoBorrar_(nombre) {
  try { CacheService.getScriptCache().remove('geo_' + nombre + '_n'); } catch (e) {}
}

/** Millas a mostrar de una fila: las de Google si ya están, si no las de OpenStreetMap (OSRM). */
function datoDistancia_(r) {
  var g = r[DC_('millas_google')];
  if (g !== '' && g !== null && !isNaN(Number(g))) {
    return { millas: Number(g), horas: Number(r[DC_('horas_google')]) || 0, fuente: 'google', osm: Number(r[3]) || null };
  }
  var m = Number(r[3]);
  if (r[3] === '' || isNaN(m)) return null;
  return { millas: m, horas: Number(r[4]) || 0, fuente: 'osm' };
}

/** Distancias guardadas desde (o hacia) una ciudad: { ok, items: { llaveOtraCiudad: { millas, horas, fuente } } }.
 * Por carretera A→B y B→A son prácticamente iguales, así que se aprovechan en ambos sentidos. */
function getDistancias(origenKey, usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para continuar', items: {} };
  origenKey = String(origenKey || '').trim();
  var items = {};
  if (!origenKey) return { ok: true, items: items };
  distanciasConCache_().forEach(function (r) {
    if (!r[0]) return;
    var dato = datoDistancia_(r);
    if (!dato) return;
    dato.key = String(r[0]);
    if (String(r[1]) === origenKey) items[String(r[2])] = dato;
    else if (String(r[2]) === origenKey && !items[String(r[1])]) items[String(r[1])] = dato;
  });
  return { ok: true, items: items };
}

/** Coordenadas [lat, lon] de una llave (ciudad|estado → "Coordenadas"; dir:… → "Direcciones"). */
function coordenadasDeLlaves_() {
  var out = {};
  var cs = getCoordenadasSheet_();
  if (cs.getLastRow() >= 2) {
    cs.getRange(2, 1, cs.getLastRow() - 1, 5).getValues().forEach(function (r) {
      if (r[0] && !isNaN(Number(r[3])) && !isNaN(Number(r[4])) && r[3] !== '') out[String(r[0])] = [Number(r[3]), Number(r[4])];
    });
  }
  var dirs = leerDirecciones_();
  Object.keys(dirs).forEach(function (k) { out[k] = [dirs[k].lat, dirs[k].lon]; });
  return out;
}

/** Pide a Google Maps (servicio incluido en Apps Script) las millas por carretera entre dos puntos. */
function rutaGoogle_(o, d) {
  var res = Maps.newDirectionFinder().setOrigin(o[0], o[1]).setDestination(d[0], d[1])
    .setMode(Maps.DirectionFinder.Mode.DRIVING).getDirections();
  if (!res || !res.routes || !res.routes.length || !res.routes[0].legs || !res.routes[0].legs.length) return null;
  var leg = res.routes[0].legs[0];
  return { millas: leg.distance.value / 1609.344, horas: leg.duration.value / 3600 };
}

/** Proceso automático (cada hora, ver activarMillasGoogle): completa con Google las distancias
 * que todavía no tengan millas de Google. Nunca toca las que ya tienen. Si se acaba el límite
 * diario de Google, se detiene y sigue en la siguiente corrida. */
function procesarMillasGoogle(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  var inicio = Date.now(), MAX_POR_CORRIDA = 80, hechas = 0, sinRuta = 0, error = '';
  var sheet = getDistanciasSheet_();
  var filas = leerDistanciasFilas_(sheet);
  if (!filas.length) return { ok: true, hechas: 0 };
  var coords = coordenadasDeLlaves_();
  for (var i = 0; i < filas.length && hechas + sinRuta < MAX_POR_CORRIDA; i++) {
    if (Date.now() - inicio > 4 * 60 * 1000) break; // margen antes del límite de 6 min de Apps Script
    var r = filas[i];
    if (!r[0] || r[DC_('millas_google')] !== '' || String(r[DC_('google_estado')]) === 'sin ruta') continue;
    var o = coords[String(r[1])], d = coords[String(r[2])];
    if (!o || !d) continue;
    var ruta;
    try {
      ruta = rutaGoogle_(o, d);
    } catch (e) {
      error = String(e && e.message || e); // casi siempre: se acabó el límite diario de Google
      break;
    }
    var fila = i + 2, ahora = new Date();
    if (ruta) {
      sheet.getRange(fila, DC_('millas_google') + 1, 1, 4).setValues([[Math.round(ruta.millas * 10) / 10, Math.round(ruta.horas * 10) / 10, ahora, 'ok']]);
      hechas++;
    } else {
      sheet.getRange(fila, DC_('google_en') + 1, 1, 2).setValues([[ahora, 'sin ruta']]);
      sinRuta++;
    }
  }
  if (hechas || sinRuta) { cacheGeoBorrar_('dist'); touchLastModified_('distancias'); }
  return { ok: !error, hechas: hechas, sinRuta: sinRuta, error: error };
}

/** Ejecútala UNA vez desde el editor de Apps Script (botón ▶ con esta función elegida): deja el
 * proceso de millas de Google corriendo solo cada hora y hace la primera corrida. */
function activarMillasGoogle(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  // Paso 1: el proceso automático (cada hora). Cada paso va por separado y deja su resultado en
  // el "Registro de ejecución", para saber exactamente qué falló si algo falla.
  try {
    var existente = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'procesarMillasGoogle'; });
    if (existente.length) {
      Logger.log('Paso 1 OK: el proceso automático ya estaba activo (no se duplicó).');
    } else {
      ScriptApp.newTrigger('procesarMillasGoogle').timeBased().everyHours(1).create();
      Logger.log('Paso 1 OK: proceso automático creado (cada hora).');
    }
  } catch (e) {
    Logger.log('Paso 1 FALLÓ (crear el proceso automático): ' + (e && e.message || e));
    Logger.log('Vuelve a ejecutar activarMillasGoogle en un minuto; si se repite, revisa Activadores (ícono de reloj).');
    return;
  }
  // Paso 2: prueba de Google Maps con un trayecto conocido.
  var prueba = probarGoogleMaps();
  if (!prueba.ok) return;
  // Paso 3: primera corrida con lo que ya está guardado.
  var r = procesarMillasGoogle();
  Logger.log('Paso 3: primera corrida — ' + r.hechas + ' trayectos completados con Google' + (r.sinRuta ? ', ' + r.sinRuta + ' sin ruta' : '') +
    (r.error ? '. Se detuvo: ' + r.error : '.'));
}

/** Prueba suelta de Google Maps (Laredo → Dallas). Se puede ejecutar sola desde el editor. */
function probarGoogleMaps(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  try {
    var ruta = rutaGoogle_([27.5306, -99.4803], [32.7767, -96.797]);
    if (!ruta) { Logger.log('Paso 2: Google Maps respondió pero sin ruta.'); return { ok: false }; }
    Logger.log('Paso 2 OK: Google Maps funciona — Laredo → Dallas = ' + Math.round(ruta.millas) + ' mi.');
    return { ok: true };
  } catch (e) {
    Logger.log('Paso 2 FALLÓ (Google Maps): ' + (e && e.message || e));
    Logger.log('Si dice "error desconocido" o "too many times", Google limitó el servicio por hoy: el proceso automático lo reintentará solo cada hora.');
    return { ok: false };
  }
}

/** Por si algún día se quiere apagar el proceso automático. */
function desactivarMillasGoogle(e) {
  if (!esMantenimientoPermitido_(e)) return { ok: false, error: MANTENIMIENTO_ERROR_ };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarMillasGoogle') ScriptApp.deleteTrigger(t);
  });
  return { ok: true };
}

/** Solo supervisor: vuelve a pedir a Google un trayecto (por si cambió la ruta) y lo deja fijo de nuevo. */
function recalcularMillasGoogle(key, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  if (check.rol !== 'Supervisor') return { ok: false, error: 'Solo un supervisor puede recalcular las millas' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getDistanciasSheet_(), filas = leerDistanciasFilas_(sheet);
    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i][0]) !== String(key)) continue;
      var coords = coordenadasDeLlaves_(), o = coords[String(filas[i][1])], d = coords[String(filas[i][2])];
      if (!o || !d) return { ok: false, error: 'No están guardadas las coordenadas de ese trayecto' };
      var ruta;
      try { ruta = rutaGoogle_(o, d); } catch (e) { return { ok: false, error: 'Google Maps no respondió (¿límite del día?): ' + (e && e.message || e) }; }
      if (!ruta) return { ok: false, error: 'Google Maps no encontró ruta por carretera' };
      var dato = { millas: Math.round(ruta.millas * 10) / 10, horas: Math.round(ruta.horas * 10) / 10, fuente: 'google' };
      sheet.getRange(i + 2, DC_('millas_google') + 1, 1, 4).setValues([[dato.millas, dato.horas, new Date(), 'recalculado por ' + check.nombre]]);
      cacheGeoBorrar_('dist');
      touchLastModified_('distancias');
      return { ok: true, dato: dato };
    }
    return { ok: false, error: 'Ese trayecto no está guardado' };
  } finally {
    lock.releaseLock();
  }
}

function guardarDistancias(lista, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  if (!Array.isArray(lista) || !lista.length) return { ok: true, guardadas: 0 };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getDistanciasSheet_();
    var existentes = {};
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { existentes[String(r[0])] = true; });
    }
    var ahora = new Date(), filas = [];
    lista.slice(0, 300).forEach(function (d) {
      var o = String(d && d.origen || '').trim().slice(0, 120), de = String(d && d.destino || '').trim().slice(0, 120);
      var millas = Number(d && d.millas), horas = Number(d && d.horas), recta = Number(d && d.recta);
      var llaveValida = function (k) { return k.indexOf('|') !== -1 || k.indexOf('dir:') === 0; }; // ciudad|estado o dirección exacta
      if (!o || !de || !llaveValida(o) || !llaveValida(de)) return;
      if (isNaN(millas) || millas < 0 || millas > 6000) return;
      var key = o + '>' + de;
      if (existentes[key] || existentes[de + '>' + o]) return;
      existentes[key] = true;
      filas.push([key, o, de, Math.round(millas * 10) / 10, isNaN(horas) ? '' : Math.round(horas * 10) / 10,
        isNaN(recta) ? '' : Math.round(recta * 10) / 10, 'OSRM', check.nombre, ahora, '', '', '', '']);
    });
    if (filas.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, filas.length, DISTANCIAS_COLUMNS.length).setValues(filas);
      cacheGeoBorrar_('dist');
    }
    return { ok: true, guardadas: filas.length };
  } finally {
    lock.releaseLock();
  }
}

// Direcciones exactas buscadas en el Radar ("Distancia exacta"): lo que se escribió, la dirección
// que encontró OpenStreetMap y sus coordenadas. Llave = 'dir:' + texto normalizado. La distancia
// entre dos direcciones se guarda en "Distancias" con esas llaves.
var DIRECCIONES_COLUMNS = ['key', 'texto_buscado', 'direccion_encontrada', 'lat', 'lon', 'guardado_por', 'guardado_en'];

function getDireccionesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Direcciones');
  if (!sheet) {
    sheet = ss.insertSheet('Direcciones');
    sheet.appendRow(DIRECCIONES_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function leerDirecciones_() {
  var sheet = getDireccionesSheet_(), out = {};
  if (sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().forEach(function (r) {
    var lat = Number(r[3]), lon = Number(r[4]);
    if (r[0] && !isNaN(lat) && !isNaN(lon)) out[String(r[0])] = { texto: String(r[1] || ''), direccion: String(r[2] || ''), lat: lat, lon: lon };
  });
  return out;
}

/** Las direcciones (de esas llaves) que ya están en la base. */
function getDirecciones(keys, usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para continuar', items: {} };
  var todas = cacheGeoLeer_('dirs', leerDirecciones_), items = {};
  (Array.isArray(keys) ? keys : []).forEach(function (k) { if (todas[k]) items[k] = todas[k]; });
  return { ok: true, items: items };
}

function guardarDireccion(d, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  var key = String(d && d.key || '').trim().slice(0, 250), lat = Number(d && d.lat), lon = Number(d && d.lon);
  if (key.indexOf('dir:') !== 0 || isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, error: 'Datos de dirección no válidos' };
  var lock = acquireLock_(10000, 3);
  try {
    if (leerDirecciones_()[key]) return { ok: true, guardada: false };
    getDireccionesSheet_().appendRow([key, String(d.texto || '').slice(0, 250), String(d.direccion || '').slice(0, 400), lat, lon, check.nombre, new Date()]);
    cacheGeoBorrar_('dirs');
    return { ok: true, guardada: true };
  } finally {
    lock.releaseLock();
  }
}

/** Últimas búsquedas de dirección exacta guardadas (más recientes primero), con sus nombres legibles. */
function getBusquedasDirecciones(usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para continuar', items: [] };
  var dirs = cacheGeoLeer_('dirs', leerDirecciones_);
  var nombre = function (k) { return dirs[k] ? (dirs[k].texto || dirs[k].direccion) : k.replace(/^dir:/, ''); };
  var items = distanciasConCache_()
    .filter(function (r) { return (String(r[1]).indexOf('dir:') === 0 || String(r[2]).indexOf('dir:') === 0) && datoDistancia_(r); })
    .map(function (r) {
      var dato = datoDistancia_(r);
      return { key: String(r[0]), origen: String(r[1]), destino: String(r[2]), origenTxt: nombre(String(r[1])), destinoTxt: nombre(String(r[2])),
        millas: dato.millas, horas: dato.horas, fuente: dato.fuente, recta: Number(r[5]) || 0, por: String(r[7] || ''),
        en: String(r[8] || '') };
    });
  items.reverse();
  return { ok: true, items: items.slice(0, 50) };
}

// Excel de VanGuard del Radar (load, ciudad/estado destino, regresos, entrega), compartido con todo
// el equipo: el último que se sube reemplaza al anterior. Antes vivía solo en el navegador de quien
// lo subía. Los datos de quién y cuándo se guardan en la propiedad "radarExcelMeta".
var RADAR_EXCEL_COLUMNS = ['load', 'ciudad', 'estado', 'regresos', 'entrega'];
var RADAR_EXCEL_MAX_ = 5000;

function getRadarExcelSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('RadarExcel');
  if (!sheet) {
    sheet = ss.insertSheet('RadarExcel');
    sheet.appendRow(RADAR_EXCEL_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function leerRadarExcel_() {
  var sheet = getRadarExcelSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, RADAR_EXCEL_COLUMNS.length).getValues()
    .filter(function (r) { return r[1] !== '' && r[1] !== null; })
    .map(function (r) {
      return { load: String(r[0] || ''), ciudad: String(r[1] || ''), estado: String(r[2] || ''), regresos: String(r[3] || ''),
        entrega: r[4] instanceof Date ? r[4].toISOString() : String(r[4] || '') };
    });
}

/** { ok, excel: { nombre, cargado_en, por, filas, v } | null } */
function getRadarExcel(usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para continuar', excel: null };
  var meta = null;
  try { meta = JSON.parse(PropertiesService.getScriptProperties().getProperty('radarExcelMeta') || 'null'); } catch (e) {}
  if (!meta) return { ok: true, excel: null };
  return { ok: true, excel: { nombre: meta.nombre, cargado_en: meta.cargado_en, por: meta.por, v: 2, filas: cacheGeoLeer_('radarx', leerRadarExcel_) } };
}

function guardarRadarExcel(datos, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  var filas = (datos && Array.isArray(datos.filas)) ? datos.filas.slice(0, RADAR_EXCEL_MAX_) : [];
  if (!filas.length) return { ok: false, error: 'El Excel no trae cargas con destino' };
  var valores = filas.map(function (f) {
    return [String(f.load || '').slice(0, 40), String(f.ciudad || '').slice(0, 80), String(f.estado || '').slice(0, 40),
      String(f.regresos || '').slice(0, 80), String(f.entrega || '').slice(0, 40)];
  }).filter(function (v) { return v[1]; });
  var lock = acquireLock_(15000, 3);
  try {
    var sheet = getRadarExcelSheet_();
    var last = sheet.getLastRow();
    if (last >= 2) sheet.getRange(2, 1, last - 1, RADAR_EXCEL_COLUMNS.length).clearContent();
    if (valores.length) sheet.getRange(2, 1, valores.length, RADAR_EXCEL_COLUMNS.length).setValues(valores);
    var meta = { nombre: String(datos.nombre || 'Excel VanGuard').slice(0, 120), cargado_en: new Date().toISOString(), por: check.nombre };
    PropertiesService.getScriptProperties().setProperty('radarExcelMeta', JSON.stringify(meta));
    cacheGeoBorrar_('radarx');
    return { ok: true, total: valores.length, nombre: meta.nombre, cargado_en: meta.cargado_en, por: meta.por };
  } finally {
    lock.releaseLock();
  }
}

/** Quita el Excel del Radar para todo el equipo. */
function quitarRadarExcel(usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'Inicia sesión para continuar' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getRadarExcelSheet_();
    var last = sheet.getLastRow();
    if (last >= 2) sheet.getRange(2, 1, last - 1, RADAR_EXCEL_COLUMNS.length).clearContent();
    PropertiesService.getScriptProperties().deleteProperty('radarExcelMeta');
    cacheGeoBorrar_('radarx');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// Turnos del equipo (24h entre los 3, se calcula solo según la hora del servidor — no hace
// falta que nadie lo elija a mano). Aplica igual entre semana y fin de semana; el fin de semana,
// cuando un CSR cubre a otro, simplemente se le asigna el pendiente a esa persona (campo
// "asignado_a" de la bitácora, ver addBitacoraTurno) — no cambia el turno en sí.
var TURNOS_GS = [
  { desde: 7, hasta: 16, label: '07:00–16:00' },
  { desde: 16, hasta: 24, label: '16:00–00:00' },
  { desde: 0, hasta: 7, label: '00:00–07:00' }
];

function turnoActual_(fecha) {
  var h = fecha.getHours();
  for (var i = 0; i < TURNOS_GS.length; i++) {
    if (h >= TURNOS_GS[i].desde && h < TURNOS_GS[i].hasta) return TURNOS_GS[i].label;
  }
  return TURNOS_GS[0].label;
}

/** Devuelve (y crea si hace falta) la hoja "BitacoraTurno" — pendientes que alguien le asigna a
 * una persona específica: para el siguiente turno, para quien vaya a cubrir el fin de semana, o
 * a uno mismo (algo urgente que sí o sí hay que hacer ese día). Independiente de "Pendientes de
 * load" (que es solo para cargas que el cliente todavía no confirma). El turno se calcula solo
 * según la hora en que se registra (ver turnoActual_). */
var BITACORA_COLUMNS = ['id', 'turno', 'nota', 'load', 'asignado_a', 'creado_por', 'creado_en', 'resuelto', 'resuelto_en', 'color', 'fecha_seguimiento', 'asignado_csr'];

// Colores disponibles para marcar una tarjeta de bitácora (mismo significado que ya usan las
// tarjetas de Loads: crítico/atención/ok/informativo). '' = sin color (gris neutro).
// Colores disponibles para etiquetar tarjetas manualmente (bitácora de turno y loads activos).
var CARD_COLORES_GS = ['critical', 'warn', 'good', 'info', 'purple', 'teal', 'pink', 'brown', 'slate'];

function getBitacoraSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('BitacoraTurno');
  if (!sheet) {
    sheet = ss.insertSheet('BitacoraTurno');
    sheet.appendRow(BITACORA_COLUMNS);
    sheet.setFrozenRows(1);
  } else {
    if (String(sheet.getRange(1, 5).getValue()) === 'cubriendo_a') {
      // Migración: la columna se llamaba "cubriendo_a" (solo pensada para fin de semana) y ahora
      // es "asignado_a" (a quién le toca el pendiente, siempre). Mismos datos, solo cambia el
      // encabezado.
      sheet.getRange(1, 5).setValue('asignado_a');
    }
    // Migración: agrega la columna "color" al final si la hoja es de antes de que existiera.
    var lastCol = sheet.getLastColumn();
    if (lastCol < BITACORA_COLUMNS.length) {
      sheet.getRange(1, lastCol + 1, 1, BITACORA_COLUMNS.length - lastCol).setValues([BITACORA_COLUMNS.slice(lastCol)]);
    }
  }
  return sheet;
}

/** Devuelve los registros de la bitácora de turno asignados a "asignadoA", más reciente
 * primero — nunca los de nadie más, para que a cada quien solo le aparezcan los suyos y no se
 * sature de información que no le toca. Si no se manda asignadoA (nadie ha verificado su
 * identidad todavía en ese navegador), regresa vacío en vez de todo. El panel decide en el
 * navegador cuáles de los suyos ya no mostrar (los resueltos hace más de cierto tiempo) — aquí
 * se regresan todos los suyos, para no perder su historial completo. */
function namesMatch_(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/** Convierte una fila cruda de la hoja BitacoraTurno al objeto que usa el panel — mismo shape que
 * usan tanto getBitacoraTurno (lo tuyo) como getBitacoraHistorico (todo). Factorizado aquí para no
 * repetir el mapeo dos veces y que ambas funciones siempre regresen exactamente lo mismo por
 * registro. */
function mapBitacoraRow_(row) {
  var creadoEn = row[6];
  var resueltoEn = row[8];
  return {
    id: String(row[0]),
    turno: String(row[1] || ''),
    nota: String(row[2] || ''),
    load: row[3] ? String(row[3]) : '',
    asignado_a: String(row[4] || ''),
    creado_por: String(row[5] || ''),
    creado_en: (creadoEn instanceof Date) ? creadoEn.toISOString() : String(creadoEn || ''),
    resuelto: !!row[7],
    resuelto_en: (resueltoEn instanceof Date) ? resueltoEn.toISOString() : String(resueltoEn || ''),
    color: String(row[9] || ''),
    fecha_seguimiento: row[10] ? ((row[10] instanceof Date) ? row[10].toISOString() : String(row[10])) : '',
    asignado_csr: String(row[11] || '')
  };
}

function getBitacoraTurno(asignadoA, password) {
  asignadoA = String(asignadoA || '').trim();
  if (!asignadoA) return JSON.stringify([]);
  // Antes bastaba con mandar cualquier nombre para ver la bitácora de esa persona.
  if (!sesionOk_(asignadoA, password)) return JSON.stringify([]);
  var miInfo = getPersonaInfo_(asignadoA);
  var esSupervisor = !!(miInfo && miInfo.rol === 'Supervisor');
  var sigueCsrs = (miInfo && miInfo.rol === 'Seguimiento') ? miInfo.sigueA : null; // null = no aplica (no es Seguimiento)
  var sheet = getBitacoraSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify([]);
  var values = sheet.getRange(2, 1, lastRow - 1, BITACORA_COLUMNS.length).getValues();
  var out = values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    // Lo ve quien lo creó (para dar seguimiento a lo que dejó), la persona a quien se le asignó
    // directo, y — si es de Seguimiento — lo que le dejaron "para quien siga" a un CSR que
    // ahorita mismo sigue. Un Supervisor lo ve todo, sin excepción. A nadie más, para no saturar
    // de información a otras personas.
    .filter(function (row) {
      if (esSupervisor) return true;
      if (namesMatch_(row[4], asignadoA) || namesMatch_(row[5], asignadoA)) return true;
      var csr = String(row[11] || '').trim();
      if (!csr || !sigueCsrs) return false;
      return sigueCsrs.length === 0 || sigueCsrs.some(function (s) { return namesMatch_(s, csr); });
    })
    .map(mapBitacoraRow_);
  out.sort(function (a, b) { return new Date(b.creado_en) - new Date(a.creado_en); });
  return JSON.stringify(out);
}

function getBitacoraHistorico(usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para ver el histórico', items: [] };
  var sheet = getBitacoraSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, items: [] };
  var values = sheet.getRange(2, 1, lastRow - 1, BITACORA_COLUMNS.length).getValues();
  var out = values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(mapBitacoraRow_);
  out.sort(function (a, b) { return new Date(b.creado_en) - new Date(a.creado_en); });
  return { ok: true, items: out };
}

/** Agrega uno o varios pendientes de turno, asignados a una persona específica (puede ser uno
 * mismo, para algo urgente que sí o sí hay que hacer ese día). "loads" acepta un solo load (string)
 * o una lista de loads — pensado para el cierre de turno, cuando se seleccionan varios loads
 * pendientes de un jalón y se le dejan al mismo compañero con la misma nota, fecha de seguimiento
 * y color: se crea un registro independiente por cada load (mismo turno/asignado/nota/fecha), para
 * que cada uno se pueda marcar como atendido por separado según se vaya resolviendo. Cada load
 * también queda ligado en el historial de comentarios de esa carga. Verifica la contraseña de
 * quien lo deja, igual que un comentario o un "Pendiente de load". */
function addBitacoraTurno(nota, loads, asignadoA, color, fechaSeguimiento, creadoPor, password, asignadoCsr) {
  nota = String(nota || '').trim();
  if (!nota) return { ok: false, error: 'Falta la nota' };
  asignadoA = String(asignadoA || '').trim();
  asignadoCsr = String(asignadoCsr || '').trim();
  if (!asignadoA && !asignadoCsr) return { ok: false, error: 'Falta elegir a quién se le asigna' };
  var loadList = (Array.isArray(loads) ? loads : [loads])
    .map(function (l) { return String(l || '').trim(); })
    .filter(function (l) { return !!l; });
  loadList = loadList.filter(function (l, idx) { return loadList.indexOf(l) === idx; }); // sin duplicados
  // Un pendiente de turno puede ser una nota general sin carga ("llamar a Mabe por la tarifa"):
  // se guarda una sola fila con el load vacío y no deja comentario en ninguna carga.
  var sinLoad = !loadList.length;
  if (sinLoad) loadList = [''];
  color = String(color || '').trim();
  if (color && CARD_COLORES_GS.indexOf(color) === -1) color = '';
  fechaSeguimiento = String(fechaSeguimiento || '').trim();
  var fechaSeguimientoDate = fechaSeguimiento ? new Date(fechaSeguimiento) : '';
  if (fechaSeguimiento && isNaN(fechaSeguimientoDate.getTime())) return { ok: false, error: 'Fecha de seguimiento inválida' };
  var check = requireLogin_(creadoPor, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };

  var loadSheet = getSheet_();
  var loadKeysExistentes = loadRowIndexNormalizedMap_(loadSheet);
  var faltantes = sinLoad ? [] : loadList.filter(function (l) { return !loadKeysExistentes.hasOwnProperty(normalizeLoadKey_(l)); });
  if (faltantes.length) return { ok: false, error: 'Load(s) que no existen en "Loads": ' + faltantes.join(', ') };

  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getBitacoraSheet_();
    var now = new Date();
    var turno = turnoActual_(now);
    var cSheet = getCommentsSheet_();
    var etiqueta = 'Bitácora de turno (' + turno + ', asignado a ' + (asignadoA || ('quien siga a ' + asignadoCsr)) + '): ';
    var ids = [];
    loadList.forEach(function (load) {
      var id = Utilities.getUuid();
      ids.push(id);
      sheet.appendRow([id, turno, nota, load, asignadoA, creadoPor, now, false, '', color, fechaSeguimientoDate, asignadoCsr]);
      if (load) cSheet.appendRow([load, now, etiqueta + nota, creadoPor]);
    });
    SpreadsheetApp.flush();

    touchLastModified_('bitacora');
    return { ok: true, id: ids[0], ids: ids, turno: turno, creado_en: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}


var CIERRES_TURNO_COLUMNS = ['id', 'csr', 'creado_en', 'texto'];

function getCierresTurnoSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CierresTurno');
  if (!sheet) {
    sheet = ss.insertSheet('CierresTurno');
    sheet.appendRow(CIERRES_TURNO_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Guarda el cierre de turno que acaba de armar "usuario" (texto completo, tal como quedó en el
 * textarea del panel — incluye cualquier ajuste a mano que haya hecho antes de enviarlo). */
function enviarCierreTurno(texto, usuario, password) {
  texto = String(texto || '').trim();
  if (!texto) return { ok: false, error: 'No hay nada que enviar' };
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getCierresTurnoSheet_();
    var now = new Date();
    var id = Utilities.getUuid();
    sheet.appendRow([id, usuario, now, texto]);
    touchLastModified_('cierres');
    return { ok: true, id: id, creado_en: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve los cierres de turno que le tocan ver a "usuario": todos si es Supervisor, o los de
 * los CSR que sigue ahorita mismo si es de Seguimiento (sigueA vacío = sigue a "Todos", igual que
 * en getBitacoraTurno). A un CSR normal no le regresa nada — esto es para dar seguimiento al
 * equipo, no para ver los propios (esos ya los tiene en su panel, recién armados). Limita a los
 * últimos 30 para no mandar un historial completo cada vez que se abre el panel. */
function getCierresTurnoRecibidos(usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad', items: [] };
  var miInfo = getPersonaInfo_(usuario);
  var esSupervisor = !!(miInfo && miInfo.rol === 'Supervisor');
  var esSeguimiento = !!(miInfo && miInfo.rol === 'Seguimiento');
  if (!esSupervisor && !esSeguimiento) return { ok: true, items: [] };
  var sigueCsrs = esSeguimiento ? (miInfo.sigueA || []) : [];
  var sheet = getCierresTurnoSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, items: [] };
  var values = sheet.getRange(2, 1, lastRow - 1, CIERRES_TURNO_COLUMNS.length).getValues();
  var out = values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .filter(function (row) {
      if (esSupervisor) return true;
      return sigueCsrs.length === 0 || sigueCsrs.some(function (s) { return namesMatch_(s, row[1]); });
    })
    .map(function (row) {
      var creadoEn = row[2];
      return {
        id: String(row[0]),
        csr: String(row[1] || ''),
        creado_en: (creadoEn instanceof Date) ? creadoEn.toISOString() : String(creadoEn || ''),
        texto: String(row[3] || '')
      };
    });
  out.sort(function (a, b) { return new Date(b.creado_en) - new Date(a.creado_en); });
  return { ok: true, items: out.slice(0, 30) };
}

/** Edita la nota, el load ligado, la fecha de seguimiento y/o el color de un pendiente de turno
 * ya existente. A quién está asignado NO se puede cambiar aquí (eso se deja igual que como se
 * creó) — pero cualquier persona logueada que ya lo pueda ver (el que se lo asignaron, o quien lo
 * creó — ver getBitacoraTurno) lo puede editar, igual que cualquier otro dato del panel entre
 * compañeros de equipo. Exige sesión iniciada, igual que addBitacoraTurno. */
function editarBitacoraTurno(id, nota, load, color, fechaSeguimiento, usuario, password) {
  id = String(id || '').trim();
  if (!id) return { ok: false, error: 'Falta el id del pendiente' };
  nota = String(nota || '').trim();
  if (!nota) return { ok: false, error: 'Falta la nota' };
  load = String(load || '').trim(); // vacío = pendiente general, sin carga
  color = String(color || '').trim();
  if (color && CARD_COLORES_GS.indexOf(color) === -1) color = '';
  fechaSeguimiento = String(fechaSeguimiento || '').trim();
  var fechaSeguimientoDate = fechaSeguimiento ? new Date(fechaSeguimiento) : '';
  if (fechaSeguimiento && isNaN(fechaSeguimientoDate.getTime())) return { ok: false, error: 'Fecha de seguimiento inválida' };
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };

  if (load) {
    var loadSheet = getSheet_();
    if (findLoadRowNormalized_(loadSheet, load) === -1) return { ok: false, error: 'Ese load no existe en "Loads"' };
  }

  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getBitacoraSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === id) {
        var rowIndex = i + 2;
        sheet.getRange(rowIndex, 3).setValue(nota);
        sheet.getRange(rowIndex, 4).setValue(load);
        sheet.getRange(rowIndex, 10).setValue(color);
        sheet.getRange(rowIndex, 11).setValue(fechaSeguimientoDate);
        touchLastModified_('bitacora');
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrado' };
  } finally {
    lock.releaseLock();
  }
}

/** Marca (o desmarca) una nota de bitácora como ya atendida por el siguiente turno. Exige sesión
 * iniciada, igual que cualquier otro cambio en el panel (ver requireLogin_) — no queda firmada
 * con nombre y apellido como un comentario, solo se verifica que sí haya alguien logueado. */
function resolverBitacoraTurno(id, resuelto, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getBitacoraSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(id)) {
        var rowIndex = i + 2;
        sheet.getRange(rowIndex, 8).setValue(!!resuelto);
        sheet.getRange(rowIndex, 9).setValue(resuelto ? new Date() : '');
        touchLastModified_('bitacora');
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrado' };
  } finally {
    lock.releaseLock();
  }
}

/** Elimina una nota de bitácora (por ejemplo, si se registró por error). */
function removeBitacoraTurno(id, usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para continuar' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getBitacoraSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(id)) {
        sheet.deleteRow(i + 2);
        touchLastModified_('bitacora');
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrado' };
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve (y crea si hace falta) la hoja "Personas" (CSR y Seguimiento). Columna "password" =
 * contraseña personal (mínimo 8 caracteres) que cada quien usa para iniciar sesión en el panel,
 * en vez de depender de la cuenta de Google (eso requería compartir el Sheet directo con cada
 * persona, lo cual expondría todas las cargas de todos los CSR sin el filtrado del panel). El
 * administrador asigna la contraseña inicial desde "Gestionar CSR" (ver setPersonaPassword);
 * cada quien la puede cambiar después desde el panel (ver changeMyPassword). */
function getPersonasSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Personas');
  if (!sheet) {
    sheet = ss.insertSheet('Personas');
    sheet.appendRow(['nombre', 'rol', 'correo', 'password', 'sigue_a']);
    sheet.setFrozenRows(1);
    var seed = [
      ['ESTEBAN', 'CSR', 'esteban.reyes@selectds.net', ''],
      ['RHAMSES', 'CSR', 'rhamses.munoz@selectds.net', ''],
      ['MELISA', 'CSR', 'melisa.arroyo@selectds.net', ''],
      ['LUPITA', 'CSR', 'guadalupe.lopez@selectds.net', '']
    ];
    seed.forEach(function (row) { sheet.appendRow(row); });
  } else {
    if (String(sheet.getRange(1, 3).getValue()) !== 'correo') {
      sheet.getRange(1, 3).setValue('correo');
    }
    if (String(sheet.getRange(1, 4).getValue()) !== 'password') {
      sheet.getRange(1, 4).setValue('password');
    }
    if (String(sheet.getRange(1, 5).getValue()) !== 'sigue_a') {
      sheet.getRange(1, 5).setValue('sigue_a');
    }
  }
  return sheet;
}

/** Devuelve (y crea si hace falta) la hoja "CSR_Clientes" (asignación cliente -> CSR). */
function getCsrClientesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CSR_Clientes');
  if (!sheet) {
    sheet = ss.insertSheet('CSR_Clientes');
    sheet.appendRow(['cliente', 'csr']);
    sheet.setFrozenRows(1);
    var seed = [
      ['A1A LOGISTICS S DE RL DE CV', 'RHAMSES'],
      ['ARRIVE LOGISTICS LLC', 'MELISA'],
      ['CONTINENTAL TIRE DE MEXICO', 'LUPITA'],
      ['CONTINENTAL TIRE THE AMERICAS, LLC', 'LUPITA'],
      ['CROSSMOTION LOGISTICS SA DE CV', 'ESTEBAN'],
      ['DACHSER DE MEXICO S.A. DE C.V.', 'ESTEBAN'],
      ['DHL GLOBAL FORWARDING (MEXICO) SA DE CV', 'ESTEBAN'],
      ['DIESEL GLOBAL LOGISTICS', 'ESTEBAN'],
      ['EMPIRE NATIONAL FREIGHT LLC', 'ESTEBAN'],
      ['FIRST FRONTIER LOGISTICS INC.', 'ESTEBAN'],
      ['FOAMOTIVE MEX S.A DE C.V.', 'ESTEBAN'],
      ['FOUNTAIN CITY LOGISTICS INC', 'ESTEBAN'],
      ['GH ISTMO S.A. DE C.V.', 'RHAMSES'],
      ['GNS AUTOMOTIVE MEXICO SA DE CV', 'ESTEBAN'],
      ['HELLMANN WORLDWIDE LOGISTICS SA DE CV', 'ESTEBAN'],
      ['JUSDA SUPPLY CHAIN MANAGEMENT CORP', 'MELISA'],
      ['M&G TRUCKING COMPANY SA DE CV', 'MELISA'],
      ['MAYCO AUTOMOTIVE INTERNATIONAL S DE RL DE CV', 'RHAMSES'],
      ['MEXICOM LOGISTICS', 'ESTEBAN'],
      ['MIDWEST ACOUST-A-FIBER INC', 'ESTEBAN'],
      ['MITSUBISHI LOGISTICS AMERICA CORPORATION', 'LUPITA'],
      ['MTI FORWARDING INC', 'ESTEBAN'],
      ['NKP MEXICO S.A. DE C.V.', 'ESTEBAN'],
      ['NORTH AMERICAN SPECIALIZED LOGISTICS LLC', 'RHAMSES'],
      ['NX TRANSPORT DE MEXICO SA DE CV', 'ESTEBAN'],
      ['PALZIV MEX', 'ESTEBAN'],
      ['PERA LOGISTICS LLC', 'ESTEBAN'],
      ['REDWOOD MULTIMODAL', 'MELISA'],
      ['RML LOGISTICA INTEGRAL S.A. DE C.V', 'RHAMSES'],
      ['RXO INC', 'MELISA'],
      ['SAK LOGISTIKS S. DE R.L. DE C.V.', 'RHAMSES'],
      ['SERVICIOS INTEGRALES BERPAR SA DE CV', 'RHAMSES'],
      ['SUNSET TRANSPORTATION', 'ESTEBAN'],
      ['SUPPLY CHAIN SOLUTIONS, LLC', 'MELISA'],
      ['TIBA MEXICO SA DE CV', 'RHAMSES'],
      ['TM LOGISTICS DE MEXICO S. DE R.L. DE C.V.', 'RHAMSES'],
      ['TM LOGISTICS LLC', 'RHAMSES'],
      ['TRAFFIX', 'RHAMSES'],
      ['TRANSPORTES INNOVATIVOS SA DE CV', 'MELISA'],
      ['UNIVERSAL CARGO M S.A. DE C.V.', 'ESTEBAN'],
      ['VINTAGE LOGISTICS INC', 'ESTEBAN'],
      ['YAMATO TRANSPORT MEXICO', 'LUPITA']
    ];
    seed.forEach(function (row) { sheet.appendRow(row); });
  }
  return sheet;
}

/** Devuelve la lista de personas (CSR y Seguimiento). No manda la contraseña en sí (nunca sale
 * del servidor), solo si ya tiene una asignada (passwordSet), para que "Gestionar CSR" pueda
 * mostrar el estatus sin exponer el valor. */
function getPersonas(usuario, password) {
  // La pantalla de login necesita los nombres ANTES de que haya sesión (selector "Elige tu
  // nombre"), así que esta sigue respondiendo sin sesión — pero sin los correos, que solo se
  // entregan a alguien ya identificado.
  var conSesion = sesionOk_(usuario, password);
  var sheet = getPersonasSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify([]);
  var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var out = values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(function (row) {
      var sigueRaw = String(row[4] || '').trim();
      return {
        nombre: String(row[0]),
        rol: String(row[1]),
        correo: conSesion ? String(row[2] || '') : '',
        passwordSet: !!String(row[3] || '').trim(),
        sigueA: sigueRaw ? sigueRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : []
      };
    });
  return JSON.stringify(out);
}

/** Info básica de una persona por nombre (rol y, si es Seguimiento, a qué CSR(s) sigue ahorita) —
 * usado por getBitacoraTurno() para decidir qué pendientes "para quien lo siga" le tocan a quien
 * los está pidiendo. Regresa null si no existe. */
function getPersonaInfo_(nombre) {
  nombre = String(nombre || '').trim();
  if (!nombre) return null;
  var sheet = getPersonasSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < values.length; i++) {
    if (namesMatch_(values[i][0], nombre)) {
      var sigueRaw = String(values[i][4] || '').trim();
      return {
        rol: String(values[i][1] || ''),
        sigueA: sigueRaw ? sigueRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : []
      };
    }
  }
  return null;
}

/** Guarda, del lado del servidor, a qué CSR(s) sigue ahorita esta persona de Seguimiento (ver
 * comentario en getPersonasSheet_). csrs vacío = "Todos" (sin filtro). Se llama cada vez que
 * cambia la selección de "A quién sigues" en el panel (ver saveMiSeguimiento() en PanelScript.html). */
function setMiSeguimiento(nombre, password, csrs) {
  var check = requireLogin_(nombre, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lista = (Array.isArray(csrs) ? csrs : String(csrs || '').split(','))
    .map(function (s) { return String(s || '').trim(); })
    .filter(Boolean);
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPersonasSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin personas' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(nombre)) {
        sheet.getRange(i + 2, 5).setValue(lista.join(','));
        return { ok: true };
      }
    }
    return { ok: false, error: 'Persona no encontrada' };
  } finally {
    lock.releaseLock();
  }
}

/** Compara nombre+contraseña contra lo guardado en "Personas". Función interna compartida por
 * verifyIdentityLogin() (verificación explícita en el navegador) y addComment() (verificación
 * server-side en cada comentario, para que nadie pueda guardar uno a nombre de alguien más
 * aunque manipule el navegador a mano). */
function requireLogin_(nombre, password) {
  nombre = String(nombre || '').trim();
  password = String(password || '').trim();
  if (!nombre || !password) return { ok: false, error: 'Falta nombre o contraseña' };
  // Dentro de getPanelCambios la sesión ya se revisó una vez: no se vuelve a leer la hoja Personas
  // por cada área que se pide.
  if (memoLogin_ && memoLogin_[nombre + '|' + password]) return memoLogin_[nombre + '|' + password];
  var esToken = password.indexOf(SESSION_TOKEN_PREFIX_) === 0;
  var sheet = getPersonasSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Persona no encontrada' };
  var values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === nombre) {
      if (esToken) {
        if (sessionTokenValido_(password, nombre)) return { ok: true, nombre: nombre, rol: String(values[i][1]) };
        return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
      }
      var storedPassword = String(values[i][3] || '').trim();
      if (!storedPassword) return { ok: false, error: 'Tu contraseña todavía no está configurada. Pide que te la asignen en "Gestionar CSR".' };
      var clave = 'p:' + nombre.toLowerCase();
      if (bloqueado_(clave)) return { ok: false, error: BLOQUEO_ERROR_ };
      if (!passwordCoincide_(password, storedPassword)) {
        registrarFallo_(clave);
        return { ok: false, error: 'Contraseña incorrecta' };
      }
      limpiarFallos_(clave);
      // Contraseña vieja en texto plano: se cifra en la hoja ahora que sabemos que es la correcta.
      if (!esHashPassword_(storedPassword)) {
        try { sheet.getRange(i + 2, 4).setValue(hashPassword_(password)); } catch (e) {}
      }
      return { ok: true, nombre: nombre, rol: String(values[i][1]) };
    }
  }
  return { ok: false, error: 'Persona no encontrada' };
}

var SESSION_TOKEN_PREFIX_ = 'tok_';
var SESSION_TOKEN_DAYS_ = 30;

function sessionTokenValido_(token, nombre) {
  var raw = PropertiesService.getScriptProperties().getProperty('sess_' + token);
  if (!raw) return false;
  try {
    var s = JSON.parse(raw);
    return s && String(s.n) === String(nombre) && Number(s.exp) > Date.now();
  } catch (e) {
    return false;
  }
}

function crearSesion_(nombre) {
  var props = PropertiesService.getScriptProperties();
  limpiarSesionesVencidas_(props);
  var token = SESSION_TOKEN_PREFIX_ + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperty('sess_' + token, JSON.stringify({ n: String(nombre), exp: Date.now() + SESSION_TOKEN_DAYS_ * 24 * 60 * 60 * 1000 }));
  return token;
}

function limpiarSesionesVencidas_(props) {
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sess_') !== 0 && k.indexOf('acc_') !== 0) return; // acc_ = tokens de Portal/Vista
    try {
      if (Number(JSON.parse(all[k]).exp) <= now) props.deleteProperty(k);
    } catch (e) {
      props.deleteProperty(k);
    }
  });
}

/** Invalida todas las sesiones abiertas de una persona (al cambiar su contraseña). */
function revocarSesiones_(nombre) {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sess_') !== 0) return;
    try {
      if (String(JSON.parse(all[k]).n) === String(nombre)) props.deleteProperty(k);
    } catch (e) {}
  });
}

/* FIX: seguridad del Portal Cliente y la Vista Gerencia — mismo problema que tenía el panel:
 * getLoadsForCliente("Bosch Celaya") entregaba las cargas de ese cliente a quien supiera su
 * nombre (sin usuario ni contraseña), y getLoadsParaVista() entregaba TODAS las cargas sin pedir
 * nada; el login de esas páginas solo decidía qué pantalla mostrar. Ahora el login entrega un
 * token y las funciones de datos solo responden con un token válido. Cada token guarda una
 * "huella" (SHA-256) de la contraseña con la que se creó: si la contraseña cambia en la hoja
 * PortalClientes (o la de la Vista Gerencia), todos los tokens anteriores dejan de servir solos,
 * sin tener que revocarlos a mano. Se guardan en Script Properties como "acc_<token>". */
var ACCESO_TOKEN_DAYS_ = 30;

function huellaPassword_(pw) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pw)));
}

function crearTokenAcceso_(tipo, datos) {
  var props = PropertiesService.getScriptProperties();
  limpiarSesionesVencidas_(props);
  var token = tipo + '_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  datos.exp = Date.now() + ACCESO_TOKEN_DAYS_ * 24 * 60 * 60 * 1000;
  props.setProperty('acc_' + token, JSON.stringify(datos));
  return token;
}

/** Datos guardados con el token si es de ese tipo y no ha vencido; null si no. */
function leerTokenAcceso_(tipo, token) {
  token = String(token || '');
  if (token.indexOf(tipo + '_') !== 0) return null;
  var raw = PropertiesService.getScriptProperties().getProperty('acc_' + token);
  if (!raw) return null;
  try {
    var d = JSON.parse(raw);
    return (d && Number(d.exp) > Date.now()) ? d : null;
  } catch (e) {
    return null;
  }
}

var SESION_PORTAL_VENCIDA_ = 'Tu sesión expiró. Vuelve a entrar.';

/** Verifica la identidad de alguien por nombre + contraseña personal (login individual).
 * Reemplaza la detección por cuenta de Google (Session.getActiveUser()), que dejó de funcionar
 * porque requería compartir el Sheet directo con cada persona (exponiendo todas las cargas de
 * todos los CSR sin el filtrado del panel) — con la contraseña no se necesita compartir nada.
 * Si se entra con la contraseña, regresa un token de sesión nuevo (ver crearSesion_); si se
 * entra con un token guardado, regresa ese mismo token. */
function verifyIdentityLogin(nombre, password) {
  var res = requireLogin_(nombre, password);
  if (!res.ok) return res;
  var pw = String(password || '').trim();
  res.token = pw.indexOf(SESSION_TOKEN_PREFIX_) === 0 ? pw : crearSesion_(res.nombre);
  return res;
}

/** Asigna o cambia la contraseña de alguien ya existente. Lo usa el administrador desde
 * "Gestionar CSR" (ya protegido por la contraseña de acceso a ese panel) para poner la
 * contraseña inicial de cada persona — después, cada quien la puede cambiar ella misma con
 * changeMyPassword(), sin pasar otra vez por el administrador. */
function setPersonaPassword(nombre, password, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  password = String(password || '').trim();
  var problema = validarPasswordNueva_(password);
  if (problema) return { ok: false, error: problema };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPersonasSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(nombre)) {
        sheet.getRange(i + 2, 4).setValue(hashPassword_(password));
        touchLastModified_('personas');
        limpiarFallos_('p:' + String(nombre).toLowerCase()); // si estaba bloqueada, el admin la libera
        revocarSesiones_(nombre); // el admin la restableció: cierra las sesiones abiertas con la anterior
        logAdmin_(adminPw, 'Contraseña restablecida', nombre);
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}

/** Cambio de contraseña que hace uno mismo desde el panel (no el administrador) — pide la
 * contraseña actual para poder cambiarla, igual que cualquier cambio de contraseña normal. */
function changeMyPassword(nombre, currentPassword, newPassword) {
  // Para cambiarla hay que escribir la contraseña actual de verdad — un token de sesión (que
  // podría venir de una computadora ajena con la sesión abierta) no basta.
  if (String(currentPassword || '').trim().indexOf(SESSION_TOKEN_PREFIX_) === 0) return { ok: false, error: 'Escribe tu contraseña actual' };
  var check = requireLogin_(nombre, currentPassword);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu contraseña actual' };
  newPassword = String(newPassword || '').trim();
  var problema = validarPasswordNueva_(newPassword);
  if (problema) return { ok: false, error: problema };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPersonasSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(nombre)) {
        sheet.getRange(i + 2, 4).setValue(hashPassword_(newPassword));
        touchLastModified_('personas');
        // Cierra las sesiones abiertas con la contraseña anterior (otras computadoras) y le da
        // a quien la cambió un token nuevo para que siga trabajando sin volver a entrar.
        revocarSesiones_(nombre);
        return { ok: true, token: crearSesion_(nombre) };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}

/** Agrega una persona nueva (CSR o Seguimiento). No permite nombres duplicados. */
function addPersona(nombre, rol, correo, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  nombre = String(nombre || '').trim();
  rol = String(rol || '').trim();
  correo = String(correo || '').trim().toLowerCase();
  if (!nombre) return { ok: false, error: 'Falta el nombre' };
  if (rol !== 'CSR' && rol !== 'Seguimiento' && rol !== 'Supervisor') return { ok: false, error: 'Rol inválido' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPersonasSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][0]).toLowerCase() === nombre.toLowerCase()) {
          return { ok: false, error: 'Esa persona ya existe' };
        }
      }
    }
    sheet.appendRow([nombre, rol, correo]);
    touchLastModified_('personas');
    logAdmin_(adminPw, 'Alta de persona', nombre + ' (' + rol + ')');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Elimina una persona por nombre. */
function removePersona(nombre, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPersonasSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(nombre)) {
        sheet.deleteRow(i + 2);
        touchLastModified_('personas');
        logAdmin_(adminPw, 'Baja de persona', nombre);
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}

/** Actualiza el correo de Google de una persona ya existente. */
function setPersonaCorreo(nombre, correo, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  correo = String(correo || '').trim().toLowerCase();
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPersonasSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(nombre)) {
        sheet.getRange(i + 2, 3).setValue(correo);
        touchLastModified_('personas');
        logAdmin_(adminPw, 'Correo cambiado', nombre + ': ' + (correo || '(vacío)'));
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}

/** Cambia el rol de una persona ya existente (CSR / Seguimiento / Supervisor) — para, por
 * ejemplo, promover a alguien a Supervisor sin tener que borrarla y volver a crearla (lo que le
 * haría perder el correo y la contraseña que ya tenía asignados). Ver addPersona() para las
 * reglas de rol válidas. */
function setPersonaRol(nombre, rol, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  rol = String(rol || '').trim();
  if (rol !== 'CSR' && rol !== 'Seguimiento' && rol !== 'Supervisor') return { ok: false, error: 'Rol inválido' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPersonasSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(nombre)) {
        sheet.getRange(i + 2, 2).setValue(rol);
        touchLastModified_('personas');
        logAdmin_(adminPw, 'Rol cambiado', nombre + ' → ' + rol);
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}

function getLoadSeguimientosSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LoadSeguimientos');
  if (!sheet) {
    sheet = ss.insertSheet('LoadSeguimientos');
    sheet.appendRow(['load', 'csr', 'creado_en']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Devuelve todos los "load seguidos" (qué CSR sigue qué load, aparte de sus clientes propios). */
function getLoadSeguimientos(usuario, password) {
  if (!sesionOk_(usuario, password)) return JSON.stringify([]);
  var sheet = getLoadSeguimientosSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify([]);
  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var out = values
    .filter(function (row) { return row[0] !== '' && row[0] !== null && row[1] !== '' && row[1] !== null; })
    .map(function (row) {
      return {
        load: String(row[0]),
        csr: String(row[1]),
        creado_en: row[2] instanceof Date ? row[2].toISOString() : String(row[2] || '')
      };
    });
  return JSON.stringify(out);
}

/** El CSR que llama empieza a seguir este load (botón "Seguir este load" en el Workspace).
 * Idempotente: si ya lo seguía, no duplica la fila. */
function seguirLoad(load, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  load = String(load || '').trim();
  if (!load) return { ok: false, error: 'Load no válido' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getLoadSeguimientosSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (var i = 0; i < values.length; i++) {
        if (normalizeLoadKey_(values[i][0]) === normalizeLoadKey_(load) && namesMatch_(values[i][1], usuario)) {
          return { ok: true }; // ya lo seguía
        }
      }
    }
    sheet.appendRow([load, String(usuario || '').trim(), new Date()]);
    touchLastModified_('personas');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** El CSR que llama deja de seguir este load. */
function dejarSeguirLoad(load, usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  load = String(load || '').trim();
  if (!load) return { ok: false, error: 'Load no válido' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getLoadSeguimientosSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true };
    var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      if (normalizeLoadKey_(values[i][0]) === normalizeLoadKey_(load) && namesMatch_(values[i][1], usuario)) {
        sheet.deleteRow(i + 2);
      }
    }
    touchLastModified_('personas');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getPlantillasSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PlantillasMensajes');
  if (!sheet) {
    sheet = ss.insertSheet('PlantillasMensajes');
    sheet.appendRow(['usuario', 'templates_json', 'labels_json', 'actualizado_en']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Plantillas de mensajes guardadas por el usuario que inicia sesión (independientes de qué
 * perfil esté viendo con "¿Quién eres?"). Si nunca ha guardado nada, regresa objetos vacíos y
 * el cliente usa las 4 plantillas por default. */
function getMisPlantillas(usuario, password) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var sheet = getPlantillasSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    for (var i = 0; i < values.length; i++) {
      if (namesMatch_(values[i][0], usuario)) {
        var templates = {}, labels = {};
        try { templates = JSON.parse(values[i][1] || '{}'); } catch (e) {}
        try { labels = JSON.parse(values[i][2] || '{}'); } catch (e) {}
        return { ok: true, templates: templates, labels: labels };
      }
    }
  }
  return { ok: true, templates: {}, labels: {} };
}

/** Guarda (crea o reemplaza) las plantillas de mensajes del usuario que inicia sesión.
 * templatesJson/labelsJson ya vienen serializados (JSON.stringify) desde el cliente — se
 * guardan tal cual, como en LoadSeguimientos/Personas con otros blobs de configuración. */
function guardarMisPlantillas(usuario, password, templatesJson, labelsJson) {
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPlantillasSheet_();
    var lastRow = sheet.getLastRow();
    var rowIndex = 0;
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < values.length; i++) {
        if (namesMatch_(values[i][0], usuario)) { rowIndex = i + 2; break; }
      }
    }
    var row = [String(usuario || '').trim(), String(templatesJson || '{}'), String(labelsJson || '{}'), new Date()];
    if (rowIndex) {
      sheet.getRange(rowIndex, 1, 1, 4).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    touchLastModified_('plantillas');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve las asignaciones cliente -> CSR. */
function getAsignaciones(usuario, password) {
  if (!sesionOk_(usuario, password)) return JSON.stringify([]);
  var sheet = getCsrClientesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify([]);
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var out = values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(function (row) { return { cliente: String(row[0]), csr: String(row[1]) }; });
  return JSON.stringify(out);
}

/** Asigna (o reasigna) un cliente a un CSR. */
function asignarCliente(cliente, csr, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  cliente = String(cliente || '').trim();
  csr = String(csr || '').trim();
  if (!cliente || !csr) return { ok: false, error: 'Faltan datos' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getCsrClientesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][0]).toLowerCase() === cliente.toLowerCase()) {
          sheet.getRange(i + 2, 2).setValue(csr);
          touchLastModified_('personas');
          logAdmin_(adminPw, 'Cliente reasignado', cliente + ' → ' + csr);
          return { ok: true };
        }
      }
    }
    sheet.appendRow([cliente, csr]);
    touchLastModified_('personas');
    logAdmin_(adminPw, 'Cliente asignado', cliente + ' → ' + csr);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Elimina la asignación de un cliente. */
function removeAsignacion(cliente, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getCsrClientesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(cliente)) {
        sheet.deleteRow(i + 2);
        touchLastModified_('personas');
        logAdmin_(adminPw, 'Asignación eliminada', cliente);
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================================
 * PORTAL CLIENTE (Fase 1 — Seguimiento)
 * Portal de solo lectura para que cada cliente vea únicamente sus propias cargas, con login
 * individual (usuario + contraseña por persona) y el timeline de 10 etapas de cada embarque.
 * Se sirve desde la misma app vía doGet(?portal=cliente), con su propio HTML/CSS/JS separados
 * (PortalCliente.html / PortalClienteEstilos.html / PortalClienteScript.html).
 * ========================================================================================= */

/** Las 10 etapas del timeline que ve el cliente, en orden. "key" debe coincidir con lo que
 * regresa deriveTimelineStage_(). "label" es lo que se muestra en el portal. */
var TIMELINE_STAGES_GS = [
  { key: 'programado', label: 'Programado' },
  { key: 'cargado', label: 'Cargado' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'salida_mexico', label: 'Salida planta' },
  { key: 'frontera', label: 'Frontera' },
  { key: 'cruce_usa', label: 'Cruce aduana' },
  { key: 'en_transito', label: 'En tránsito' },
  { key: 'arribo_planta', label: 'Arribo planta' },
  { key: 'descarga', label: 'Descarga' },
  { key: 'pod', label: 'POD' }
];

/** Deriva en cuál de las 10 etapas del timeline va una carga, a partir de lo que ya se captura
 * en el panel interno (status, pickup_actual, delivery_actual, doda) más los 2 campos nuevos
 * (salida_mexico_fecha, cruce_usa_fecha). Es una inferencia de "combinación", no un campo
 * capturado directamente — se revisa de la etapa más avanzada hacia la más temprana y se
 * regresa la primera que aplica, asumiendo que el avance es siempre hacia adelante.
 * Regresa el índice (0-9) de TIMELINE_STAGES_GS. */
function deriveTimelineStage_(rec) {
  var status = String(rec.status || '').trim();
  var doneStatuses = DONE_STATUSES_GS.indexOf(status) !== -1;

  if (rec.pod_sent || doneStatuses) return 9; // POD
  if (status === 'Descargando') return 8; // Descarga
  if (status === 'EN PLANTA' || status === 'PATIO MTY' || String(rec.delivery_actual || '').trim()) return 7; // Arribo planta
  if (status === 'En transito' || status === 'En Yarda US' || status === 'Pte. Arrivo') return 6; // En tránsito
  if (String(rec.cruce_usa_fecha || '').trim()) return 5; // Cruce USA
  if (status === 'Cruzando') return 4; // Frontera
  if (String(rec.salida_mexico_fecha || '').trim()) return 3; // Salida México
  if (String(rec.doda || '').trim()) return 2; // Documentos
  if (String(rec.pickup_actual || '').trim()) return 1; // Cargado
  return 0; // Programado
}

/** Devuelve (y crea si hace falta) la hoja "PortalClientes" — credenciales individuales de
 * quienes tienen acceso al Portal Cliente. Columna "cliente" debe coincidir exactamente (sin
 * importar mayúsculas/minúsculas) con el texto que ya se usa en la columna "customer" de Loads
 * para poder filtrar. Por ahora las cuentas se dan de alta escribiendo directo en esta hoja
 * (nombre, cliente, usuario, password, activo) — si hace falta, después se agrega una pantalla
 * de administración dentro de "Gestionar CSR". */
function getPortalClientesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PortalClientes');
  if (!sheet) {
    sheet = ss.insertSheet('PortalClientes');
    sheet.appendRow(['nombre', 'cliente', 'usuario', 'password', 'activo']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Verifica usuario + contraseña contra "PortalClientes". No regresa la contraseña. */
function checkClientLogin(usuario, password) {
  usuario = String(usuario || '').trim().toLowerCase();
  password = String(password || '');
  if (!usuario || !password) return { ok: false, error: 'Falta usuario o contraseña' };
  var sheet = getPortalClientesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Usuario o contraseña incorrectos' };
  var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < values.length; i++) {
    var rowUsuario = String(values[i][2] || '').trim().toLowerCase();
    if (rowUsuario === usuario) {
      var activo = values[i][4];
      if (activo === false || String(activo).toLowerCase() === 'no' || String(activo).toLowerCase() === 'false') {
        return { ok: false, error: 'Esta cuenta está desactivada' };
      }
      var storedPassword = String(values[i][3] || '');
      var clave = 'c:' + usuario;
      if (bloqueado_(clave)) return { ok: false, error: BLOQUEO_ERROR_ };
      if (!passwordCoincide_(password, storedPassword)) {
        registrarFallo_(clave);
        return { ok: false, error: 'Usuario o contraseña incorrectos' };
      }
      limpiarFallos_(clave);
      // Contraseña escrita a mano en texto plano en PortalClientes: se cifra ahora que es correcta.
      if (!esHashPassword_(storedPassword)) {
        storedPassword = hashPassword_(password);
        try { sheet.getRange(i + 2, 4).setValue(storedPassword); } catch (e) {}
      }
      return {
        ok: true,
        nombre: String(values[i][0] || ''),
        cliente: String(values[i][1] || ''),
        // Token para getLoadsForCliente/getLoadDetailForCliente — ver crearTokenAcceso_.
        token: crearTokenAcceso_('pc', { u: usuario, h: huellaPassword_(storedPassword) })
      };
    }
  }
  return { ok: false, error: 'Usuario o contraseña incorrectos' };
}

/** Cliente (texto de la columna "cliente") al que da acceso un token del Portal Cliente, o null
 * si el token venció, la cuenta ya no existe, está desactivada o le cambiaron la contraseña. Se
 * relee la hoja PortalClientes en cada pedido para que esos cambios apliquen de inmediato. */
function clienteDeTokenPortal_(token) {
  var d = leerTokenAcceso_('pc', token);
  if (!d) return null;
  var sheet = getPortalClientesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][2] || '').trim().toLowerCase() !== d.u) continue;
    var activo = values[i][4];
    if (activo === false || String(activo).toLowerCase() === 'no' || String(activo).toLowerCase() === 'false') return null;
    if (huellaPassword_(String(values[i][3] || '')) !== d.h) return null;
    return String(values[i][1] || '').trim().toLowerCase() || null;
  }
  return null;
}

/** Da de alta (o actualiza, si el usuario ya existe) una cuenta del Portal Cliente.
 * Exige la contraseña de administración (antes cualquiera podía crearse una cuenta para el
 * cliente que quisiera llamando esta función desde el navegador). */
function addPortalCliente(nombre, cliente, usuario, password, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  nombre = String(nombre || '').trim();
  cliente = String(cliente || '').trim();
  usuario = String(usuario || '').trim();
  password = String(password || '').trim();
  if (!nombre || !cliente || !usuario) return { ok: false, error: 'Faltan datos' };
  // Contraseña vacía = editar nombre/cliente de una cuenta existente sin tocar su contraseña.
  if (password) {
    var problema = validarPasswordNueva_(password);
    if (problema) return { ok: false, error: problema };
  }
  var cifrada = password ? hashPassword_(password) : '';
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPortalClientesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      for (var i = 0; i < values.length; i++) {
        if (String(values[i][2] || '').trim().toLowerCase() === usuario.toLowerCase()) {
          var activo = values[i][4];
          sheet.getRange(i + 2, 1, 1, 5).setValues([[nombre, cliente, usuario, cifrada || values[i][3], activo === '' ? true : activo]]);
          if (cifrada) limpiarFallos_('c:' + usuario.toLowerCase());
          logAdmin_(adminPw, 'Portal Cliente: cuenta editada', usuario + ' (' + cliente + ')' + (cifrada ? ' · contraseña nueva' : ''));
          return { ok: true, updated: true };
        }
      }
    }
    if (!cifrada) return { ok: false, error: 'Asigna una contraseña a la cuenta nueva' };
    sheet.appendRow([nombre, cliente, usuario, cifrada, true]);
    logAdmin_(adminPw, 'Portal Cliente: cuenta nueva', usuario + ' (' + cliente + ')');
    return { ok: true, updated: false };
  } finally {
    lock.releaseLock();
  }
}

/** Elimina una cuenta del Portal Cliente por usuario. */
function removePortalCliente(usuario, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  usuario = String(usuario || '').trim().toLowerCase();
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPortalClientesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][2] || '').trim().toLowerCase() === usuario) {
        sheet.deleteRow(i + 2);
        logAdmin_(adminPw, 'Portal Cliente: cuenta eliminada', usuario);
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================================
 * ADMINISTRACIÓN DESDE "GESTIONAR CSR" (oct 2026) — cuentas del Portal Cliente, contraseña de
 * la Vista Gerencia y cuentas bloqueadas por intentos fallidos. Todo exige la contraseña de
 * administración (requireAdmin_). Nunca se regresa ninguna contraseña, ni cifrada.
 * ========================================================================================= */

/** Cuentas del Portal Cliente (sin contraseñas), con si están activas y si están bloqueadas. */
function getPortalClientes(adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_, items: [] };
  var sheet = getPortalClientesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, items: [] };
  var items = sheet.getRange(2, 1, lastRow - 1, 5).getValues()
    .filter(function (r) { return String(r[2] || '').trim(); })
    .map(function (r) {
      var usuario = String(r[2]).trim();
      var activo = !(r[4] === false || String(r[4]).toLowerCase() === 'no' || String(r[4]).toLowerCase() === 'false');
      return { nombre: String(r[0] || ''), cliente: String(r[1] || ''), usuario: usuario, activo: activo, bloqueado: bloqueado_('c:' + usuario.toLowerCase()) };
    });
  return { ok: true, items: items };
}

/** Activa o desactiva una cuenta del Portal Cliente sin borrarla (desactivada no puede entrar
 * y sus sesiones abiertas dejan de servir — ver clienteDeTokenPortal_). */
function setPortalClienteActivo(usuario, activo, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  usuario = String(usuario || '').trim().toLowerCase();
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getPortalClientesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0] || '').trim().toLowerCase() === usuario) {
        sheet.getRange(i + 2, 5).setValue(!!activo);
        logAdmin_(adminPw, 'Portal Cliente: cuenta ' + (activo ? 'activada' : 'desactivada'), usuario);
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}

/** El admin pone una contraseña nueva a la Vista Gerencia sin necesitar la anterior. Las
 * sesiones abiertas con la anterior dejan de servir solas (ver vistaTokenValido_). */
function setVistaLecturaPassword(newPw, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  newPw = String(newPw || '').trim();
  var problema = validarPasswordNueva_(newPw);
  if (problema) return { ok: false, error: problema };
  PropertiesService.getScriptProperties().setProperty('VISTA_LECTURA_PASSWORD', hashPassword_(newPw));
  limpiarFallos_('vista');
  logAdmin_(adminPw, 'Contraseña de la Vista Gerencia cambiada', '');
  return { ok: true };
}

/** Cuentas bloqueadas ahorita por intentos fallidos (personas del panel, cuentas del portal,
 * "Gestionar CSR" y Vista Gerencia), para poder liberarlas sin restablecer la contraseña. */
function getBloqueos(adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_, items: [] };
  var items = [];
  var personas = getPersonasSheet_();
  if (personas.getLastRow() >= 2) {
    personas.getRange(2, 1, personas.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var n = String(r[0] || '').trim();
      if (n && bloqueado_('p:' + n.toLowerCase())) items.push({ clave: 'p:' + n.toLowerCase(), etiqueta: n + ' (panel)' });
    });
  }
  var portal = getPortalClientesSheet_();
  if (portal.getLastRow() >= 2) {
    portal.getRange(2, 3, portal.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var u = String(r[0] || '').trim().toLowerCase();
      if (u && bloqueado_('c:' + u)) items.push({ clave: 'c:' + u, etiqueta: u + ' (Portal Cliente)' });
    });
  }
  if (bloqueado_('vista')) items.push({ clave: 'vista', etiqueta: 'Vista Gerencia' });
  return { ok: true, items: items };
}

/** Libera una cuenta bloqueada. Solo acepta claves con el formato que genera getBloqueos. */
function desbloquearCuenta(clave, adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_ };
  clave = String(clave || '');
  if (!/^(p:|c:).+|^vista$/.test(clave)) return { ok: false, error: 'Cuenta no válida' };
  limpiarFallos_(clave);
  logAdmin_(adminPw, 'Cuenta desbloqueada', clave);
  return { ok: true };
}

/* Bitácora de acciones de admin: todo lo que se hace desde "Gestionar CSR" queda en la hoja
 * "BitacoraAdmin" (fecha, quién, acción, detalle). "Quién" es la persona con sesión en el panel
 * desde donde se hizo (el panel la manda junto con la contraseña de admin). Nunca guarda
 * contraseñas. */
var BITACORA_ADMIN_COLUMNS = ['fecha', 'quien', 'accion', 'detalle'];

function getBitacoraAdminSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('BitacoraAdmin');
  if (!sheet) {
    sheet = ss.insertSheet('BitacoraAdmin');
    sheet.appendRow(BITACORA_ADMIN_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** La contraseña de admin llega como texto o como {pw, quien} (ver adminCred_ en PanelScript). */
function pwAdmin_(adminPw) {
  return (adminPw && typeof adminPw === 'object') ? String(adminPw.pw || '') : String(adminPw || '');
}

function logAdmin_(adminPw, accion, detalle) {
  try {
    var quien = (adminPw && typeof adminPw === 'object') ? String(adminPw.quien || '').slice(0, 60) : '';
    getBitacoraAdminSheet_().appendRow([new Date(), quien || '—', String(accion || ''), String(detalle || '').slice(0, 300)]);
  } catch (e) {
    // La bitácora nunca debe impedir la acción que ya se hizo.
  }
}

/** Últimas 100 acciones de admin, de la más nueva a la más vieja. */
function getBitacoraAdmin(adminPw) {
  if (!requireAdmin_(adminPw)) return { ok: false, error: ADMIN_PW_ERROR_, items: [] };
  var sheet = getBitacoraAdminSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, items: [] };
  var desde = Math.max(2, last - 99);
  var items = sheet.getRange(desde, 1, last - desde + 1, 4).getValues().reverse().map(function (r) {
    var f = r[0] instanceof Date ? r[0].toISOString() : String(r[0] || '');
    return { fecha: f, quien: String(r[1] || ''), accion: String(r[2] || ''), detalle: String(r[3] || '') };
  });
  return { ok: true, items: items };
}

/** Regresa las cargas de UN cliente (filtradas por el campo "customer", sin importar mayúsculas/
 * minúsculas ni espacios de más), ya recortadas a solo los campos que el portal debe mostrar —
 * nunca manda tarifas, notas internas, comentarios de CSR ni nada que no sea de ese cliente.
 * Incluye la etapa del timeline ya derivada (stageIndex / stageKey / stageLabel) para que el
 * cliente no tenga que calcular nada en el navegador. */
/* ---------------- Alertas automáticas (Fase 2 — Operación) ----------------
 * Se calculan al vuelo cada vez que se piden las cargas de un cliente — no se guarda nada.
 * Los umbrales son un punto de partida razonable a partir de lo que describiste, no un
 * estándar exacto de la operación; ajústalos aquí si la realidad pide otra cosa. La alerta de
 * "documentación próxima a vencer" se quedó fuera de esta fase porque hoy no hay ningún campo
 * de fecha de vencimiento de donde sacarla. */
var ALERT_FRONTERA_HORAS_GS = 4; // tiempo parado en frontera (status "Cruzando") antes de avisar
var ALERT_CITA_RIESGO_HORAS_GS = 24; // cita de entrega próxima sin haber cruzado aún a EUA
var ALERT_RETRASO_RIESGO_HORAS_GS = 6; // cita de entrega próxima sin haber llegado a planta

/** Regresa el nivel de alerta ('critical'/'warn'/'good') y un mensaje corto para un load, ya
 * con su etapa de timeline calculada. Se revisa de lo más urgente a lo menos urgente y se
 * regresa la primera condición que aplica. */
function deriveAlertLevel_(rec, stageIndex) {
  var now = new Date();
  var yaEntregado = stageIndex === 9;
  var deliveryAppt = rec.delivery_appt ? new Date(rec.delivery_appt) : null;
  var deliveryValida = deliveryAppt && !isNaN(deliveryAppt.getTime());
  var updatedAt = rec.updated_at ? new Date(rec.updated_at) : null;
  var updatedValida = updatedAt && !isNaN(updatedAt.getTime());

  if (!yaEntregado && deliveryValida && now > deliveryAppt) {
    var horasRetraso = Math.round((now - deliveryAppt) / 3600000);
    return { level: 'critical', message: 'Retraso de ' + horasRetraso + 'h respecto al ETA original.' };
  }
  if (!yaEntregado && stageIndex < 5 && deliveryValida) {
    var horasParaCita = (deliveryAppt - now) / 3600000;
    if (horasParaCita >= 0 && horasParaCita <= ALERT_CITA_RIESGO_HORAS_GS) {
      return { level: 'critical', message: 'La cita de entrega es en menos de ' + ALERT_CITA_RIESGO_HORAS_GS + 'h y el embarque aún no cruza a EUA.' };
    }
  }
  if (!yaEntregado && rec.status === 'Cruzando' && updatedValida) {
    var horasEnFrontera = (now - updatedAt) / 3600000;
    if (horasEnFrontera >= ALERT_FRONTERA_HORAS_GS) {
      return { level: 'warn', message: 'La unidad lleva ' + Math.round(horasEnFrontera) + 'h en frontera.' };
    }
  }
  if (!yaEntregado && stageIndex < 7 && deliveryValida) {
    var horasParaCita2 = (deliveryAppt - now) / 3600000;
    if (horasParaCita2 >= 0 && horasParaCita2 <= ALERT_RETRASO_RIESGO_HORAS_GS) {
      return { level: 'warn', message: 'Riesgo de no llegar a tiempo a la cita de entrega.' };
    }
  }
  return { level: 'good', message: 'En tiempo.' };
}

function getLoadsForCliente(token) {
  // Antes recibía el NOMBRE del cliente desde el navegador — bastaba con conocerlo. Ahora el
  // cliente sale del token del login (ver clienteDeTokenPortal_), nunca de lo que mande la página.
  var cliente = clienteDeTokenPortal_(token);
  if (!cliente) return { ok: false, error: SESION_PORTAL_VENCIDA_ };
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.parse(JSON.stringify([]));
  var values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  var out = [];
  values.forEach(function (row) {
    if (row[0] === '' || row[0] === null) return;
    var rec = {};
    COLUMNS.forEach(function (col, i) { rec[col] = row[i]; });
    if (String(rec.customer || '').trim().toLowerCase() !== cliente) return;
    var stageIndex = deriveTimelineStage_(rec);
    var alert = deriveAlertLevel_(rec, stageIndex);
    out.push({
      load: rec.load,
      customer: rec.customer,
      origin_city: rec.origin_city,
      origin_state: rec.origin_state,
      dest_city: rec.dest_city,
      dest_state: rec.dest_state,
      truck: rec.truck,
      trailer: rec.trailer,
      pickup_appt: rec.pickup_appt,
      delivery_appt: rec.delivery_appt,
      status: rec.status,
      stageIndex: stageIndex,
      stageKey: TIMELINE_STAGES_GS[stageIndex].key,
      stageLabel: TIMELINE_STAGES_GS[stageIndex].label,
      alertLevel: alert.level,
      alertMessage: alert.message
    });
  });
  return JSON.parse(JSON.stringify(out));
}

/** Detalle completo de UNA carga para el Portal Cliente: lo mismo que ya manda
 * getLoadsForCliente para ese load, más la documentación (BOL/DODA/Entry/Sobre listo) y las
 * incidencias — información que no hace falta mandar para toda la lista del dashboard, solo
 * cuando el cliente entra al detalle de un embarque específico. Vuelve a verificar que el load
 * sea de ese cliente (blindaje contra adivinar números de load ajenos desde el navegador). */
function getLoadDetailForCliente(load, token) {
  var cliente = clienteDeTokenPortal_(token);
  if (!cliente) return { ok: false, error: SESION_PORTAL_VENCIDA_ };
  load = String(load || '').trim();
  if (!load) return null;
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  var found = null;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row[0] === '' || row[0] === null) continue;
    if (String(row[0]) !== load) continue;
    var rec = {};
    COLUMNS.forEach(function (col, j) { rec[col] = row[j]; });
    if (String(rec.customer || '').trim().toLowerCase() !== cliente) continue;
    found = rec;
    break;
  }
  if (!found) return null;

  var stageIndex = deriveTimelineStage_(found);
  var alert = deriveAlertLevel_(found, stageIndex);
  var incidencias = JSON.parse(leerIncidencias_(load)).map(function (inc) {
    return { fecha: inc.fecha, categoria: inc.categoria, severidad: inc.severidad, descripcion: inc.descripcion, accion_tomada: inc.accion_tomada };
  });

  return JSON.parse(JSON.stringify({
    load: found.load,
    customer: found.customer,
    origin_city: found.origin_city,
    origin_state: found.origin_state,
    dest_city: found.dest_city,
    dest_state: found.dest_state,
    truck: found.truck,
    trailer: found.trailer,
    pickup_appt: found.pickup_appt,
    delivery_appt: found.delivery_appt,
    status: found.status,
    stageIndex: stageIndex,
    stageKey: TIMELINE_STAGES_GS[stageIndex].key,
    stageLabel: TIMELINE_STAGES_GS[stageIndex].label,
    alertLevel: alert.level,
    alertMessage: alert.message,
    documentos: { bol: !!found.bol, doda: !!found.doda, entry: !!found.entry, sobreListo: !!found.sobre_listo },
    incidencias: incidencias,
    avisos: avisosEnviadosAlCliente_(load)
  }));
}

/** Mensajes que el equipo le ENVIÓ al cliente sobre esta carga (fecha, canal y el texto tal
 * cual se mandó), más reciente primero. A propósito no incluye los registros internos
 * (PENDIENTE / NOTIFICADO sin mensaje), que traen motivos y nombres del equipo. */
function avisosEnviadosAlCliente_(load) {
  var sheet = getComunicacionesSheet_();
  if (sheet.getLastRow() < 2) return [];
  var key = normalizeLoadKey_(load);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues()
    .filter(function (r) { return String(r[3]).toUpperCase() === 'ENVIADO' && String(r[7] || '').trim() && normalizeLoadKey_(r[1]) === key; })
    .map(function (r) { return { fecha: r[2] instanceof Date ? r[2].toISOString() : String(r[2] || ''), canal: String(r[6] || ''), mensaje: String(r[7] || '') }; })
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
}

/* =========================================================================================
 * INCIDENCIAS (Fase 2 — Operación)
 * Bitácora de incidencias por carga: qué pasó, cuándo, y qué acción se tomó. El CSR las
 * registra desde el panel interno (firmadas con contraseña, igual que los comentarios) y el cliente
 * las ve de solo lectura en el Portal Cliente, más recientes primero.
 * ========================================================================================= */

var INCIDENCIA_CATEGORIAS_GS = ['Documentación', 'Operador', 'Unidad', 'Aduana', 'Cliente', 'Otro'];
var INCIDENCIA_SEVERIDADES_GS = ['critical', 'warn', 'good']; // rojo / amarillo / verde

/** Devuelve (y crea si hace falta) la hoja "Incidencias". */
function getIncidenciasSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Incidencias');
  if (!sheet) {
    sheet = ss.insertSheet('Incidencias');
    sheet.appendRow(['id', 'load', 'fecha', 'categoria', 'severidad', 'descripcion', 'accion_tomada', 'creado_por']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Agrega una incidencia a una carga. Firmada con contraseña, igual que los comentarios — nunca se
 * guarda a nombre de quien sea que esté nada más seleccionado para filtrar el panel. */
function addIncidencia(load, categoria, severidad, descripcion, accionTomada, usuario, password) {
  load = String(load || '').trim();
  categoria = String(categoria || '').trim();
  severidad = String(severidad || '').trim();
  descripcion = String(descripcion || '').trim();
  accionTomada = String(accionTomada || '').trim();
  usuario = String(usuario || '').trim();
  if (!load) return { ok: false, error: 'Falta el load' };
  if (INCIDENCIA_CATEGORIAS_GS.indexOf(categoria) === -1) return { ok: false, error: 'Categoría no válida' };
  if (INCIDENCIA_SEVERIDADES_GS.indexOf(severidad) === -1) return { ok: false, error: 'Severidad no válida' };
  if (!descripcion) return { ok: false, error: 'Falta la descripción' };
  var check = requireLogin_(usuario, password);
  if (!check.ok) return { ok: false, error: check.error || 'No se pudo verificar tu identidad' };
  var lock = acquireLock_(10000, 3);
  var id;
  try {
    var sheet = getIncidenciasSheet_();
    var now = new Date();
    id = Utilities.getUuid();
    sheet.appendRow([id, load, now, categoria, severidad, descripcion, accionTomada, usuario]);
    touchLastModified_('loads');
  } finally {
    lock.releaseLock();
  }
  if (severidad === 'critical') {
    try { registrarIncidentDayEnTciDashboard_(load); } catch (e) { /* no-op: ver comentario arriba */ }
  }
  return { ok: true, id: id };
}

/** Dashboard TCI: id de "TCI-Dashboard-Base de datos" y de su hoja ClientDaily. Formato de "day"
 * (yyyy-MM-dd, zona America/Mexico_City) y de "key" (day + '|' + cliente) confirmados por Esteban
 * leyendo una fila real recién guardada por el propio dashboard TCI (2026-10-01) — NO es un
 * formato adivinado. Dado el historial de corrupción de datos de ese Sheet, cualquier cambio aquí
 * debe volver a confirmarse contra una fila real antes de tocarse. */
var TCI_DASHBOARD_SHEET_ID_GS = '11izSfuC9FFdFzSOr35uvAG_YSLCd46NJ4AB0KqtUdpY';
var TCI_CLIENT_DAILY_SHEET_GS = 'ClientDaily';
var TCI_CLIENT_DAILY_FIELDS_GS = ['key', 'day', 'cliente', 'incidentDay', 'escalacion', 'claims', 'retrasoCliente'];

/** Suma +1 al "Incident Day" del cliente de 'load' en el dashboard TCI, replicando el mismo
 * upsert-por-key que usa el propio dashboard (lee la fila existente del día+cliente si ya existe
 * y le suma 1 a incidentDay; si no existe, crea la fila con incidentDay=1). Se llama solo para
 * incidencias con severidad 'critical' (ver addIncidencia). Nota: como son dos proyectos de Apps
 * Script independientes compartiendo el mismo Sheet, el candado de abajo solo protege contra dos
 * incidencias críticas de Bajío casi simultáneas — no contra una edición manual simultánea del
 * propio dashboard TCI sobre la misma fila (no hay forma de compartir un candado entre dos
 * proyectos distintos). Es una ventana muy angosta (milisegundos) y el peor caso es un conteo de
 * +1 perdido, no corrupción de datos. */
function registrarIncidentDayEnTciDashboard_(load) {
  var mainSheet = getSheet_();
  var rowIndex = findLoadRowNormalized_(mainSheet, load);
  if (rowIndex === -1) return;
  var customerCol = COLUMNS.indexOf('customer') + 1;
  var cliente = String(mainSheet.getRange(rowIndex, customerCol).getValue() || '').trim();
  if (!cliente) return; // load no encontrado o sin cliente capturado: no hay con qué armar la key

  var day = Utilities.formatDate(new Date(), 'America/Mexico_City', 'yyyy-MM-dd');
  var key = day + '|' + cliente;

  var lock = acquireLock_(10000, 3);
  try {
    var ss = SpreadsheetApp.openById(TCI_DASHBOARD_SHEET_ID_GS);
    var sheet = ss.getSheetByName(TCI_CLIENT_DAILY_SHEET_GS);
    if (!sheet) {
      sheet = ss.insertSheet(TCI_CLIENT_DAILY_SHEET_GS);
      sheet.appendRow(TCI_CLIENT_DAILY_FIELDS_GS);
    }

    var tciLastRow = sheet.getLastRow();
    var rowIndex = -1;
    if (tciLastRow >= 2) {
      var keys = sheet.getRange(2, 1, tciLastRow - 1, 1).getValues();
      for (var r = 0; r < keys.length; r++) {
        if (String(keys[r][0]) === key) { rowIndex = r + 2; break; }
      }
    }

    if (rowIndex === -1) {
      sheet.appendRow([key, day, cliente, 1, 0, 0, 0]);
    } else {
      var incidentDayCol = TCI_CLIENT_DAILY_FIELDS_GS.indexOf('incidentDay') + 1;
      var current = sheet.getRange(rowIndex, incidentDayCol).getValue();
      current = (typeof current === 'number' ? current : parseInt(current, 10)) || 0;
      sheet.getRange(rowIndex, incidentDayCol).setValue(current + 1);
    }
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve las incidencias de una carga, más reciente primero. Uso interno (panel CSR) —
 * incluye quién la capturó (creado_por), que no se manda al Portal Cliente. */
function getIncidencias(load, usuario, password) {
  if (!sesionOk_(usuario, password)) return JSON.stringify([]);
  return leerIncidencias_(load);
}

/** Lectura sin verificación de sesión — solo para uso interno del servidor (la usa
 * getLoadDetailForCliente, del Portal Cliente). */
function leerIncidencias_(load) {
  load = String(load || '').trim();
  var sheet = getIncidenciasSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify([]);
  var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var out = values
    .filter(function (row) { return row[0] !== '' && String(row[1]) === load; })
    .map(function (row) {
      return { id: row[0], load: row[1], fecha: row[2], categoria: row[3], severidad: row[4], descripcion: row[5], accion_tomada: row[6], creado_por: row[7] };
    })
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  return JSON.stringify(out);
}

/** Elimina una incidencia (por si se capturó algo por error). Uso interno. */
function removeIncidencia(id, usuario, password) {
  if (!sesionOk_(usuario, password)) return { ok: false, error: 'Inicia sesión para continuar' };
  var lock = acquireLock_(10000, 3);
  try {
    var sheet = getIncidenciasSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'Sin datos' };
    var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(id)) {
        var row = values[i];
        sheet.deleteRow(i + 2);
        // Queda rastro en el historial de la carga: qué incidencia se borró y quién la borró.
        logHistorialCambio_(row[1], 'Incidencia eliminada', String(row[3] || '') + ': ' + String(row[5] || ''), '', usuario);
        touchLastModified_('loads');
        return { ok: true };
      }
    }
    return { ok: false, error: 'No encontrada' };
  } finally {
    lock.releaseLock();
  }
}
