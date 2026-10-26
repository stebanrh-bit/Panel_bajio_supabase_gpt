var commentsCurrentLoad = null;
  var commentsCurrentKind = "load"; // 'load' o 'pendiente' — mismo modal e hilo de comentarios para ambos.

  function escHtml(v) {
    return v === null || v === undefined
      ? ""
      : String(v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
  }

  function fmtDateTime(d) {
    return d ? window.panelUsability.formatMoment(d) : "";
  }

  function renderComments(raw) {
    var box = document.getElementById("comments-list");
    var list;
    try {
      list = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      list = [];
    }
    if (!list || !list.length) {
      box.innerHTML =
        '<div class="comments-empty">Todavía no hay comentarios para esta carga.</div>';
      return;
    }
    box.innerHTML = list
      .map(function (c) {
        var meta =
          fmtDateTime(c.ts) + (c.usuario ? " · " + escHtml(c.usuario) : "");
        return (
          '<div class="comment-entry"><span class="ts">' +
          meta +
          '</span><span class="txt">' +
          escHtml(c.text) +
          "</span></div>"
        );
      })
      .join("");
  }

  /** Mismo modal de comentarios para loads y para pendientes: getComments/addComment solo
   * necesitan un identificador de texto (número de load, o el id del pendiente), así que se
   * reutiliza tal cual — lo único que cambia es el encabezado. */

  // ===== V3 Expediente de carga =====
  var workspaceCurrentLoad = null,
    workspaceCurrentTab = "operacion";
  var workspaceHistorialSubTab = "cambios";
  function workspaceRec() {
    return workspaceCurrentLoad ? recPorLoad_(workspaceCurrentLoad) : null;
  }
  function wsVal(v) {
    return v === null || v === undefined || v === "" ? "—" : esc(v);
  }
  function notifyReasonParts_(reason) {
    return String(reason || "Actualización operativa")
      .split(" · ")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }
  function notifyReasonRows(reason) {
    return notifyReasonParts_(reason)
      .map(function (p) {
        return (
          '<div class="client-notify-item"><span class="dot"></span>' +
          esc(p) +
          "</div>"
        );
      })
      .join("");
  }
  function wsBox(l, v, w) {
    return (
      '<div class="ws-box' +
      (w ? " wide" : "") +
      '"><div class="ws-label">' +
      esc(l) +
      '</div><div class="ws-value">' +
      wsVal(v) +
      "</div></div>"
    );
  }
  function wsGroup(title, inner, cols) {
    return (
      '<div class="ws-group"><div class="ws-group-h">' +
      esc(title) +
      '</div><div class="ws-grid" style="grid-template-columns:repeat(' +
      (cols || 2) +
      ',minmax(0,1fr))">' +
      inner +
      "</div></div>"
    );
  }
  function wsDate(v) {
    return v ? fmtDateTime(v) : "—";
  }
  function openLoadWorkspace(load, tab) {
    var r = recPorLoad_(load);
    if (!r) return;
    workspaceCurrentLoad = String(load);
    workspaceCurrentTab =
      PANEL_CONFIG.INTERNAL_ONLY &&
      !PANEL_CONFIG.MANUAL_CLIENT_MESSAGES &&
      tab === "comunicacion"
        ? "operacion"
        : tab || "operacion";
    document.getElementById("workspace-title").textContent =
      "Carga " + r.load + " · " + (r.customer || "Sin cliente");
    document.getElementById("workspace-route").textContent =
      (r.origin_city || "—") +
      ", " +
      (r.origin_state || "") +
      " → " +
      (r.dest_city || "—") +
      ", " +
      (r.dest_state || "");
    document.getElementById("workspace-backdrop").classList.add("show");
    document.documentElement.classList.add("ws-open");
    renderWorkspace();
    if (!Object.prototype.hasOwnProperty.call(r, "bol_source")) {
      google.script.run
        .withSuccessHandler(function (res) {
          if (
            !res ||
            !res.ok ||
            workspaceCurrentLoad !== String(load) ||
            String(r.updated_at) !== String(res.record.updated_at)
          )
            return;
          Object.assign(r, res.record);
          if (!isUserEditingField()) renderWorkspace();
        })
        .withFailureHandler(function (err) {
          showToast("No se pudo completar el detalle: " + err.message, "error");
        })
        .getDetalleCarga(load);
    }
  }
  function closeLoadWorkspace() {
    document.getElementById("workspace-backdrop").classList.remove("show");
    document.documentElement.classList.remove("ws-open");
    workspaceCurrentLoad = null;
  }

  function reviewLocalValue(v) {
    if (!v) return "";
    var d = new Date(v);
    if (isNaN(d.getTime())) return "";
    var p = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      d.getFullYear() +
      "-" +
      p(d.getMonth() + 1) +
      "-" +
      p(d.getDate()) +
      "T" +
      p(d.getHours()) +
      ":" +
      p(d.getMinutes())
    );
  }
  /** La fecha es de atención: vencer nunca completa ni borra un seguimiento pendiente. */
  function workspaceReviewHtml(r) {
    var scheduled = !!r.next_review_at;
    var due = scheduled && Date.parse(r.next_review_at) <= Date.now();
    return (
      '<div class="review-card"><h3 class="ws-section-title">Seguimiento programado por ti</h3>' +
      '<div class="review-state' +
      (due ? " due" : "") +
      '" role="status">' +
      (scheduled
        ? (due ? "Pendiente de atender · " : "Programado para · ") +
          esc(wsDate(r.next_review_at))
        : "Sin seguimiento programado") +
      '</div><div class="section-help">La fecha indica cuándo atenderlo; no lo completa automáticamente. Cuando termines, pulsa «Completar seguimiento»: dejará de aparecer como pendiente. Si falta trabajo, usa «Reprogramar». Es independiente de la revisión automática de tránsito.</div><div class="review-row"><div class="review-field"><label for="next-review-at">Fecha y hora para atender</label><input id="next-review-at" class="review-input" type="datetime-local" value="' +
      reviewLocalValue(r.next_review_at) +
      '"></div><div class="review-field"><label for="next-review-note">Qué revisar</label><input id="next-review-note" class="review-input" type="text" maxlength="250" placeholder="Ej. validar cruce / confirmar ETA" value="' +
      esc(r.next_review_note || "") +
      '"></div><button class="ws-btn primary" data-review-save>' +
      (scheduled ? "Reprogramar" : "Programar") +
      "</button>" +
      (scheduled
        ? '<button class="ws-btn" data-review-clear>Completar seguimiento</button>'
        : "") +
      '</div><div id="review-action-feedback" class="tracking-note" role="status">' +
      (scheduled
        ? (due ? "Por atender desde " : "Programado ") +
          esc(relativeTimeLabel(r.next_review_at)) +
          (r.next_review_by ? " por " + esc(r.next_review_by) : "") +
          "."
        : "Selecciona cuándo quieres volver a revisar esta carga.") +
      "</div></div>"
    );
  }

  function titleCity(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/(^|[\s\-\/])([a-záéíóúüñ])/g, function (_, a, b) {
        return a + b.toUpperCase();
      });
  }
  function sourceBadge(r, field) {
    var src = String(r[field + "_source"] || "VG").toUpperCase();
    return (
      '<span class="source-badge ' +
      (src === "MANUAL" ? "manual" : "vg") +
      '">' +
      (src === "MANUAL" ? "MANUAL" : "VG") +
      "</span>"
    );
  }
  function manualFieldHtml(r, field, label) {
    var manual = String(r[field + "_source"] || "").toUpperCase() === "MANUAL",
      val = r[field] || "—",
      who = r[field + "_manual_by"] || "",
      at = r[field + "_manual_at"] || "";
    return (
      '<div class="ws-box"><div class="ws-box-label">' +
      label +
      sourceBadge(r, field) +
      '</div><div class="ws-box-value">' +
      esc(val) +
      "</div>" +
      (manual
        ? '<div class="manual-warning">⚠ Dato ingresado manualmente' +
          (who ? " por " + esc(who) : "") +
          (at ? " · " + esc(wsDate(at)) : "") +
          ". No confirmado por VG.</div>"
        : "") +
      '<div class="inline-editor"><input class="review-input" data-manual-input="' +
      field +
      '" placeholder="' +
      esc(r[field] || label) +
      '"><button class="ws-btn" data-manual-save="' +
      field +
      '">Guardar</button></div></div>'
    );
  }
  function inlineCommentHtml() {
    return '<div class="inline-panel" id="ws-inline-comment" hidden><h3 class="ws-section-title">Agregar comentario</h3><textarea class="review-input" id="ws-inline-comment-text" placeholder="Escribe el comentario operativo…"></textarea><div class="ws-actions"><button class="ws-btn primary" data-inline-comment-save>Guardar comentario</button><button class="ws-btn" data-inline-close="ws-inline-comment">Cancelar</button></div><div id="ws-inline-comments-list"></div></div>';
  }
  function inlineIncidentHtml() {
    return '<div class="inline-panel" id="ws-inline-incident" hidden><h3 class="ws-section-title">Registrar incidencia</h3><select class="review-input" id="ws-inline-inc-category"><option>Documentación</option><option>Operador</option><option>Unidad</option><option>Aduana</option><option>Cliente</option><option>Otro</option></select><select class="review-input" id="ws-inline-inc-severity"><option value="warn">Media</option><option value="critical">Crítica</option><option value="good">Informativa</option></select><textarea class="review-input" id="ws-inline-inc-desc" placeholder="Describe la incidencia…"></textarea><textarea class="review-input" id="ws-inline-inc-action" placeholder="Acción tomada / siguiente paso…"></textarea><div class="ws-actions"><button class="ws-btn primary" data-inline-inc-save>Guardar incidencia</button><button class="ws-btn" data-inline-close="ws-inline-incident">Cancelar</button></div></div>';
  }

  function journeyStageDone_(dateStr) {
    if (!dateStr) return false;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return d.getTime() <= Date.now();
  }
  var TRANSIT_SUBSTAGE_STATUSES_ = [
    "En transito",
    "En yarda MX",
    "Patio permisionario",
    "Cruzando",
  ];
  function workspaceJourneyHtml(r) {
    var stages = [
      {
        label: "Pickup",
        date: r.pickup_actual || r.pickup_appt,
        done: !!r.pickup_actual,
      },
      {
        label: "Salida planta",
        date: r.salida_mexico_fecha,
        done: journeyStageDone_(r.salida_mexico_fecha),
      },
    ];
    var salidaLista = journeyStageDone_(r.salida_mexico_fecha);
    var cruceLista = journeyStageDone_(r.cruce_usa_fecha);
    if (
      salidaLista &&
      !cruceLista &&
      TRANSIT_SUBSTAGE_STATUSES_.indexOf(r.status) !== -1
    ) {
      stages.push({ label: r.status, date: "", done: false });
    }
    stages.push({
      label: "Cruce aduana",
      date: r.cruce_usa_fecha,
      done: cruceLista,
    });
    stages.push({
      label: "Entrega",
      date: r.delivery_actual || r.delivery_appt,
      done: !!r.delivery_actual,
    });
    var activeIdx = -1;
    for (var i = 0; i < stages.length; i++) {
      if (!stages[i].done) {
        activeIdx = i;
        break;
      }
    }
    var parts = [];
    stages.forEach(function (s, i) {
      if (i > 0)
        parts.push(
          '<div class="ws-journey-line' +
            (stages[i - 1].done ? " done" : "") +
            '"></div>',
        );
      var cls =
        "ws-journey-stage" +
        (s.done ? " done" : i === activeIdx ? " active" : " pending");
      var dateLabel = s.date
        ? fmtDateTime(s.date)
        : i === activeIdx
          ? "En curso"
          : "Pendiente";
      parts.push(
        '<div class="' +
          cls +
          '"><div class="ws-journey-dot"></div><div class="ws-journey-label">' +
          esc(s.label) +
          '</div><div class="ws-journey-date">' +
          esc(dateLabel) +
          "</div></div>",
      );
    });
    return '<div class="ws-journey">' + parts.join("") + "</div>";
  }

  function esEstadoMexicano_(estado) {
    return /\.$/.test(String(estado || "").trim());
  }
  function esLaredoTX_(ciudad, estado) {
    return (
      /laredo/i.test(String(ciudad || "").trim()) &&
      /^tx\.?$/i.test(String(estado || "").trim())
    );
  }
  function esNuevoLaredo_(ciudad) {
    return /nuevo\s*laredo/i.test(String(ciudad || "").trim());
  }
  function loadDirection(r) {
    var origenMx = esEstadoMexicano_(r.origin_state);
    var destinoMx = esEstadoMexicano_(r.dest_state);
    var destinoLaredoTX = esLaredoTX_(r.dest_city, r.dest_state);
    // Transload: sale de Nuevo Laredo hacia EE.UU., EXCEPTO cuando el destino es Laredo TX (ese
    // caso es un cruce normal, no transload) — cuenta con cualquier estatus, no solo Completed/
    // Delivered, mismo criterio que el dashboard TCI.
    var transload =
      esNuevoLaredo_(r.origin_city) && !destinoMx && !destinoLaredoTX;
    var code = null;
    if (origenMx && !destinoMx)
      code = "NB"; // México -> EE.UU. = Exportación (incluye México -> Laredo TX)
    else if (!origenMx && destinoMx)
      code = "SB"; // EE.UU. -> México = Importación
    else if (!origenMx && !destinoMx && destinoLaredoTX) code = "SB"; // excepción: ambos lados EE.UU. pero el destino es Laredo TX
    return { code: code, transload: transload };
  }
  function directionLabel(dir) {
    if (dir.transload) return "Transload";
    if (dir.code === "NB") return "Exportación (NB)";
    if (dir.code === "SB") return "Importación (SB)";
    return "—";
  }
  function workspaceOperationHtml(r) {
    var citas =
      wsBox("Cita de recolección", wsDate(r.pickup_appt)) +
      wsBox("Recolección real", wsDate(r.pickup_actual)) +
      wsBox("Entrega · cita", wsDate(r.delivery_appt)) +
      wsBox("Entrega real", wsDate(r.delivery_actual));
    var ruta =
      wsBox(
        "Origen",
        titleCity(r.origin_city) +
          (r.origin_state ? ", " + String(r.origin_state).toUpperCase() : ""),
      ) +
      wsBox(
        "Destino",
        titleCity(r.dest_city) +
          (r.dest_state ? ", " + String(r.dest_state).toUpperCase() : ""),
      ) +
      wsBox("Dirección", directionLabel(loadDirection(r))) +
      wsBox("Salida México", wsDate(r.salida_mexico_fecha)) +
      wsBox("Cruce aduana", wsDate(r.cruce_usa_fecha));
    var unidad =
      manualFieldHtml(r, "truck", "Unidad") +
      manualFieldHtml(r, "trailer", "Trailer") +
      window.panelSignals.signalStrip(r.load, r.logistics_signals) +
      wsBox("Work order", r.work_order);
    // El estatus se cambia aquí mismo con el mismo selector de las tarjetas (mismo manejador
    // delegado: recordatorios, revisión de tránsito, aviso al cliente y "Deshacer").
    return (
      '<div class="ws-status-line"><select class="status-select ws-status-select" aria-label="Estatus de la carga ' +
      esc(r.load) +
      '" title="Cambiar estatus" data-status-load="' +
      esc(r.load) +
      '" style="' +
      statusStyle(r.status) +
      '">' +
      statusOptionsHtml(r.status) +
      "</select>" +
      (r.client_notify_pending
        ? '<span class="notify-badge">Pendiente comunicar a cliente: ' +
          esc(notifyReasonParts_(r.client_notify_reason).join("; ")) +
          "</span>"
        : "") +
      "</div>" +
      '<dl class="decision-summary"><div><dt>Etapa</dt><dd>' +
      esc(r.stageLabel || "Sin etapa") +
      "</dd></div><div><dt>Prioridad</dt><dd>" +
      esc(
        r.alertLevel === "critical"
          ? "Urgente"
          : needsAttention(r)
            ? "Revisar"
            : "Normal",
      ) +
      "</dd></div><div><dt>Atención</dt><dd>" +
      esc(needsAttentionReasons(r).join(" · ") || "Sin pendientes") +
      "</dd></div></dl>" +
      window.panelInstructionUI.instructionCard(r) +
      workspaceJourneyHtml(r) +
      '<h3 class="ws-section-title">Control operativo</h3><div class="ws-group-row">' +
      wsGroup("Citas y tiempos", citas) +
      wsGroup("Ruta y cruce", ruta) +
      wsGroup("Unidad", unidad, 1) +
      "</div>" +
      pendientePuntualHtml_(r) +
      workspaceReviewHtml(r) +
      '<div class="ws-actions"><button class="ws-btn primary" data-ws-comments="' +
      esc(r.load) +
      '">Agregar comentario</button><button class="ws-btn" data-ws-incidencia="' +
      esc(r.load) +
      '">Registrar incidencia</button>' +
      (PANEL_CONFIG.MANUAL_CLIENT_MESSAGES
        ? '<button type="button" class="ws-btn" data-home-comm="' +
          esc(r.load) +
          '">Notificar a cliente</button>'
        : "") +
      (r.client_notify_pending
        ? '<button class="ws-btn" data-client-notified-load="' +
          esc(r.load) +
          '">Marcar cliente notificado</button>'
        : "") +
      "</div>" +
      inlineCommentHtml() +
      inlineIncidentHtml()
    );
  }

  function workspaceTrackingHtml(r) {
    var ready = !!String(r.tracking_link || "").trim();
    return (
      '<h3 class="ws-section-title">Tracking Center</h3>' +
      '<div class="tracking-card"><div class="tracking-head"><div><div class="tracking-title">Samsara · Seguimiento de la unidad</div><div class="tracking-note">Guarda aquí el enlace para revisar la ubicación de esta unidad.</div></div><span class="tracking-state ' +
      (ready ? "ready" : "missing") +
      '">' +
      (ready ? "✓ Tracking disponible" : "Tracking pendiente") +
      "</span></div>" +
      '<div class="tracking-input-row"><input class="tracking-input" id="tracking-link-input" type="url" placeholder="https://..." value="' +
      esc(r.tracking_link || "") +
      '"><button class="ws-btn primary" data-tracking-save>Guardar</button></div>' +
      '<div id="tracking-save-feedback" class="tracking-note"></div><div class="tracking-actions">' +
      (ready
        ? '<button class="ws-btn" data-tracking-open>Abrir tracking</button><button class="ws-btn" data-tracking-copy>Copiar link</button>'
        : "") +
      "</div></div>" +
      '<div class="tracking-card falta-card"><div class="tracking-title">🚛 ¿Cuánto le falta?</div>' +
      '<div class="tracking-note">Pega las coordenadas de la unidad (de Samsara) y calculo las millas por carretera hasta ' +
      esc(r.dest_city ? radarLugar_(r.dest_city, r.dest_state) : "el destino") +
      " y a qué hora llega (millas ÷ " +
      VELOCIDAD_UNIDAD_MPH +
      ").</div>" +
      '<div class="tracking-input-row"><input class="tracking-input" id="falta-coords" type="text" placeholder="41.9237, -85.0186" autocomplete="off" value="' +
      esc(faltaDe_(r.load).coords) +
      '"><button class="ws-btn primary" data-falta-calcular>Calcular</button></div>' +
      '<div class="falta-resultado" id="falta-resultado">' +
      esc(faltaDe_(r.load).html) +
      "</div></div>" +
      '<div class="ws-grid">' +
      wsBox("Unidad", r.truck) +
      wsBox("Trailer", r.trailer) +
      wsBox("Estatus", r.status) +
      wsBox("Última actualización", wsDate(r.updated_at), true) +
      "</div>"
    );
  }

  // ---- "¿Cuánto le falta?" (Expediente de carga → Tracking) ----
  // Coordenadas de la unidad → millas por carretera (OSRM, gratis) hasta la ciudad destino de la
  // carga → hora de llegada con la regla del equipo (millas ÷ 48), comparada con la cita de entrega.
  // Si OSRM no responde, se estima con la línea recta × 1.2. El punto y el trayecto se guardan en la
  // base (Direcciones/Distancias) como en el Radar, para que el proceso de Google los certifique.
  var faltaUltimo_ = null; // { load, texto } del último cálculo, para copiarlo o guardarlo como comentario
  // El workspace se vuelve a dibujar con cada refresco: se guarda el último resultado para no perderlo.
  var faltaEstado_ = null; // { load, coords, html }
  function faltaDe_(load) {
    return faltaEstado_ && String(faltaEstado_.load) === String(load)
      ? faltaEstado_
      : { coords: "", html: "" };
  }
  function faltaCalcular_(load) {
    var r = recPorLoad_(load),
      out = document.getElementById("falta-resultado"),
      inp = document.getElementById("falta-coords");
    if (!r || !out || !inp) return;
    var c = parseCoords_(inp.value);
    if (!c) {
      out.innerHTML =
        '<span class="sev-warn">Pega las coordenadas así: 41.9237, -85.0186</span>';
      return;
    }
    if (!r.dest_city) {
      out.innerHTML =
        '<span class="sev-warn">Esta carga no tiene ciudad de destino.</span>';
      return;
    }
    var hacer = function () {
      var dKey = radarKey_(r.dest_city, r.dest_state),
        destino = radarLugar_(r.dest_city, r.dest_state);
      out.innerHTML = '<span class="hm-soft">Calculando…</span>';
      cargarCoordsP_()
        .then(function () {
          if (radarCoords_[dKey]) return radarCoords_[dKey];
          return radarBuscarOSM_(r.dest_city, r.dest_state).then(function (d) {
            if (d) {
              radarCoords_[dKey] = d;
              gsr_(
                "guardarCoordenadas",
                [
                  {
                    key: dKey,
                    ciudad: titleCity(r.dest_city),
                    estado: String(r.dest_state || ""),
                    lat: d[0],
                    lon: d[1],
                  },
                ],
                myRealIdentity,
                myPassword,
              ).catch(function () {});
            }
            return d;
          });
        })
        .then(function (d) {
          if (!d) throw new Error("No encontré " + destino + " en el mapa.");
          var recta = radarMillas_(c, d);
          return radarPedirRuta_(c, d)
            .catch(function () {
              return null;
            })
            .then(function (ruta) {
              if (!ruta) return { millas: recta * 1.2, fuente: "estimado" };
              gsr_(
                "guardarDistancias",
                [
                  {
                    origen: coordsKey_(c),
                    destino: dKey,
                    millas: ruta.millas,
                    horas: ruta.horas,
                    recta: recta,
                  },
                ],
                myRealIdentity,
                myPassword,
              ).catch(function () {});
              return { millas: ruta.millas, fuente: "osm" };
            });
        })
        .then(function (x) {
          if (String(workspaceCurrentLoad) !== String(load)) return; // ya cambiaron de carga
          out = document.getElementById("falta-resultado") || out; // por si el workspace se redibujó mientras calculaba
          var h = horasUnidad_(x.millas),
            llega = new Date(Date.now() + h * 3600000),
            cita = pd(r.delivery_appt),
            vsCita = "";
          if (cita && !isNaN(cita.getTime())) {
            var dif = (cita.getTime() - llega.getTime()) / 3600000;
            vsCita =
              dif >= 0
                ? '<span class="sev-good">✓ llega ' +
                  fmtHorasUnidad_(dif) +
                  " antes de la cita</span>"
                : '<span class="sev-warn">✗ llega ' +
                  fmtHorasUnidad_(-dif) +
                  " después de la cita (" +
                  esc(fmtDateTime(cita)) +
                  ")</span>";
          }
          var pintar = function (lugar) {
            out = document.getElementById("falta-resultado") || out;
            faltaUltimo_ = {
              load: load,
              texto:
                "Ubicación: " +
                (lugar ? "cerca de " + lugar + " " : "") +
                "(" +
                coordsTxt_(c) +
                "). Faltan " +
                Math.round(x.millas) +
                " mi a " +
                destino +
                "; llega aprox. " +
                fmtDateTime(llega) +
                " (millas ÷ " +
                VELOCIDAD_UNIDAD_MPH +
                ").",
            };
            out.innerHTML =
              "<div><b>Faltan " +
              Math.round(x.millas) +
              " mi</b> a " +
              esc(destino) +
              ' <small class="hm-soft">(' +
              esc(etiquetaFuente_(x.fuente)) +
              ")</small></div>" +
              "<div>🚛 Llega en ~<b>" +
              fmtHorasUnidad_(h) +
              "</b> · " +
              esc(fmtDateTime(llega)) +
              "</div>" +
              (lugar
                ? '<div class="hm-soft">La unidad está cerca de ' +
                  esc(lugar) +
                  "</div>"
                : "") +
              (vsCita ? "<div>" + vsCita + "</div>" : "") +
              '<div class="tracking-actions"><button class="ws-btn" data-falta-copiar>Copiar</button><button class="ws-btn" data-falta-comentario>Guardar como comentario</button></div>';
            faltaEstado_ = {
              load: load,
              coords: coordsTxt_(c),
              html: out.innerHTML,
            };
          };
          pintar("");
          radarReversa_(c).then(function (lugar) {
            guardarPunto_(c, lugar);
            if (lugar && String(workspaceCurrentLoad) === String(load))
              pintar(lugar);
          });
        })
        .catch(function (err) {
          out.innerHTML =
            '<span class="sev-warn">' +
            esc(err && err.message ? err.message : String(err)) +
            "</span>";
        });
    };
    if (!myRealIdentity || !myPassword) {
      ensureLoggedIn(hacer);
      return;
    }
    hacer();
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-falta-calcular]")) {
      faltaCalcular_(workspaceCurrentLoad);
      return;
    }
    if (e.target.closest("[data-falta-copiar]") && faltaUltimo_) {
      copyTextGeneric(faltaUltimo_.texto, "Copiado");
      return;
    }
    var b = e.target.closest("[data-falta-comentario]");
    if (b && faltaUltimo_) {
      b.disabled = true;
      var f = faltaUltimo_;
      guardarConVerificacion_(
        function () {
          showToast("Comentario guardado en el Carga " + f.load, "good");
          loadUltimosComentarios();
        },
        function (err) {
          b.disabled = false;
          showToast("No se pudo guardar: " + err.message, "error");
        },
      ).addComment(f.load, f.texto, myRealIdentity, myPassword);
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target && e.target.id === "falta-coords") {
      e.preventDefault();
      faltaCalcular_(workspaceCurrentLoad);
    }
  });

  // Copiar / abrir el mensaje para cliente en la app del canal elegido (ver workspaceCommunicationHtml).
  // WhatsApp abre wa.me sin número (WhatsApp pide elegir el chat); Email abre el cliente de correo con
  // asunto y cuerpo ya llenos. Ninguno de los dos registra nada — eso sigue siendo "Registrar como enviado".
  document.addEventListener("click", function (e) {
    var msgEl = document.getElementById("comm-message");
    if (e.target.closest("[data-comm-copy]")) {
      if (msgEl && msgEl.value.trim())
        copyTextGeneric(msgEl.value, "Mensaje copiado");
      return;
    }
    if (e.target.closest("[data-comm-open]")) {
      if (!msgEl || !msgEl.value.trim()) return;
      var canal =
        (document.getElementById("comm-channel") || {}).value || "WhatsApp";
      var url =
        canal === "Email"
          ? "mailto:?subject=" +
            encodeURIComponent(
              "Actualización Carga " + (workspaceCurrentLoad || ""),
            ) +
            "&body=" +
            encodeURIComponent(msgEl.value)
          : "https://wa.me/?text=" + encodeURIComponent(msgEl.value);
      window.open(url, "_blank", "noopener");
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id !== "comm-channel") return;
    var b = document.querySelector("[data-comm-open]");
    if (b)
      b.textContent =
        e.target.value === "Email" ? "Abrir en correo" : "Abrir en WhatsApp";
  });
  function workspaceCommunicationHtml(r) {
    var st = r.client_notify_pending
      ? '<div class="client-notify-bar"><div class="client-notify-main"><div class="client-notify-title">⚠ Cliente pendiente de notificar</div><div class="client-notify-reason">' +
        notifyReasonRows(r.client_notify_reason) +
        "</div></div></div>"
      : '<div class="action-empty">✓ No hay comunicación pendiente.</div>';
    return (
      '<h3 class="ws-section-title">Estado de comunicación</h3>' +
      st +
      '<p class="tracking-note">Prepara el mensaje, cópialo o ábrelo en WhatsApp. Después de enviarlo, pulsa «Registrar como enviado».</p>' +
      '<div class="comm-composer"><div class="comm-composer-head"><b style="font-size:.76rem">Generar actualización para cliente</b><div class="comm-type-row">' +
      Object.keys(getCommTemplates())
        .map(function (k, i) {
          return (
            '<button class="comm-type ' +
            (i === 0 ? "active" : "") +
            '" data-comm-type="' +
            esc(k) +
            '">' +
            esc(commTemplateLabel(k)) +
            "</button>"
          );
        })
        .join("") +
      '<button type="button" class="comm-type-new" data-template-quick-add>+ Nueva plantilla</button>' +
      '</div></div><textarea class="comm-textarea" id="comm-message" aria-label="Mensaje para cliente"></textarea>' +
      (r.tracking_link
        ? '<label class="comm-track-check"><input type="checkbox" id="comm-include-tracking" checked> Incluir link de seguimiento Samsara en el mensaje</label>'
        : "") +
      '<div class="comm-controls"><select class="comm-channel" id="comm-channel"><option>Email</option><option selected>WhatsApp</option></select>' +
      '<button class="ws-btn" type="button" data-comm-copy>Copiar</button>' +
      '<button class="ws-btn" type="button" data-comm-open>Abrir en WhatsApp</button>' +
      '<button class="ws-btn primary" data-comm-sent>Registrar como enviado</button></div>' +
      "</div>" +
      (r.client_notified_at
        ? '<div class="ws-grid">' +
          wsBox("Última notificación", wsDate(r.client_notified_at)) +
          wsBox("Notificado por", r.client_notified_by) +
          "</div>"
        : "") +
      '<div id="comm-action-feedback" class="tracking-note"></div><div class="ws-actions"><button class="ws-btn" data-ws-comments="' +
      esc(r.load) +
      '">Abrir comentarios</button></div>' +
      inlineCommentHtml() +
      templateAdminHtml() +
      '<div class="ws-section-row"><h3 class="ws-section-title">Historial de comunicación</h3><button class="ws-btn" data-export-comm-cliente="' +
      esc(r.customer || "") +
      '" id="export-comm-cliente-btn">Exportar historial del cliente (CSV)</button></div><div id="workspace-comms">Cargando…</div>'
    );
  }

  var DEFAULT_COMM_TEMPLATES = {
    general:
      "Buen día, compartimos actualización del {{load}}. Estatus actual: {{status}}. Ruta: {{route}}. Cita de entrega: {{delivery}}.{{reason}} Quedamos atentos y continuamos monitoreando.",
    delay:
      "Buen día, compartimos actualización del {{load}}. Actualmente presenta un ajuste/retraso en su operación. Estatus actual: {{status}}. Ruta: {{route}}. Cita de entrega: {{delivery}}. Continuamos monitoreando y compartiremos cualquier cambio relevante.",
    crossing:
      "Buen día, compartimos actualización del {{load}}. Estatus actual: {{status}}. {{crossing}}Ruta: {{route}}. Cita de entrega: {{delivery}}. Seguimos monitoreando la operación.",
    delivery:
      "Buen día, compartimos actualización del {{load}}. Estatus actual: {{status}}. Destino: {{destination}}. Cita de entrega: {{delivery}}. {{delivery_actual}}",
  };
  function getCommTemplates() {
    return Object.assign({}, DEFAULT_COMM_TEMPLATES, myTemplates);
  }
  var DEFAULT_COMM_TEMPLATE_NAMES = {
    general: "General",
    delay: "Retraso",
    crossing: "Cruce",
    delivery: "Entrega",
  };
  function getCommTemplateLabels() {
    return Object.assign({}, myTemplateLabels);
  }

  /** Trae del servidor las plantillas guardadas de quien acaba de iniciar sesión. Se llama
   * desde verifyIdentity() (incluida la restauración silenciosa al cargar la página), nunca
   * desde selectWho()/el toggle de "¿Quién eres?" — el Centro de mensajes es de quien redacta
   * (myRealIdentity), no del perfil que esté viendo en ese momento. */
  function loadMisPlantillas() {
    if (PANEL_CONFIG.INTERNAL_ONLY && !PANEL_CONFIG.MANUAL_CLIENT_MESSAGES)
      return;
    if (!myRealIdentity || !myPassword) {
      myTemplates = {};
      myTemplateLabels = {};
      return;
    }
    google.script.run
      .withSuccessHandler(function (res) {
        if (!res || res.ok === false) return; // silencioso: se quedan las 4 plantillas default
        myTemplates = res.templates || {};
        myTemplateLabels = res.labels || {};
        if (workspaceCurrentLoad) renderWorkspace(); // por si el panel de plantillas ya estaba abierto
      })
      .withFailureHandler(function () {
        // silencioso — sin conexión momentánea no debe bloquear el login, solo se quedan los
        // valores que ya hubiera en memoria (o los default si es la primera carga).
      })
      .getMisPlantillas(myRealIdentity, myPassword);
  }

  /** Guarda tus plantillas en el servidor (ligadas a myRealIdentity) y actualiza la copia en
   * memoria de inmediato, para que el panel se sienta instantáneo aunque el guardado en el
   * servidor tarde un poco. */
  function persistMisPlantillas(templatesObj, labelsObj) {
    myTemplates = templatesObj || {};
    myTemplateLabels = labelsObj || {};
    google.script.run
      .withSuccessHandler(function (res) {
        if (!res || res.ok === false)
          showToast(
            (res && res.error) || "No se pudieron sincronizar tus plantillas",
            "error",
          );
      })
      .withFailureHandler(function (err) {
        showToast(
          "No se pudo guardar tus plantillas: " +
            (err && err.message ? err.message : err),
          "error",
        );
      })
      .guardarMisPlantillas(
        myRealIdentity,
        myPassword,
        JSON.stringify(myTemplates),
        JSON.stringify(myTemplateLabels),
      );
  }
  function commTemplateLabel(k) {
    var custom = getCommTemplateLabels();
    if (custom[k]) return custom[k];
    if (DEFAULT_COMM_TEMPLATE_NAMES[k]) return DEFAULT_COMM_TEMPLATE_NAMES[k];
    return String(k || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }
  var COMM_TEMPLATE_VARS = [
    { key: "load", label: "Load" },
    { key: "work_order", label: "Work order" },
    { key: "status", label: "Estatus" },
    { key: "route", label: "Ruta" },
    { key: "delivery", label: "Entrega (cita)" },
    { key: "delivery_actual", label: "Entrega (real)" },
    { key: "reason", label: "Motivo" },
    { key: "crossing", label: "Cruce aduana" },
    { key: "destination", label: "Destino" },
    { key: "truck", label: "Unidad" },
    { key: "trailer", label: "Trailer" },
    { key: "tracking", label: "Tracking" },
    { key: "customer", label: "Cliente" },
  ];
  function templateVarSelectHtml() {
    return (
      '<select class="var-select" data-insert-var-select><option value="">+ Insertar variable…</option>' +
      COMM_TEMPLATE_VARS.map(function (v) {
        return (
          '<option value="' + esc(v.key) + '">' + esc(v.label) + "</option>"
        );
      }).join("") +
      "</select>"
    );
  }
  /** Inserta texto en la posición del cursor de un textarea (o al final si no hay selección),
   * y deja el cursor justo después de lo insertado para poder seguir escribiendo. */
  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    var start =
      textarea.selectionStart != null
        ? textarea.selectionStart
        : textarea.value.length;
    var end =
      textarea.selectionEnd != null
        ? textarea.selectionEnd
        : textarea.value.length;
    textarea.value =
      textarea.value.slice(0, start) + text + textarea.value.slice(end);
    var pos = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }
  function templateAdminHtml() {
    var t = getCommTemplates();
    return (
      '<div class="inline-panel template-admin" id="template-admin" hidden><h3 class="ws-section-title">Centro de mensajes · Plantillas</h3><div class="tracking-note">Las plantillas originales se conservan. Puedes renombrarlas y personalizar el mensaje — se guardan ligadas a tu usuario, no a esta computadora. Usa el menú de variables para insertar datos del load sin tener que escribirlos a mano.</div>' +
      Object.keys(t)
        .map(function (k) {
          return (
            '<div class="template-row" id="template-row-' +
            esc(k) +
            '">' +
            '<div class="template-row-top"><input data-template-label="' +
            esc(k) +
            '" value="' +
            esc(commTemplateLabel(k)) +
            '" placeholder="Nombre visible"></div>' +
            '<textarea data-template-body="' +
            esc(k) +
            '">' +
            esc(t[k]) +
            "</textarea>" +
            '<div class="template-row-actions">' +
            templateVarSelectHtml() +
            '<button class="ws-btn" data-template-reset="' +
            esc(k) +
            '">' +
            (DEFAULT_COMM_TEMPLATES[k] ? "Restaurar" : "Eliminar") +
            "</button></div>" +
            "</div>"
          );
        })
        .join("") +
      '<div class="template-row" id="template-row-new"><div class="template-row-top"><input id="new-template-name" placeholder="Nombre de la nueva plantilla"></div><textarea id="new-template-body" placeholder="Usa el menú de variables de abajo, o escribe el mensaje aquí…"></textarea><div class="template-row-actions">' +
      templateVarSelectHtml() +
      '<button class="ws-btn primary" data-template-add>Agregar</button></div></div>' +
      '<div class="ws-actions"><button class="ws-btn primary" data-template-save>Guardar plantillas</button><button class="ws-btn" data-inline-close="template-admin">Cerrar</button></div></div>'
    );
  }
  function applyCommTemplate(r, type, includeTracking) {
    var t = getCommTemplates()[type] || DEFAULT_COMM_TEMPLATES.general,
      delivery = r.delivery_appt
        ? wsDate(r.delivery_appt)
        : "pendiente por confirmar";
    var vals = {
      load: "Carga " + r.load,
      work_order: r.work_order || "—",
      status: r.status || "Sin estatus",
      route:
        titleCity(r.origin_city) +
        (r.origin_state ? ", " + String(r.origin_state).toUpperCase() : "") +
        " → " +
        titleCity(r.dest_city) +
        (r.dest_state ? ", " + String(r.dest_state).toUpperCase() : ""),
      delivery: delivery,
      reason: r.client_notify_reason
        ? " Motivo de actualización: " + r.client_notify_reason + "."
        : "",
      crossing: r.cruce_usa_fecha
        ? "Cruce a USA registrado: " + wsDate(r.cruce_usa_fecha) + ". "
        : "",
      destination:
        titleCity(r.dest_city) +
        (r.dest_state ? ", " + String(r.dest_state).toUpperCase() : ""),
      delivery_actual: r.delivery_actual
        ? "Entrega registrada: " + wsDate(r.delivery_actual) + "."
        : "Seguimos atentos al cumplimiento de la entrega.",
      truck: r.truck || "",
      trailer: r.trailer || "",
      tracking: r.tracking_link || "",
      customer: r.customer || "",
    };
    Object.keys(vals).forEach(function (k) {
      t = t.split("{{" + k + "}}").join(vals[k]);
    });
    if (includeTracking && r.tracking_link && t.indexOf(r.tracking_link) === -1)
      t += "\\n\\nSeguimiento de la unidad: " + r.tracking_link;
    return t;
  }

  function communicationMessage(r, type, includeTracking) {
    return applyCommTemplate(r, type, includeTracking);
  }

  function docDisplay(v) {
    if (
      v === true ||
      String(v).toLowerCase() === "true" ||
      String(v).toLowerCase() === "listo" ||
      String(v).toLowerCase() === "si" ||
      String(v).toLowerCase() === "sí"
    )
      return '<span class="bool-badge ready">✓ LISTO</span>';
    if (
      v === false ||
      String(v).toLowerCase() === "false" ||
      String(v).toLowerCase() === "pendiente"
    )
      return '<span class="bool-badge pending">● PENDIENTE</span>';
    if (v === null || v === undefined || String(v).trim() === "")
      return '<span class="bool-badge unknown">— SIN INFORMACIÓN</span>';
    return (
      '<span class="bool-badge info">' +
      esc(String(v)).toUpperCase() +
      "</span>"
    );
  }
  function workspaceDocumentsHtml(r) {
    var d = [
      ["BOL", r.bol],
      ["Documentación", r.doc_status],
      ["DODA", r.doda],
      ["Entry", r.entry],
      ["Regresos", r.regresos],
      ["Sobre listo", r.sobre_listo],
      ["POD enviado", r.pod_sent],
    ];
    return (
      '<h3 class="ws-section-title">Documentos y cumplimiento</h3><div class="ws-doc-list">' +
      d
        .map(function (x) {
          return (
            '<div class="ws-doc"><span class="ws-doc-name">' +
            esc(x[0]) +
            '</span><span class="ws-doc-value">' +
            docDisplay(x[1]) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  function workspaceIncidenciasHtml(r) {
    return (
      '<h3 class="ws-section-title">Incidencias</h3><div class="ws-grid">' +
      wsBox("Incidencias abiertas", Number(r.incidenciasCount) || 0) +
      wsBox("Estatus", r.status) +
      '</div><div class="ws-actions"><button class="ws-btn primary" data-ws-incidencia="' +
      esc(r.load) +
      '">Ver / registrar incidencia</button></div>'
    );
  }
  function dayGroupLabel_(dt) {
    var months = [
      "ene",
      "feb",
      "mar",
      "abr",
      "may",
      "jun",
      "jul",
      "ago",
      "sep",
      "oct",
      "nov",
      "dic",
    ];
    var now = new Date();
    var startOfDay = function (d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    var diffDays = Math.round((startOfDay(now) - startOfDay(dt)) / 86400000);
    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    return (
      dt.getDate() +
      " " +
      months[dt.getMonth()] +
      (dt.getFullYear() !== now.getFullYear() ? " " + dt.getFullYear() : "")
    );
  }
  function fmtTimeOnly_(v) {
    if (!v) return "";
    var dt = v instanceof Date ? v : new Date(v);
    if (isNaN(dt.getTime())) return "";
    var pad2 = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return pad2(dt.getHours()) + ":" + pad2(dt.getMinutes());
  }
  // items ya llegan ordenados del más reciente al más antiguo (ver getHistorialLoad/
  // getComunicaciones en Code.gs) — aquí solo se van intercalando los encabezados de día.
  function groupedTimelineHtml_(items, entryHtmlFn) {
    var html = "",
      lastLabel = null;
    items.forEach(function (x) {
      var dt = new Date(x.timestamp);
      var label = isNaN(dt.getTime()) ? "" : dayGroupLabel_(dt);
      if (label !== lastLabel) {
        html += '<div class="ws-day-group-label">' + esc(label) + "</div>";
        lastLabel = label;
      }
      html += entryHtmlFn(x, dt);
    });
    return html;
  }
  function workspaceHistoryHtml(r) {
    if (PANEL_CONFIG.INTERNAL_ONLY && !PANEL_CONFIG.MANUAL_CLIENT_MESSAGES)
      workspaceHistorialSubTab = "cambios";
    return (
      '<h3 class="ws-section-title">Trazabilidad operativa</h3><div class="ws-timeline"><div class="ws-event"><div class="ws-event-type">Última actualización</div><div class="ws-event-meta">' +
      esc(wsDate(r.updated_at)) +
      (r.updated_by ? " · " + esc(r.updated_by) : "") +
      "</div></div>" +
      (r.created_at
        ? '<div class="ws-event"><div class="ws-event-type">Carga creada / importada</div><div class="ws-event-meta">' +
          esc(wsDate(r.created_at)) +
          "</div></div>"
        : "") +
      "</div>" +
      '<div class="ws-subtabs"><button type="button" class="ws-subtab-btn' +
      (workspaceHistorialSubTab === "cambios" ? " active" : "") +
      '" data-historial-subtab="cambios">Cambios</button><button type="button" class="ws-subtab-btn' +
      (workspaceHistorialSubTab === "comunicacion" ? " active" : "") +
      '" data-historial-subtab="comunicacion"' +
      (PANEL_CONFIG.INTERNAL_ONLY && !PANEL_CONFIG.MANUAL_CLIENT_MESSAGES
        ? " hidden inert"
        : "") +
      ">Comunicación</button></div>" +
      (workspaceHistorialSubTab === "comunicacion"
        ? '<div id="workspace-comms">Cargando…</div>'
        : '<div id="workspace-historial-cambios">Cargando…</div>')
    );
  }
  function renderWorkspaceComms(res) {
    var e = document.getElementById("workspace-comms");
    if (!e) return;
    var a = Array.isArray(res)
      ? res
      : res && Array.isArray(res.items)
        ? res.items
        : [];
    if (res && res.ok === false) {
      e.innerHTML =
        '<div class="action-empty comm-history-error">⚠ ' +
        esc(res.error || "No se pudo cargar el historial de comunicación.") +
        "</div>";
      return;
    }
    if (!a.length) {
      e.innerHTML =
        '<div class="action-empty" style="color:var(--ink-soft)">— Aún no hay comunicaciones registradas para este Load.</div>';
      return;
    }
    e.innerHTML =
      '<div class="ws-timeline comm-history-list">' +
      groupedTimelineHtml_(a, function (x, dt) {
        /* Ahora "mensaje" trae solo el tipo de aviso (Retraso, Cruce…); los registros viejos traen el texto completo y se dejan plegados. */ var m =
            String(x.mensaje || ""),
          corto = m && m.length <= 80 && m.indexOf("\n") === -1;
        return (
          '<div class="ws-event comm-history-event"><div class="comm-history-head"><span class="comm-history-type">' +
          esc(x.tipo || "EVENTO") +
          "</span>" +
          (x.canal
            ? '<span class="comm-history-channel">' + esc(x.canal) + "</span>"
            : "") +
          (corto
            ? '<span class="comm-history-channel comm-history-aviso">' +
              esc(m) +
              "</span>"
            : "") +
          '</div><div class="ws-event-meta">' +
          esc(fmtTimeOnly_(dt)) +
          (x.usuario ? " · " + esc(x.usuario) : "") +
          "</div>" +
          (x.motivo
            ? '<div class="ws-event-reason">' + esc(x.motivo) + "</div>"
            : "") +
          (m && !corto
            ? '<details class="comm-history-old"><summary>Ver mensaje (registro anterior)</summary><div class="comm-history-message">' +
              esc(m) +
              "</div></details>"
            : "") +
          "</div>"
        );
      }) +
      "</div>";
  }
  function loadWorkspaceComms(load) {
    var e = document.getElementById("workspace-comms");
    if (e)
      e.innerHTML =
        '<div class="action-empty" style="color:var(--ink-soft)">Cargando historial…</div>';
    if (!myRealIdentity || !myPassword) {
      renderWorkspaceComms({
        ok: false,
        error: "Verifica tu identidad para consultar el historial.",
        items: [],
      });
      return;
    }
    google.script.run
      .withSuccessHandler(function (res) {
        renderWorkspaceComms(res);
      })
      .withFailureHandler(function (err) {
        renderWorkspaceComms({
          ok: false,
          error:
            "No se pudo cargar el historial: " +
            (err && err.message ? err.message : err),
          items: [],
        });
      })
      .getComunicaciones(load, myRealIdentity, myPassword);
  }
  function renderWorkspaceHistorialCambios(res) {
    var e = document.getElementById("workspace-historial-cambios");
    if (!e) return;
    var a = Array.isArray(res)
      ? res
      : res && Array.isArray(res.items)
        ? res.items
        : [];
    if (res && res.ok === false) {
      e.innerHTML =
        '<div class="action-empty comm-history-error">⚠ ' +
        esc(res.error || "No se pudo cargar el historial de cambios.") +
        "</div>";
      return;
    }
    if (!a.length) {
      e.innerHTML =
        '<div class="action-empty" style="color:var(--ink-soft)">— Sin cambios registrados todavía.</div>';
      return;
    }
    e.innerHTML =
      '<div class="ws-timeline comm-history-list">' +
      groupedTimelineHtml_(a, function (x, dt) {
        var change = window.panelHistory.presentHistoryChange(x, fmtDateTime);
        return (
          '<div class="ws-event comm-history-event"><div class="comm-history-head"><span class="comm-history-type">' +
          esc(change.label) +
          '</span></div><div class="ws-event-meta">' +
          esc(fmtTimeOnly_(dt)) +
          (x.usuario ? " · " + esc(x.usuario) : "") +
          '</div><dl class="history-change-values"><div><dt>Antes</dt><dd>' +
          esc(change.before) +
          "</dd></div><div><dt>Ahora</dt><dd>" +
          esc(change.after) +
          "</dd></div></dl></div>"
        );
      }) +
      "</div>";
  }
  function loadWorkspaceHistorialCambios(load, offset) {
    var e = document.getElementById("workspace-historial-cambios");
    if (e && !offset)
      e.innerHTML = '<div class="action-empty">Cargando cambios…</div>';
    if (!myRealIdentity || !myPassword) {
      renderWorkspaceHistorialCambios({
        ok: false,
        error: "Verifica tu identidad para consultar el historial.",
        items: [],
      });
      return;
    }
    google.script.run
      .withSuccessHandler(function (res) {
        if (workspaceCurrentLoad !== load) return;
        var old = offset && e ? e.innerHTML : "";
        renderWorkspaceHistorialCambios(res);
        if (offset && e) {
          var older = document.createElement("div");
          older.innerHTML = e.innerHTML;
          e.innerHTML = old;
          e.querySelectorAll("[data-history-more]").forEach(function (b) {
            b.remove();
          });
          e.append(older);
        }
        if (res && res.nextOffset != null && e) {
          var more = document.createElement("button");
          more.type = "button";
          more.className = "ws-btn";
          more.dataset.historyMore = "";
          more.textContent = "Ver cambios anteriores";
          more.onclick = function () {
            this.disabled = true;
            loadWorkspaceHistorialCambios(load, res.nextOffset);
          };
          e.append(more);
        }
      })
      .withFailureHandler(function (err) {
        renderWorkspaceHistorialCambios({
          ok: false,
          error:
            "No se pudo cargar el historial: " +
            (err && err.message ? err.message : err),
          items: [],
        });
      })
      .getHistorialLoad(load, myRealIdentity, myPassword, offset || 0);
  }

  function csvEscape_(v) {
    return window.panelContent.csvCell(v);
  }
  function buildComunicacionesCsv_(cliente, items) {
    var header = [
      "Load",
      "Fecha",
      "Tipo",
      "Motivo",
      "Usuario",
      "Canal",
      "Aviso",
    ];
    var rows = [header].concat(
      items.map(function (it) {
        return [
          it.load,
          it.timestamp ? fmtDateTime(it.timestamp) : "",
          it.tipo,
          it.motivo,
          it.usuario,
          it.canal,
          it.mensaje,
        ];
      }),
    );
    return (
      "﻿" +
      rows
        .map(function (r) {
          return r.map(csvEscape_).join(",");
        })
        .join("\r\n")
    );
  }
  function downloadTextFile_(filename, content, mime) {
    var blob = new Blob([content], {
      type: (mime || "text/plain") + ";charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }
  function buildReporteOperacionCsv_() {
    var lines = [];
    function addSection(title) {
      if (lines.length) lines.push("");
      lines.push(csvEscape_(title));
    }
    function addRow(arr) {
      lines.push(arr.map(csvEscape_).join(","));
    }

    var all = currentData || [];
    var active = all.filter(function (r) {
      return !isArchived(r) && !isCanceladaFinalizada(r);
    });
    var attentionCount = active.filter(needsAttention).length;
    var docsReadyCount = active.filter(function (r) {
      return r.bol && r.doda && r.entry && r.sobre_listo;
    }).length;
    var recordatorioVencidoCount = all.filter(isRecordatorioVencido).length;

    addSection("RESUMEN OPERATIVO — " + fmtDateTime(new Date().toISOString()));
    addRow(["Cargas totales", all.length]);
    addRow(["En curso", active.length]);
    addRow(["Necesitan atención", attentionCount]);
    addRow(["Docs completos", docsReadyCount + "/" + active.length]);
    addRow(["Recordatorios vencidos", recordatorioVencidoCount]);

    addSection("CARGA DE TRABAJO POR CSR");
    addRow(["CSR", "Cargas activas", "Necesitan atención"]);
    (personas || [])
      .filter(function (p) {
        return esCsrOperativo_(p);
      })
      .forEach(function (p) {
        var cargas = loadsOfCsr(p.nombre);
        addRow([p.nombre, cargas.length, cargas.filter(needsAttention).length]);
      });

    addSection(
      "TIEMPO DE RESPUESTA AL CLIENTE (SLA, últimos " +
        SLA_LOOKBACK_DAYS +
        " días)",
    );
    if (lastSlaPairs.length) {
      var avgMin =
        lastSlaPairs.reduce(function (s, p) {
          return s + p.minutes;
        }, 0) / lastSlaPairs.length;
      addRow(["Promedio", fmtMinutesSla(avgMin)]);
      addRow(["Avisos medidos", lastSlaPairs.length]);
    } else {
      addRow(["Sin comunicaciones registradas en el periodo."]);
    }

    addSection("DETALLE DE CARGAS ACTIVAS");
    addRow([
      "Load",
      "Cliente",
      "Estatus",
      "Cita de recolección",
      "Entrega cita",
      "Salida planta",
      "Cruce aduana",
      "Incidencias",
      "Recordatorio vencido",
      "Última actualización",
    ]);
    active.forEach(function (r) {
      addRow([
        r.load,
        r.customer || "",
        r.status || "",
        r.pickup_appt ? fmtDateTime(r.pickup_appt) : "",
        r.delivery_appt ? fmtDateTime(r.delivery_appt) : "",
        r.salida_mexico_fecha ? fmtDateTime(r.salida_mexico_fecha) : "",
        r.cruce_usa_fecha ? fmtDateTime(r.cruce_usa_fecha) : "",
        Number(r.incidenciasCount) || 0,
        isRecordatorioVencido(r) ? "Sí" : "No",
        r.updated_at ? fmtDateTime(r.updated_at) : "",
      ]);
    });

    return "﻿" + lines.join("\r\n");
  }
  function exportReporteOperacion(btn) {
    var original = btn ? btn.textContent : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generando…";
    }
    try {
      var fecha = new Date().toISOString().slice(0, 10);
      downloadTextFile_(
        "reporte_operacion_" + fecha + ".csv",
        buildReporteOperacionCsv_(),
        "text/csv",
      );
      showToast("Reporte de la operación exportado", "good");
    } catch (err) {
      showToast(
        "No se pudo generar el reporte: " +
          (err && err.message ? err.message : err),
        "error",
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
  }

  function exportComunicacionesCliente(cliente, btn) {
    cliente = String(cliente || "").trim();
    if (!cliente) {
      showToast("Esta carga no tiene cliente asignado.", "error");
      return;
    }
    ensureLoggedIn(function () {
      var original = btn ? btn.textContent : null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Exportando…";
      }
      google.script.run
        .withSuccessHandler(function (res) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = original;
          }
          if (!res || res.ok === false) {
            showToast(
              (res && res.error) || "No se pudo exportar el historial",
              "error",
            );
            return;
          }
          if (!res.items.length) {
            showToast("Sin comunicaciones registradas para " + cliente);
            return;
          }
          var fecha = new Date().toISOString().slice(0, 10);
          var safeName = cliente.replace(/[^a-z0-9áéíóúñ]+/gi, "_");
          downloadTextFile_(
            "comunicaciones_" + safeName + "_" + fecha + ".csv",
            buildComunicacionesCsv_(cliente, res.items),
            "text/csv",
          );
          showToast(
            "Historial de " +
              cliente +
              " exportado (" +
              res.items.length +
              " registros)",
            "good",
          );
        })
        .withFailureHandler(function (err) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = original;
          }
          showToast(
            "No se pudo exportar: " + (err && err.message ? err.message : err),
            "error",
          );
        })
        .getComunicacionesPorCliente(cliente, myRealIdentity, myPassword);
    });
  }
  function renderWorkspace() {
    var r = workspaceRec();
    if (!r) return;
    document.querySelectorAll(".workspace-tab").forEach(function (b) {
      b.classList.toggle(
        "active",
        b.getAttribute("data-workspace-tab") === workspaceCurrentTab,
      );
    });
    var wf = document.getElementById("workspace-follow");
    if (wf) wf.innerHTML = workspaceFollowHtml(r);
    var b = document.getElementById("workspace-body");
    if (
      PANEL_CONFIG.INTERNAL_ONLY &&
      !PANEL_CONFIG.MANUAL_CLIENT_MESSAGES &&
      workspaceCurrentTab === "comunicacion"
    )
      workspaceCurrentTab = "operacion";
    if (workspaceCurrentTab === "tracking")
      b.innerHTML = workspaceTrackingHtml(r);
    else if (workspaceCurrentTab === "comunicacion")
      b.innerHTML = workspaceCommunicationHtml(r);
    else if (workspaceCurrentTab === "documentos")
      b.innerHTML = workspaceDocumentsHtml(r);
    else if (workspaceCurrentTab === "incidencias")
      b.innerHTML = workspaceIncidenciasHtml(r);
    else if (workspaceCurrentTab === "historial")
      b.innerHTML = workspaceHistoryHtml(r);
    else b.innerHTML = workspaceOperationHtml(r);
    if (workspaceCurrentTab === "comunicacion") loadWorkspaceComms(r.load);
    if (workspaceCurrentTab === "historial") {
      if (workspaceHistorialSubTab === "comunicacion")
        loadWorkspaceComms(r.load);
      else loadWorkspaceHistorialCambios(r.load);
    }
    if (workspaceCurrentTab === "comunicacion") {
      var ta = document.getElementById("comm-message");
      if (ta) ta.value = communicationMessage(r, "general", !!r.tracking_link);
    }
  }

  /** Cada acceso lateral tiene su propio contenido; la pestaña del turno conserva el resumen. */
  function setTurnoSection_(section) {
    var solicitudes = section === "group-pendientes";
    var tareas = section === "group-bitacora";
    document.getElementById("group-pendientes").hidden = tareas;
    document.getElementById("group-bitacora-asignados").hidden = solicitudes;
    document.getElementById("group-bitacora").hidden = solicitudes;
    document.getElementById("shift-brief").hidden = solicitudes || tareas;
    document.getElementById("turno-section-title").textContent = solicitudes
      ? "Solicitudes sin carga confirmada"
      : tareas
        ? "Tareas de turno"
        : "Solicitudes y tareas del turno";
    document.getElementById("turno-section-help").textContent = solicitudes
      ? "Registra solicitudes y vincúlalas a una carga activa cuando el cliente confirme."
      : tareas
        ? "Consulta lo que te asignaron o crea una tarea para alguien del panel."
        : "Una solicitud todavía no tiene número de carga. Una tarea es trabajo que alguien debe completar.";
    if (solicitudes) setPendientesCollapsed(false);
    if (tareas) {
      setBitacoraAsignadosCollapsed(false);
      setBitacoraCollapsed(false);
    }
  }

  function marcarNavegacion_(page, scrollId) {
    document
      .querySelectorAll(
        ".sidebar-btn[data-page], .sidebar-btn[data-page-scroll]",
      )
      .forEach(function (b) {
        var active = scrollId
          ? b.getAttribute("data-page-scroll") === page + ":" + scrollId
          : b.getAttribute("data-page") === page;
        b.classList.toggle("active", active);
        if (active) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
  }

  function setHomeTab(tab, section) {
    var ahora = document.getElementById("home-tab-ahora"),
      turno = document.getElementById("home-tab-turno");
    if (ahora) ahora.hidden = tab !== "ahora";
    if (turno) turno.hidden = tab !== "turno";
    setTurnoSection_(tab === "turno" ? section : "");
    marcarNavegacion_("home", section);
    document.querySelectorAll(".home-tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-home-tab") === tab);
    });
  }
  document.querySelectorAll(".home-tab-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      setHomeTab(b.getAttribute("data-home-tab"));
    });
  });

  function showMainPage(page, scrollId) {
    [
      "home",
      "operation",
      "historico",
      "calendario",
      "indicadores",
      "apartados",
      "radar",
    ].forEach(function (p) {
      var el = document.getElementById("page-" + p);
      if (el) el.hidden = page !== p;
    });
    if (page === "calendario") renderCalendario_();
    if (page === "apartados") renderApartados_();
    if (page === "radar") radarAlAbrir_();
    if (page === "indicadores") renderIndicadores_();
    marcarNavegacion_(page, scrollId);
    document
      .querySelectorAll("#barra-movil [data-movil]")
      .forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-movil") === page);
      });
    document.getElementById("sidebar").classList.remove("abierta-movil");
    // Operación completa SIEMPRE se reconstruye desde currentData al abrirla. Inicio puede
    // clasificar/ocultar cargas por reglas operativas, pero nunca debe vaciar esta vista maestra.
    if (page === "operation") {
      viewDirty.cards = true;
      viewDirty.table = true;
      if (currentView === "table") buildTableView();
      else buildCardsView();
      wireCardEvents();
      applyFilters();
    }
    if (page === "home") {
      if (scrollId === "group-pendientes" || scrollId === "group-bitacora")
        setHomeTab("turno", scrollId);
      else if (!scrollId) setHomeTab("ahora");
    }
    if (scrollId)
      setTimeout(function () {
        var target =
          scrollId === "group-bitacora" ? "group-bitacora-asignados" : scrollId;
        var el = document.getElementById(target);
        if (el) {
          var toggle = el.querySelector(".group-toggle");
          if (toggle) toggle.focus({ preventScroll: true });
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 30);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // Cargas conserva la vista personal seleccionada; el inicio se carga desde la cuenta.
  document.querySelectorAll(".sidebar-btn[data-page]").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = b.getAttribute("data-page");
      showMainPage(p);
    });
  });
  document
    .querySelectorAll(".sidebar-btn[data-page-scroll]")
    .forEach(function (b) {
      b.addEventListener("click", function () {
        var x = (b.getAttribute("data-page-scroll") || "").split(":");
        showMainPage(x[0] || "home", x[1] || "");
      });
    });
  // Barra inferior en celular: Inicio, Operación, Avisos, Radar y "Más" (abre la barra lateral completa).
  document
    .getElementById("barra-movil")
    .addEventListener("click", function (e) {
      var b = e.target.closest("[data-movil]");
      if (!b) return;
      var a = b.getAttribute("data-movil"),
        side = document.getElementById("sidebar");
      e.stopPropagation(); // para que el clic no cierre en ese mismo momento el panel de avisos o la barra
      if (a === "mas") {
        side.classList.toggle("abierta-movil");
        return;
      }
      side.classList.remove("abierta-movil");
      if (a === "avisos") {
        if (!myRealIdentity) {
          openIdentityModal();
          return;
        }
        abrirAvisos_(document.getElementById("avisos-panel").hidden);
        return;
      }
      showMainPage(a);
    });
  document.addEventListener("click", function (e) {
    var side = document.getElementById("sidebar");
    if (
      side.classList.contains("abierta-movil") &&
      (!e.target.closest("#sidebar") || e.target.closest(".sidebar-btn"))
    )
      side.classList.remove("abierta-movil");
  });
  var homeSearch = document.getElementById("home-search");
  var homeCommand = document.getElementById("home-command");
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-home-open]");
    if (b) {
      openLoadWorkspace(b.getAttribute("data-home-open"), "operacion");
      return;
    }
    b = e.target.closest("[data-home-comm]");
    if (b) {
      openLoadWorkspace(b.getAttribute("data-home-comm"), "comunicacion");
      return;
    }
  });
  document
    .getElementById("workspace-body")
    .addEventListener("change", function (e) {
      if (e.target && e.target.id === "comm-include-tracking") {
        var r = workspaceRec(),
          active = document.querySelector(".comm-type.active"),
          ta = document.getElementById("comm-message");
        if (r && ta)
          ta.value = communicationMessage(
            r,
            active ? active.getAttribute("data-comm-type") : "general",
            e.target.checked,
          );
      }
      if (
        e.target &&
        e.target.matches &&
        e.target.matches("[data-insert-var-select]")
      ) {
        var sel = e.target,
          val = sel.value;
        if (!val) return;
        var row = sel.closest(".template-row"),
          ta2 = row ? row.querySelector("textarea") : null;
        if (ta2) insertAtCursor(ta2, "{{" + val + "}}");
        sel.value = "";
      }
    });

  document
    .getElementById("workspace-close")
    .addEventListener("click", closeLoadWorkspace);
  document
    .getElementById("workspace-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "workspace-backdrop") closeLoadWorkspace();
    });
  document
    .getElementById("workspace-tabs")
    .addEventListener("click", function (e) {
      var b = e.target.closest("[data-workspace-tab]");
      if (!b) return;
      workspaceCurrentTab = b.getAttribute("data-workspace-tab");
      renderWorkspace();
    });
  document
    .getElementById("workspace-follow")
    .addEventListener("click", function (e) {
      var btn = e.target.closest("[data-toggle-seguir-load]");
      if (!btn) return;
      var load = btn.getAttribute("data-toggle-seguir-load");
      ensureLoggedIn(function () {
        var yaSeguido = loadSeguidoPorCsr(load, myRealIdentity);
        var fn = yaSeguido ? "dejarSeguirLoad" : "seguirLoad";
        btn.disabled = true;
        google.script.run
          .withSuccessHandler(function (res) {
            btn.disabled = false;
            if (!res || res.ok === false) {
              showToast((res && res.error) || "No se pudo actualizar", "error");
              return;
            }
            if (yaSeguido) {
              loadSeguimientos = loadSeguimientos.filter(function (s) {
                return !(
                  String(s.load).trim() === String(load).trim() &&
                  s.csr === myRealIdentity
                );
              });
            } else {
              loadSeguimientos.push({
                load: String(load),
                csr: myRealIdentity,
                creado_en: new Date().toISOString(),
              });
            }
            applyFilters();
            renderWorkspace();
            showToast(
              yaSeguido ? "Ya no sigues este load" : "Ahora sigues este load",
              "good",
            );
          })
          .withFailureHandler(function (err) {
            btn.disabled = false;
            showToast("No se pudo actualizar: " + err.message, "error");
          })
          [fn](load, myRealIdentity, myPassword);
      });
    });
  document
    .getElementById("workspace-body")
    .addEventListener("click", function (e) {
      var b,
        r = workspaceRec();
      if ((b = e.target.closest("[data-historial-subtab]"))) {
        workspaceHistorialSubTab = b.getAttribute("data-historial-subtab");
        renderWorkspace();
        return;
      }
      if (e.target.closest("[data-tracking-save]")) {
        if (!r) return;
        if (!myRealIdentity || !myPassword) {
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var inp = document.getElementById("tracking-link-input"),
          url = inp ? inp.value.trim() : "",
          fb = document.getElementById("tracking-save-feedback");
        if (fb) fb.textContent = "Guardando…";
        if (url && !/^https?:\/\//i.test(url)) {
          if (fb) fb.textContent = "";
          showToast("El link debe iniciar con http:// o https://", "error");
          return;
        }
        google.script.run
          .withSuccessHandler(function (res) {
            if (!res || res.ok === false) {
              showToast((res && res.error) || "No se pudo guardar", "error");
              return;
            }
            r.tracking_link = url;
            render(currentData);
            renderWorkspace();
            showToast(
              url ? "Seguimiento guardado" : "Seguimiento eliminado",
              "good",
            );
          })
          .withFailureHandler(function (err) {
            showToast("No se pudo guardar: " + err.message, "error");
          })
          .saveTrackingLink(r.load, url, myRealIdentity, myPassword);
        return;
      }
      if (e.target.closest("[data-tracking-open]")) {
        if (r && r.tracking_link)
          window.open(
            window.panelContent.safeLink(r.tracking_link),
            "_blank",
            "noopener",
          );
        return;
      }
      if (e.target.closest("[data-tracking-copy]")) {
        if (r && r.tracking_link)
          copyTextGeneric(r.tracking_link, "Link de tracking copiado");
        return;
      }
      if ((b = e.target.closest("[data-review-save]"))) {
        if (!r) return;
        if (!myRealIdentity || !myPassword) {
          showToast(
            "Verifica tu identidad para programar la revisión",
            "error",
          );
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var dt = document.getElementById("next-review-at"),
          nt = document.getElementById("next-review-note"),
          val = dt ? dt.value : "",
          fb = document.getElementById("review-action-feedback");
        if (!val) {
          showToast("Selecciona fecha y hora de revisión", "error");
          if (fb) fb.textContent = "⚠ Falta seleccionar fecha y hora.";
          return;
        }
        b.disabled = true;
        b.textContent = "Guardando…";
        if (fb) fb.textContent = "Guardando próxima revisión…";
        var finished = false;
        var watchdog = setTimeout(function () {
          if (finished) return;
          finished = true;
          b.disabled = false;
          b.textContent = r.next_review_at ? "Reprogramar" : "Programar";
          if (fb)
            fb.textContent =
              "⚠ El servidor tardó demasiado. Verifica la revisión antes de volver a guardar.";
          showToast(
            "La operación tardó demasiado; el botón fue liberado",
            "error",
          );
        }, 12000);
        google.script.run
          .withSuccessHandler(function (res) {
            if (finished) return;
            finished = true;
            clearTimeout(watchdog);
            b.disabled = false;
            if (!res || res.ok === false) {
              b.textContent = r.next_review_at ? "Reprogramar" : "Programar";
              if (fb)
                fb.textContent =
                  "⚠ " + ((res && res.error) || "No se pudo programar");
              showToast((res && res.error) || "No se pudo programar", "error");
              return;
            }
            r.next_review_at = res.next_review_at || val;
            r.next_review_note =
              res.next_review_note !== undefined
                ? res.next_review_note
                : nt
                  ? nt.value.trim()
                  : "";
            r.next_review_by = res.next_review_by || myRealIdentity;
            b.textContent = "✓ Revisión programada";
            if (fb)
              fb.textContent =
                "✓ Va a aparecer en Inicio el " +
                wsDate(r.next_review_at) +
                (r.next_review_note ? " · " + r.next_review_note : "");
            refreshOperationalAttention();
            render(currentData);
            showToast(
              "✓ Te va a aparecer en Inicio el " + wsDate(r.next_review_at),
              "good",
            );
            setTimeout(function () {
              if (workspaceCurrentLoad === String(r.load)) renderWorkspace();
            }, 700);
          })
          .withFailureHandler(function (err) {
            if (finished) return;
            finished = true;
            clearTimeout(watchdog);
            b.disabled = false;
            b.textContent = r.next_review_at ? "Reprogramar" : "Programar";
            if (fb) fb.textContent = "⚠ Error al guardar.";
            showToast(
              "Error: " + (err && err.message ? err.message : err),
              "error",
            );
          })
          .saveNextReview(
            r.load,
            val,
            nt ? nt.value.trim() : "",
            myRealIdentity,
            myPassword,
          );
        return;
      }
      if ((b = e.target.closest("[data-review-clear]"))) {
        if (!r) return;
        if (!myRealIdentity || !myPassword) {
          ensureLoggedIn(function () {
            if (workspaceCurrentLoad === String(r.load)) renderWorkspace();
          });
          return;
        }
        var completeButton = b;
        var saveButton = document.querySelector(
          "#workspace-body [data-review-save]",
        );
        completeButton.disabled = true;
        completeButton.textContent = "Completando…";
        if (saveButton) saveButton.disabled = true;
        function reviewCompleteFailed(message) {
          completeButton.disabled = false;
          completeButton.textContent = "Completar seguimiento";
          if (saveButton) saveButton.disabled = false;
          showToast(message, "error");
        }
        google.script.run
          .withSuccessHandler(function (res) {
            if (!res || res.ok === false) {
              reviewCompleteFailed(
                (res && res.error) || "No se pudo completar el seguimiento",
              );
              return;
            }
            r.next_review_at = "";
            r.next_review_note = "";
            r.next_review_by = "";
            refreshOperationalAttention();
            render(currentData);
            if (workspaceCurrentLoad === String(r.load)) renderWorkspace();
            showToast("Seguimiento completado", "good");
          })
          .withFailureHandler(function (err) {
            reviewCompleteFailed("No se pudo completar: " + err.message);
          })
          .clearNextReview(r.load, myRealIdentity, myPassword);
        return;
      }
      if ((b = e.target.closest("[data-ws-comments]"))) {
        var p = document.getElementById("ws-inline-comment");
        if (!p) {
          showToast("No se pudo abrir comentarios en esta vista", "error");
          return;
        }
        p.hidden = !p.hidden;
        if (!p.hidden) {
          var ta = document.getElementById("ws-inline-comment-text");
          if (ta) ta.focus();
          p.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }
      if ((b = e.target.closest("[data-ws-incidencia]"))) {
        var p = document.getElementById("ws-inline-incident");
        if (p) {
          p.hidden = !p.hidden;
          if (!p.hidden) {
            var ta = document.getElementById("ws-inline-inc-desc");
            if (ta) ta.focus();
          }
        }
        return;
      }
      if ((b = e.target.closest("[data-inline-close]"))) {
        var p = document.getElementById(b.getAttribute("data-inline-close"));
        if (p) p.hidden = true;
        return;
      }
      if (e.target.closest("[data-inline-comment-save]")) {
        if (!r) return;
        if (!myRealIdentity || !myPassword) {
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var ta = document.getElementById("ws-inline-comment-text"),
          txt = ta ? ta.value.trim() : "";
        if (!txt) {
          showToast("Escribe un comentario", "error");
          return;
        }
        google.script.run
          .withSuccessHandler(function (res) {
            if (!res || res.ok === false) {
              showToast((res && res.error) || "No se pudo guardar", "error");
              return;
            }
            showToast("Comentario guardado", "good");
            renderWorkspace();
            aplicarRevision_(r.load, res);
          })
          .withFailureHandler(function (err) {
            showToast("Error: " + err.message, "error");
          })
          .addComment(r.load, txt, myRealIdentity, myPassword);
        return;
      }
      if (e.target.closest("[data-inline-inc-save]")) {
        if (!r) return;
        if (!myRealIdentity || !myPassword) {
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var cat = document.getElementById("ws-inline-inc-category").value,
          sev = document.getElementById("ws-inline-inc-severity").value,
          desc = document.getElementById("ws-inline-inc-desc").value.trim(),
          act = document.getElementById("ws-inline-inc-action").value.trim();
        if (!desc) {
          showToast("Describe la incidencia", "error");
          return;
        }
        google.script.run
          .withSuccessHandler(function (res) {
            if (!res || res.ok === false) {
              showToast((res && res.error) || "No se pudo registrar", "error");
              return;
            }
            r.incidenciasCount = (Number(r.incidenciasCount) || 0) + 1;
            showToast("Incidencia registrada", "good");
            render(currentData);
            renderWorkspace();
          })
          .withFailureHandler(function (err) {
            showToast("Error: " + err.message, "error");
          })
          .addIncidencia(
            r.load,
            cat,
            sev,
            desc,
            act,
            myRealIdentity,
            myPassword,
          );
        return;
      }
      if ((b = e.target.closest("[data-manual-save]"))) {
        if (!r) return;
        var field = b.getAttribute("data-manual-save"),
          inp = document.querySelector(
            '[data-manual-input="' + CSS.escape(String(field)) + '"]',
          ),
          val = inp ? inp.value.trim() : "";
        if (!val) {
          showToast("Escribe el nuevo valor antes de guardar", "error");
          return;
        }
        if (!myRealIdentity || !myPassword) {
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var runner = google.script.run
          .withSuccessHandler(function (res) {
            if (!res || res.ok === false) {
              showToast((res && res.error) || "No se pudo guardar", "error");
              return;
            }
            r[field] = val;
            r[field + "_source"] = "MANUAL";
            r[field + "_manual_by"] = myRealIdentity;
            r[field + "_manual_at"] = new Date().toISOString();
            render(currentData);
            renderWorkspace();
            showToast(
              (field === "truck" ? "Unidad" : "Trailer") +
                " guardado como dato manual",
              "good",
            );
          })
          .withFailureHandler(function (err) {
            showToast("Error: " + err.message, "error");
          });
        if (field === "truck")
          runner.saveTruck(r.load, val, myRealIdentity, myPassword);
        else runner.saveTrailer(r.load, val, myRealIdentity, myPassword);
        return;
      }
      if (e.target.closest("[data-template-admin]")) {
        var p = document.getElementById("template-admin");
        if (!p) {
          showToast("No se pudo abrir el administrador de plantillas", "error");
          return;
        }
        p.hidden = !p.hidden;
        if (!p.hidden)
          p.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      if (e.target.closest("[data-template-quick-add]")) {
        var p = document.getElementById("template-admin");
        if (p) p.hidden = false;
        setTimeout(function () {
          var row = document.getElementById("template-row-new");
          if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
          var inp = document.getElementById("new-template-name");
          if (inp) inp.focus();
        }, 60);
        return;
      }
      if ((b = e.target.closest("[data-template-reset]"))) {
        if (!myRealIdentity || !myPassword) {
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var k = b.getAttribute("data-template-reset"),
          custom = getCommTemplates();
        if (DEFAULT_COMM_TEMPLATES[k]) custom[k] = DEFAULT_COMM_TEMPLATES[k];
        else delete custom[k];
        var only = {};
        Object.keys(custom).forEach(function (x) {
          if (custom[x] !== DEFAULT_COMM_TEMPLATES[x]) only[x] = custom[x];
        });
        var lbls = getCommTemplateLabels();
        delete lbls[k];
        persistMisPlantillas(only, lbls);
        showToast(
          DEFAULT_COMM_TEMPLATES[k]
            ? "Plantilla restaurada"
            : "Plantilla eliminada",
          "good",
        );
        renderWorkspace();
        setTimeout(function () {
          var p = document.getElementById("template-admin");
          if (p) p.hidden = false;
        }, 0);
        return;
      }
      if (e.target.closest("[data-template-add]")) {
        if (!myRealIdentity || !myPassword) {
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var nameInput = document.getElementById("new-template-name"),
          rawName = nameInput ? nameInput.value.trim() : "";
        var n = rawName
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, ""),
          body = document.getElementById("new-template-body").value.trim();
        if (!n || !body) {
          showToast("Captura nombre y mensaje", "error");
          return;
        }
        var custom = getCommTemplates();
        custom[n] = body;
        var only = {};
        Object.keys(custom).forEach(function (x) {
          if (custom[x] !== DEFAULT_COMM_TEMPLATES[x]) only[x] = custom[x];
        });
        var lbls = getCommTemplateLabels();
        lbls[n] = rawName;
        persistMisPlantillas(only, lbls);
        renderWorkspace();
        setTimeout(function () {
          var p = document.getElementById("template-admin");
          if (p) p.hidden = false;
          var row = document.getElementById("template-row-" + n);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.classList.add("flash");
            setTimeout(function () {
              row.classList.remove("flash");
            }, 1500);
          }
        }, 0);
        showToast(
          "✓ Plantilla creada — ya aparece en el acceso rápido de arriba",
          "good",
        );
        return;
      }
      if (e.target.closest("[data-template-save]")) {
        if (!myRealIdentity || !myPassword) {
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var custom = {};
        document.querySelectorAll("[data-template-body]").forEach(function (x) {
          var k = x.getAttribute("data-template-body"),
            v = x.value;
          if (v !== DEFAULT_COMM_TEMPLATES[k]) custom[k] = v;
        });
        var labels = {};
        document
          .querySelectorAll("[data-template-label]")
          .forEach(function (x) {
            var k = x.getAttribute("data-template-label"),
              v = x.value.trim();
            if (v && v !== (DEFAULT_COMM_TEMPLATE_NAMES[k] || ""))
              labels[k] = v;
          });
        persistMisPlantillas(custom, labels);
        showToast(
          "✓ Plantillas guardadas — quedan ligadas a tu usuario, te acompañan en cualquier dispositivo",
          "good",
        );
        renderWorkspace();
        setTimeout(function () {
          var p = document.getElementById("template-admin");
          if (p) p.hidden = false;
        }, 0);
        return;
      }
      if ((b = e.target.closest("[data-comm-type]"))) {
        document.querySelectorAll(".comm-type").forEach(function (x) {
          x.classList.remove("active");
        });
        b.classList.add("active");
        var ta = document.getElementById("comm-message");
        if (ta && r)
          ta.value = communicationMessage(
            r,
            b.getAttribute("data-comm-type"),
            !!(
              document.getElementById("comm-include-tracking") &&
              document.getElementById("comm-include-tracking").checked
            ),
          );
        return;
      }
      if (e.target.closest("[data-comm-generate]")) {
        var active = document.querySelector(".comm-type.active");
        var ta = document.getElementById("comm-message");
        if (ta && r)
          ta.value = communicationMessage(
            r,
            active ? active.getAttribute("data-comm-type") : "general",
            !!(
              document.getElementById("comm-include-tracking") &&
              document.getElementById("comm-include-tracking").checked
            ),
          );
        return;
      }
      if (e.target.closest("[data-comm-copy]")) {
        var ta = document.getElementById("comm-message");
        if (!ta) return;
        copyTextGeneric(ta.value, "Mensaje copiado");
        return;
      }
      if ((b = e.target.closest("[data-comm-sent]"))) {
        if (!r) return;
        if (!myRealIdentity || !myPassword) {
          showToast(
            "Verifica tu identidad para registrar la comunicación",
            "error",
          );
          ensureLoggedIn(function () {
            renderWorkspace();
          });
          return;
        }
        var ch = document.getElementById("comm-channel"),
          canal = ch ? ch.value : "Otro",
          fb = document.getElementById("comm-action-feedback"),
          tipoBtn = document.querySelector(".comm-type.active"),
          tipoAviso = tipoBtn
            ? commTemplateLabel(tipoBtn.getAttribute("data-comm-type"))
            : "General";
        /* Solo se registra qué aviso fue (canal + tipo), no el texto del mensaje. */ b.disabled = true;
        b.textContent = "Guardando…";
        if (fb) fb.textContent = "Registrando comunicación…";
        var finished = false;
        var watchdog = setTimeout(function () {
          if (finished) return;
          finished = true;
          b.disabled = false;
          b.textContent = "Registrar como enviado";
          if (fb)
            fb.textContent =
              "⚠ El servidor tardó demasiado. Verifica el historial antes de volver a registrar.";
          showToast(
            "La operación tardó demasiado; revisa si se guardó antes de reintentar",
            "error",
          );
        }, 12000);
        flushPendingFieldSaves(r.load, function () {
          google.script.run
            .withSuccessHandler(function (res) {
              if (finished) return;
              finished = true;
              clearTimeout(watchdog);
              b.disabled = false;
              b.textContent = "Registrar como enviado";
              if (!res || res.ok === false) {
                if (fb)
                  fb.textContent =
                    "⚠ " + ((res && res.error) || "No se pudo registrar");
                showToast(
                  (res && res.error) || "No se pudo registrar",
                  "error",
                );
                return;
              }
              r.client_notify_pending = false;
              r.client_notify_reason = "";
              r.client_notified_at =
                res.notified_at || new Date().toISOString();
              r.client_notified_by = myRealIdentity;
              if (res.warning) showToast(res.warning, "error");
              else
                showToast("✓ Registrado: " + canal + " · " + tipoAviso, "good");
              if (res.recordatorio_fecha)
                r.recordatorio_fecha = res.recordatorio_fecha;
              refreshOperationalAttention();
              render(currentData);
              renderWorkspace();
            })
            .withFailureHandler(function (err) {
              if (finished) return;
              finished = true;
              clearTimeout(watchdog);
              b.disabled = false;
              b.textContent = "Registrar como enviado";
              if (fb) fb.textContent = "⚠ Error al registrar la comunicación.";
              showToast(
                "No se pudo guardar: " +
                  (err && err.message ? err.message : err),
                "error",
              );
            })
            .registrarComunicacionCliente(
              r.load,
              canal,
              tipoAviso,
              myRealIdentity,
              myPassword,
            );
        });
        return;
      }
    });

  function openCommentsModal(key, kind) {
    commentsCurrentLoad = key;
    commentsCurrentKind = kind || "load";
    if (commentsCurrentKind === "pendiente") {
      var p = pendientes.filter(function (x) {
        return String(x.id) === String(key);
      })[0];
      document.getElementById("comments-label-prefix").textContent =
        "Pendiente: ";
      document.getElementById("comments-load-label").textContent = p
        ? p.cliente
        : "";
      document.getElementById("comments-trailer-label").textContent =
        p && (p.origen || p.destino)
          ? (p.origen || "—") + " → " + (p.destino || "—")
          : "";
    } else {
      document.getElementById("comments-label-prefix").textContent = "Carga #";
      document.getElementById("comments-load-label").textContent = key;
      var rec = recPorLoad_(key);
      document.getElementById("comments-trailer-label").textContent =
        rec && rec.trailer ? "Trailer: " + rec.trailer : "";
    }
    document.getElementById("comments-textarea").value = "";
    document.getElementById("comments-list").innerHTML =
      '<div class="comments-empty">Cargando…</div>';
    document.getElementById("comments-backdrop").classList.add("show");
    updateCommentsIdentityGate();
    google.script.run
      .withSuccessHandler(renderComments)
      .withFailureHandler(function (err) {
        document.getElementById("comments-list").innerHTML =
          '<div class="comments-empty">Error: ' + esc(err.message) + "</div>";
      })
      .getComments(key, myRealIdentity, myPassword);
  }

  function closeCommentsModal() {
    document.getElementById("comments-backdrop").classList.remove("show");
    commentsCurrentLoad = null;
    commentsCurrentKind = "load";
  }

  document
    .getElementById("comments-close")
    .addEventListener("click", closeCommentsModal);
  document
    .getElementById("comments-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "comments-backdrop") closeCommentsModal();
    });

  /* ---------------- Vista previa de comentarios al pasar el mouse ----------------
   * Al pasar el mouse sobre un botón "Comentarios" (en tarjetas, tabla, pendientes o bitácora)
   * O sobre la columna "Último comentario" del listado de cargas (vista tabla) se muestra,
   * tras un breve instante, una ventanita de solo lectura con el hilo completo de comentarios
   * de esa carga/pendiente (con su propio scroll). Se cierra sola cuando el mouse sale tanto
   * de la zona que la disparó como de la ventanita — con un pequeño margen de tiempo para poder
   * cruzar el espacio entre ambos sin que se cierre de golpe. El click en el botón "Comentarios"
   * sigue abriendo el modal de siempre para agregar comentarios nuevos; esto es solo para leer
   * rápido. La celda "Último comentario" de la tabla (.t-comment) no tiene su propio atributo
   * data-comments-load — usa el data-load de la fila (<tr class="t-row" data-load="...">). */
  var hoverPopupShowTimer = null;
  var hoverPopupHideTimer = null;
  var hoverPopupComboKey = null; // "load:48213" o "pendiente:xyz" — evita volver a pedir lo mismo

  /** Encuentra la zona de hover de comentarios más cercana a un elemento (botón "Comentarios")
   * y devuelve su ancla para posicionar la ventanita más la llave (load o pendiente) para pedir
   * sus comentarios — o null si no aplica. La celda "Último comentario" de la tabla YA NO usa
   * hover (detectaba mal la zona y a veces mostraba los comentarios de otro load) — ahora se
   * abre directo con un clic, ver el manejador de [data-load] en '.t-comment' más abajo. */
  function commentsHoverTargetFor(el) {
    if (!el || !el.closest) return null;
    var btn = el.closest(".comments-btn");
    if (btn) {
      var isLoad = btn.hasAttribute("data-comments-load");
      var key = isLoad
        ? btn.getAttribute("data-comments-load")
        : btn.getAttribute("data-comments-pendiente");
      return {
        anchor: btn,
        key: key,
        combo: (isLoad ? "load:" : "pendiente:") + key,
      };
    }
    return null;
  }

  function positionCommentsHoverPopup(anchor) {
    var popup = document.getElementById("comments-hover-popup");
    var r = anchor.getBoundingClientRect();
    var margin = 8,
      width = popup.offsetWidth || 280;
    var left = Math.min(r.left, window.innerWidth - width - margin);
    left = Math.max(margin, left);
    var top = r.bottom + 6;
    var maxTop = window.innerHeight - margin - (popup.offsetHeight || 120);
    if (top > maxTop)
      top = Math.max(margin, r.top - 6 - (popup.offsetHeight || 120)); // no cabe abajo: mostrar arriba
    popup.style.left = left + "px";
    popup.style.top = top + "px";
  }

  function renderCommentsHoverList(raw) {
    var box = document.getElementById("comments-hover-list");
    var list;
    try {
      list = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      list = [];
    }
    if (!list || !list.length) {
      box.innerHTML =
        '<div class="comments-empty">Todavía no hay comentarios.</div>';
      return;
    }
    box.innerHTML = list
      .map(function (c) {
        var meta =
          fmtDateTime(c.ts) + (c.usuario ? " · " + escHtml(c.usuario) : "");
        return (
          '<div class="comment-entry"><span class="ts">' +
          meta +
          '</span><span class="txt">' +
          escHtml(c.text) +
          "</span></div>"
        );
      })
      .join("");
  }

  function showCommentsHoverPopup(target) {
    clearTimeout(hoverPopupHideTimer);
    hoverPopupComboKey = target.combo;
    var popup = document.getElementById("comments-hover-popup");
    document.getElementById("comments-hover-list").innerHTML =
      '<div class="comments-empty">Cargando…</div>';
    popup.hidden = false;
    positionCommentsHoverPopup(target.anchor);
    google.script.run
      .withSuccessHandler(function (raw) {
        if (hoverPopupComboKey !== target.combo) return; // el mouse ya se movió a otra carga
        renderCommentsHoverList(raw);
        positionCommentsHoverPopup(target.anchor);
      })
      .withFailureHandler(function (err) {
        if (hoverPopupComboKey !== target.combo) return;
        document.getElementById("comments-hover-list").innerHTML =
          '<div class="comments-empty">Error al cargar comentarios.</div>';
      })
      .getComments(target.key, myRealIdentity, myPassword);
  }

  function hideCommentsHoverPopupNow() {
    document.getElementById("comments-hover-popup").hidden = true;
    hoverPopupComboKey = null;
  }

  function scheduleHideCommentsHoverPopup() {
    clearTimeout(hoverPopupShowTimer);
    clearTimeout(hoverPopupHideTimer);
    hoverPopupHideTimer = setTimeout(hideCommentsHoverPopupNow, 180);
  }

  function withinCommentsHoverZone(el) {
    return !!(
      el &&
      el.closest &&
      (el.closest(".comments-btn") || el.closest("#comments-hover-popup"))
    );
  }

  document.addEventListener("mouseover", function (e) {
    var target = commentsHoverTargetFor(e.target);
    if (target) {
      if (withinCommentsHoverZone(e.relatedTarget)) {
        clearTimeout(hoverPopupHideTimer);
        return;
      }
      clearTimeout(hoverPopupShowTimer);
      hoverPopupShowTimer = setTimeout(function () {
        showCommentsHoverPopup(target);
      }, 160);
      return;
    }
    if (e.target.closest("#comments-hover-popup")) {
      clearTimeout(hoverPopupHideTimer);
    }
  });
  document.addEventListener("mouseout", function (e) {
    if (!withinCommentsHoverZone(e.target)) return;
    if (withinCommentsHoverZone(e.relatedTarget)) return; // se mueve dentro de la misma zona combinada
    clearTimeout(hoverPopupShowTimer);
    scheduleHideCommentsHoverPopup();
  });
  // Si la página (o cualquier otro contenedor) se mueve (scroll) mientras la ventanita está
  // abierta, se esconde: su posición es relativa al botón y no vale la pena reposicionarla en
  // cada evento de scroll. Pero el scroll DENTRO de la propia ventanita (la rueda del mouse
  // sobre la lista de comentarios, que tiene su propio overflow-y:auto) no debe contar — como
  // "scroll" no burbujea pero sí se captura desde window, sin este filtro se cerraba sola en
  // cuanto empezabas a hacer scroll con la rueda dentro de ella.
  window.addEventListener(
    "scroll",
    function (e) {
      var popup = document.getElementById("comments-hover-popup");
      if (popup.hidden) return;
      if (
        e.target &&
        e.target.closest &&
        e.target.closest("#comments-hover-popup")
      )
        return;
      hideCommentsHoverPopupNow();
    },
    true,
  );

  /* ---------------- Incidencias (Fase 2) ----------------
   * Mismo mecanismo de identidad que Comentarios (firmado con contraseña vía myRealIdentity/myPassword).
   * Debe reflejar exactamente los mismos arreglos INCIDENCIA_CATEGORIAS_GS / _SEVERIDADES_GS
   * definidos en Code.gs. */
  var INCIDENCIA_CATEGORIAS = [
    "Documentación",
    "Operador",
    "Unidad",
    "Aduana",
    "Cliente",
    "Otro",
  ];
  var INCIDENCIA_SEVERIDADES = [
    ["critical", "Rojo"],
    ["warn", "Amarillo"],
    ["good", "Verde"],
  ];
  var incidenciaCurrentLoad = null;
  var incidenciaSeveridadSeleccionada = "warn";

  document.getElementById("incidencia-categoria").innerHTML =
    INCIDENCIA_CATEGORIAS.map(function (c) {
      return '<option value="' + c + '">' + c + "</option>";
    }).join("");

  function renderIncidenciaSeveridadPicker() {
    document.getElementById("incidencia-severidad-picker").innerHTML =
      INCIDENCIA_SEVERIDADES.map(function (s) {
        return (
          '<button type="button" class="incidencia-sev-btn sev-' +
          esc(s[0]) +
          (incidenciaSeveridadSeleccionada === s[0] ? " selected" : "") +
          '" data-incidencia-sev="' +
          esc(s[0]) +
          '">' +
          esc(s[1]) +
          "</button>"
        );
      }).join("");
  }
  renderIncidenciaSeveridadPicker();

  document
    .getElementById("incidencia-severidad-picker")
    .addEventListener("click", function (e) {
      var btn = e.target.closest("[data-incidencia-sev]");
      if (!btn) return;
      incidenciaSeveridadSeleccionada = btn.getAttribute("data-incidencia-sev");
      renderIncidenciaSeveridadPicker();
    });

  function renderIncidencias(raw) {
    var box = document.getElementById("incidencia-list");
    var list;
    try {
      list = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      list = [];
    }
    if (!list || !list.length) {
      box.innerHTML =
        '<div class="comments-empty">Todavía no hay incidencias para esta carga.</div>';
      return;
    }
    box.innerHTML = list
      .map(function (inc) {
        var meta =
          fmtDateTime(inc.fecha) +
          (inc.creado_por ? " · " + escHtml(inc.creado_por) : "");
        return (
          '<div class="incidencia-entry sev-' +
          escHtml(inc.severidad) +
          '" data-incidencia-id="' +
          esc(inc.id) +
          '">' +
          '<button type="button" class="incidencia-del" data-borrar-incidencia="' +
          esc(inc.id) +
          '" title="Borrar incidencia (capturada por error)" aria-label="Borrar incidencia">&times;</button>' +
          '<span class="ts">' +
          meta +
          "</span>" +
          '<span class="cat">' +
          escHtml(inc.categoria) +
          "</span>" +
          '<div class="desc">' +
          escHtml(inc.descripcion) +
          "</div>" +
          (inc.accion_tomada
            ? '<div class="accion"><b>Acción tomada:</b> ' +
              escHtml(inc.accion_tomada) +
              "</div>"
            : "") +
          "</div>"
        );
      })
      .join("");
  }

  function openIncidenciaModal(load) {
    if (!myRealIdentity || !myPassword) {
      ensureLoggedIn(function () {
        openIncidenciaModal(load);
      });
      return;
    }
    incidenciaCurrentLoad = load;
    document.getElementById("incidencia-load-label").textContent = load;
    document.getElementById("incidencia-descripcion").value = "";
    document.getElementById("incidencia-accion").value = "";
    incidenciaSeveridadSeleccionada = "warn";
    renderIncidenciaSeveridadPicker();
    document.getElementById("incidencia-list").innerHTML =
      '<div class="comments-empty">Cargando…</div>';
    document.getElementById("incidencia-backdrop").classList.add("show");
    google.script.run
      .withSuccessHandler(renderIncidencias)
      .withFailureHandler(function (err) {
        document.getElementById("incidencia-list").innerHTML =
          '<div class="comments-empty">Error: ' + esc(err.message) + "</div>";
      })
      .getIncidencias(load, myRealIdentity, myPassword);
  }

  function closeIncidenciaModal() {
    document.getElementById("incidencia-backdrop").classList.remove("show");
    incidenciaCurrentLoad = null;
  }

  // Borrar una incidencia capturada por error — con "Deshacer" y queda rastro en el Historial de la
  // carga (ver removeIncidencia en Code.gs). Para corregir una, se borra y se vuelve a registrar.
  document
    .getElementById("incidencia-list")
    .addEventListener("click", function (e) {
      var b = e.target.closest("[data-borrar-incidencia]");
      if (!b) return;
      var id = b.getAttribute("data-borrar-incidencia"),
        load = incidenciaCurrentLoad;
      var entry = b.closest(".incidencia-entry");
      if (entry) entry.hidden = true;
      accionConDeshacer_(
        "Incidencia borrada",
        function () {
          guardarConVerificacion_(
            function () {
              var rec = recPorLoad_(load);
              if (rec) {
                rec.incidenciasCount = Math.max(
                  0,
                  (Number(rec.incidenciasCount) || 0) - 1,
                );
                render(currentData);
              }
              if (incidenciaCurrentLoad === load)
                google.script.run
                  .withSuccessHandler(renderIncidencias)
                  .getIncidencias(load, myRealIdentity, myPassword);
            },
            function (err) {
              if (entry) entry.hidden = false;
              showToast("No se pudo borrar: " + err.message, "error");
            },
          ).removeIncidencia(id, myRealIdentity, myPassword);
        },
        function () {
          if (entry) entry.hidden = false;
        },
      );
    });

  document
    .getElementById("incidencia-close")
    .addEventListener("click", closeIncidenciaModal);
  document
    .getElementById("incidencia-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "incidencia-backdrop") closeIncidenciaModal();
    });

  document
    .getElementById("incidencia-submit")
    .addEventListener("click", function () {
      var descripcion = document
        .getElementById("incidencia-descripcion")
        .value.trim();
      if (!descripcion || !incidenciaCurrentLoad) {
        document.getElementById("incidencia-descripcion").focus();
        return;
      }
      if (!myRealIdentity || !myPassword) {
        showToast("Verifica tu identidad antes de registrar.", "error");
        return;
      }
      var categoria = document.getElementById("incidencia-categoria").value;
      var accion = document.getElementById("incidencia-accion").value.trim();
      var load = incidenciaCurrentLoad;
      var btn = document.getElementById("incidencia-submit");
      var btnOriginalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Guardando…";
      google.script.run
        .withSuccessHandler(function (res) {
          btn.disabled = false;
          btn.textContent = btnOriginalText;
          if (!res || !res.ok) {
            showToast(
              (res && res.error) || "No se pudo guardar la incidencia",
              "error",
            );
            return;
          }
          document.getElementById("incidencia-descripcion").value = "";
          document.getElementById("incidencia-accion").value = "";
          google.script.run
            .withSuccessHandler(renderIncidencias)
            .getIncidencias(load, myRealIdentity, myPassword);
          showToast("Incidencia registrada — Carga " + load, "good");
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          btn.textContent = btnOriginalText;
          showToast("Error: " + err.message, "error");
        })
        .addIncidencia(
          load,
          categoria,
          incidenciaSeveridadSeleccionada,
          descripcion,
          accion,
          myRealIdentity,
          myPassword,
        );
    });
  document
    .getElementById("comments-submit")
    .addEventListener("click", function () {
      var textarea = document.getElementById("comments-textarea");
      var text = textarea.value.trim();
      if (!text || !commentsCurrentLoad) {
        textarea.focus();
        return;
      }
      // Blindaje: sin identidad verificada (contraseña) no se guarda ningún comentario, para nunca
      // arriesgarnos a que quede firmado con el "usuario" que se tenga seleccionado solo para
      // ver/filtrar el panel (que puede ser cualquier CSR, no necesariamente quien escribe).
      if (!myRealIdentity || !myPassword) {
        updateCommentsIdentityGate();
        showToast(
          "Verifica tu identidad antes de comentar (botón de abajo).",
          "error",
        );
        return;
      }
      var btn = document.getElementById("comments-submit");
      var btnOriginalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="comments-spinner"></span>Guardando…';
      var load = commentsCurrentLoad;
      var kind = commentsCurrentKind;
      // Siempre se firma con la identidad verificada por contraseña, nunca con el "usuario" que se tenga
      // seleccionado nada más para ver/filtrar el panel — así nadie puede entrar al filtro de otro
      // CSR y que sus comentarios salgan como si esa persona los hubiera puesto. El servidor vuelve
      // a checar la contraseña antes de guardar, así que tampoco sirve manipular esto desde el navegador.
      var usuario = myRealIdentity;
      var password = myPassword;

      google.script.run
        .withSuccessHandler(function (res) {
          btn.disabled = false;
          btn.innerHTML = btnOriginalHtml;

          if (!res || !res.ok) {
            // La contraseña ya no es válida (por ejemplo, el administrador lo cambió) — hay que
            // verificar de nuevo antes de poder seguir comentando.
            myRealIdentity = "";
            myPassword = "";
            borrarSesionLocal_();
            updateCommentsIdentityGate();
            openIdentityModal();
            showToast(
              (res && res.error) ||
                "No se pudo verificar tu identidad. Vuelve a verificarla.",
              "error",
            );
            return;
          }

          textarea.value = "";

          // Actualización optimista: agregamos el comentario nuevo directo al modal y
          // actualizamos el "último comentario" de la tabla en memoria, sin volver a
          // pedirle al servidor ni el historial completo ni todos los comentarios de nuevo.
          var box = document.getElementById("comments-list");
          if (box.querySelector(".comments-empty")) box.innerHTML = "";
          var meta =
            fmtDateTime(res.ts) +
            (res.usuario ? " · " + escHtml(res.usuario) : "");
          var entry = document.createElement("div");
          entry.className = "comment-entry";
          entry.innerHTML =
            '<span class="ts">' +
            meta +
            '</span><span class="txt">' +
            escHtml(text) +
            "</span>";
          box.insertBefore(entry, box.firstChild);

          ultimosComentarios[String(load)] = {
            ts: res.ts,
            text: text,
            usuario: res.usuario,
          };
          if (kind === "pendiente") {
            renderPendientes();
          } else if (currentView === "table") {
            buildTableView();
            wireCardEvents();
            applyFilters();
          } else {
            viewDirty.table = true;
          }

          closeCommentsModal();
          if (kind !== "pendiente") aplicarRevision_(load, res);
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          btn.innerHTML = btnOriginalHtml;
          showToast("Error al guardar el comentario: " + err.message, "error");
        })
        .addComment(load, text, usuario, password);
    });

  // ---- Recordatorio de Descompuesta / En resguardo / Patio permisionario ----
  // Al entrar a cualquiera de estos 3 estatus, el panel exige programar fecha/hora (para Patio
  // permisionario, es la fecha estimada de despacho). Si esa fecha se pasa y el load sigue en
  // ese estatus, se muestra en rojo aquí en el panel con opción de reprogramar (ver
  // recordatorioTagHtml) — es solo un aviso visual dentro del panel, no manda correo.
  var recordatorioCtx = null; // { load, status, mode: 'nuevo-estatus' | 'editar', prevStatus, selEl }

  function recordatorioNoteFor(status) {
    if (status === "Patio permisionario") {
      return "Si esta fecha se pasa y el load sigue en Patio permisionario, se va a marcar en rojo aquí en el panel para que lo revises.";
    }
    return "Se va a marcar en rojo aquí en el panel cuando llegue esta fecha, para que vuelvas a revisar este load.";
  }

  function toDatetimeLocalValue(d) {
    var pad = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "T" +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function openRecordatorioModal(load, status, mode, prevStatus, selEl) {
    recordatorioCtx = {
      load: load,
      status: status,
      mode: mode,
      prevStatus: prevStatus,
      selEl: selEl,
    };
    var verbo = mode === "editar" ? "Reprogramar" : "Programar";
    document.getElementById("recordatorio-title").textContent =
      status === "Patio permisionario"
        ? verbo + " fecha de despacho"
        : verbo + " recordatorio — " + status;
    document.getElementById("recordatorio-note").textContent =
      recordatorioNoteFor(status);
    document.getElementById("recordatorio-error").style.display = "none";
    var input = document.getElementById("recordatorio-fecha-input");
    var rec = recPorLoad_(load);
    input.value =
      rec && rec.recordatorio_fecha
        ? toDatetimeLocalValue(new Date(rec.recordatorio_fecha))
        : "";
    document.getElementById("recordatorio-backdrop").classList.add("show");
    input.focus();
  }

  function cancelRecordatorioModal() {
    var ctx = recordatorioCtx;
    document.getElementById("recordatorio-backdrop").classList.remove("show");
    recordatorioCtx = null;
    // Si se abrió al elegir un estatus nuevo y se cancela, el select regresa a como estaba —
    // nunca se deja un estatus con recordatorio pendiente sin fecha.
    if (ctx && ctx.mode === "nuevo-estatus" && ctx.selEl) {
      ctx.selEl.value = ctx.prevStatus || "";
    }
  }

  document
    .getElementById("recordatorio-close")
    .addEventListener("click", cancelRecordatorioModal);
  document
    .getElementById("recordatorio-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "recordatorio-backdrop") cancelRecordatorioModal();
    });
  document.querySelectorAll(".recordatorio-quick-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dias = Number(btn.getAttribute("data-quick"));
      document.getElementById("recordatorio-fecha-input").value =
        toDatetimeLocalValue(new Date(Date.now() + dias * 24 * 60 * 60 * 1000));
    });
  });

  document
    .getElementById("recordatorio-submit")
    .addEventListener("click", function () {
      if (!recordatorioCtx) return;
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          document.getElementById("recordatorio-submit").click();
        });
        return;
      }
      var input = document.getElementById("recordatorio-fecha-input");
      if (!input.value) {
        document.getElementById("recordatorio-error").style.display = "";
        return;
      }
      var ctx = recordatorioCtx;
      var fechaISO = new Date(input.value).toISOString();
      document.getElementById("recordatorio-backdrop").classList.remove("show");
      recordatorioCtx = null;

      var rec = recPorLoad_(ctx.load);
      var prev = rec
        ? { status: rec.status, recordatorio_fecha: rec.recordatorio_fecha }
        : null;

      if (ctx.mode === "nuevo-estatus") {
        // Actualización optimista: estatus + recordatorio se guardan juntos, igual que POD/VG.
        if (rec) {
          rec.status = ctx.status;
          rec.recordatorio_fecha = fechaISO;
        }
        render(currentData);
        if (workspaceCurrentLoad === String(ctx.load)) renderWorkspace();
        showToast("Recordatorio programado — Carga " + ctx.load, "good");
        guardarConVerificacion_(null, function (err) {
          if (rec && prev) {
            rec.status = prev.status;
            rec.recordatorio_fecha = prev.recordatorio_fecha;
          }
          render(currentData);
          showToast("No se pudo guardar el estatus: " + err.message, "error");
        }).saveStatusConRecordatorio(
          ctx.load,
          ctx.status,
          fechaISO,
          myRealIdentity,
          myPassword,
        );
      } else {
        if (rec) {
          rec.recordatorio_fecha = fechaISO;
        }
        render(currentData);
        showToast("Recordatorio actualizado — Carga " + ctx.load, "good");
        guardarConVerificacion_(null, function (err) {
          if (rec && prev) {
            rec.recordatorio_fecha = prev.recordatorio_fecha;
          }
          render(currentData);
          showToast(
            "No se pudo guardar el recordatorio: " + err.message,
            "error",
          );
        }).saveRecordatorio(ctx.load, fechaISO, myRealIdentity, myPassword);
      }
    });

  // Los manejadores delegados se dividen por tema. Cada sección regresa SIGUE_ si el evento no era
  // suyo; si lo atendió (cualquier "return" dentro), ya no se prueban las siguientes — exactamente
  // el mismo orden y comportamiento que cuando todo vivía en una sola función de 600 líneas.
  var SIGUE_ = {};
  /** Cambio en truck, trailer, citas de pickup/entrega, salida de México y cruce a USA. */
  function cambioCamposCarga_(e) {
    var input;

    // Truck y trailer se pueden capturar a mano aquí mismo (el Excel solo se sube una vez al
    // día — normalmente a mediodía — así que si a alguno se lo asignan después, no hay que
    // esperar hasta la importación del día siguiente para verlo reflejado). En el próximo
    // import, si el Excel SÍ trae un valor para ese load, gana sobre lo capturado a mano; si
    // no trae nada, se conserva esto (ver importLoads en Code.gs).
    if ((input = e.target.closest("[data-truck-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = input.getAttribute("data-truck-load");
      var val = input.value.trim();
      var rec = recPorLoad_(load);
      var prev = rec ? rec.truck : null;
      if (rec) rec.truck = val;
      actualizarUnidadEnTabla_(load, "truck", val);
      guardarConVerificacion_(
        function () {
          showToast("Truck actualizado — Carga " + load, "good");
        },
        function (err) {
          if (rec) rec.truck = prev;
          input.value = prev || "";
          actualizarUnidadEnTabla_(load, "truck", prev);
          showToast("No se pudo guardar el truck: " + err.message, "error");
        },
      ).saveTruck(load, val, myRealIdentity, myPassword);
      return;
    }

    if ((input = e.target.closest("[data-trailer-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = input.getAttribute("data-trailer-load");
      var val = input.value.trim();
      var rec = recPorLoad_(load);
      var prev = rec ? rec.trailer : null;
      if (rec) {
        rec.trailer = val;
        actualizarTituloDetalleTabla_(rec);
      }
      actualizarUnidadEnTabla_(load, "trailer", val);
      guardarConVerificacion_(
        function () {
          showToast("Trailer actualizado — Carga " + load, "good");
        },
        function (err) {
          if (rec) {
            rec.trailer = prev;
            actualizarTituloDetalleTabla_(rec);
          }
          input.value = prev || "";
          actualizarUnidadEnTabla_(load, "trailer", prev);
          showToast("No se pudo guardar el trailer: " + err.message, "error");
        },
      ).saveTrailer(load, val, myRealIdentity, myPassword);
      return;
    }

    // Cita de recolección / Entrega cita: mismo mecanismo que truck/trailer — se pueden ajustar aquí
    // mismo (ej. el cliente mueve la cita) y el documento sigue mandando en el próximo import
    // si trae una fecha para ese load (ver savePickupAppt/saveDeliveryAppt e importLoads).
    if ((input = e.target.closest("[data-pickup-appt-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = input.getAttribute("data-pickup-appt-load");
      var val = input.value ? input.value.replace("T", " ") : "";
      var rec = recPorLoad_(load);
      var prev = rec ? rec.pickup_appt : null;
      if (rec) {
        rec.pickup_appt = val;
        setLocalNotifyPending(rec, "Cambio en cita de pickup");
        renderActionCenter(currentData);
      }
      document
        .querySelectorAll(
          'tr.t-row[data-load="' +
            CSS.escape(String(load)) +
            '"] .t-date-pickup',
        )
        .forEach(function (cell) {
          cell.textContent = fmtDate(val);
        });
      guardarConVerificacion_(
        function () {
          showToast("Cita de recolección actualizada — Carga " + load, "good");
        },
        function (err) {
          if (rec) rec.pickup_appt = prev;
          input.value = apptDatetimeLocalValue(prev);
          document
            .querySelectorAll(
              'tr.t-row[data-load="' +
                CSS.escape(String(load)) +
                '"] .t-date-pickup',
            )
            .forEach(function (cell) {
              cell.textContent = fmtDate(prev);
            });
          showToast(
            "No se pudo guardar el pickup cita: " + err.message,
            "error",
          );
        },
      ).savePickupAppt(load, val, myRealIdentity, myPassword);
      return;
    }

    if ((input = e.target.closest("[data-delivery-appt-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = input.getAttribute("data-delivery-appt-load");
      var val = input.value ? input.value.replace("T", " ") : "";
      var rec = recPorLoad_(load);
      var prev = rec ? rec.delivery_appt : null;
      if (rec) {
        rec.delivery_appt = val;
        setLocalNotifyPending(rec, "Cambio en cita de entrega");
        renderActionCenter(currentData);
      }
      document
        .querySelectorAll(
          'tr.t-row[data-load="' +
            CSS.escape(String(load)) +
            '"] .t-date-delivery',
        )
        .forEach(function (cell) {
          cell.textContent = fmtDate(val);
        });
      guardarConVerificacion_(
        function () {
          showToast("Entrega cita actualizada — Carga " + load, "good");
        },
        function (err) {
          if (rec) rec.delivery_appt = prev;
          input.value = apptDatetimeLocalValue(prev);
          document
            .querySelectorAll(
              'tr.t-row[data-load="' +
                CSS.escape(String(load)) +
                '"] .t-date-delivery',
            )
            .forEach(function (cell) {
              cell.textContent = fmtDate(prev);
            });
          showToast(
            "No se pudo guardar la entrega cita: " + err.message,
            "error",
          );
        },
      ).saveDeliveryAppt(load, val, myRealIdentity, myPassword);
      return;
    }

    // Salida planta / Cruce USA: alimentan el timeline del Portal Cliente (ver
    // deriveTimelineStage_ en Code.gs). Mismo mecanismo que pickup/entrega cita.
    if ((input = e.target.closest("[data-salida-mexico-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = input.getAttribute("data-salida-mexico-load");
      var val = input.value ? input.value.replace("T", " ") : "";
      if (salidaMexicoDebounceTimers[load])
        clearTimeout(salidaMexicoDebounceTimers[load]);
      var doSaveSalida = function (cb) {
        if (salidaMexicoDebounceTimers[load]) {
          clearTimeout(salidaMexicoDebounceTimers[load]);
          delete salidaMexicoDebounceTimers[load];
        }
        delete pendingFieldFlush[load].salida;
        var rec = recPorLoad_(load);
        var prev = rec ? rec.salida_mexico_fecha : null;
        if (rec) {
          rec.salida_mexico_fecha = val;
          setLocalNotifyPending(rec, "Salida de planta actualizada");
          renderActionCenter(currentData);
        }
        guardarConVerificacion_(
          function () {
            showToast("Salida planta actualizada — Carga " + load, "good");
            if (cb) cb();
          },
          function (err) {
            if (rec) rec.salida_mexico_fecha = prev;
            input.value = apptDatetimeLocalValue(prev);
            showToast(
              "No se pudo guardar la salida planta: " + err.message,
              "error",
            );
            if (cb) cb();
          },
        ).saveSalidaMexico(load, val, myRealIdentity, myPassword);
      };
      if (!pendingFieldFlush[load]) pendingFieldFlush[load] = {};
      pendingFieldFlush[load].salida = doSaveSalida;
      salidaMexicoDebounceTimers[load] = setTimeout(function () {
        doSaveSalida();
      }, 600);
      return;
    }

    if ((input = e.target.closest("[data-cruce-usa-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = input.getAttribute("data-cruce-usa-load");
      var val = input.value ? input.value.replace("T", " ") : "";
      if (cruceUsaDebounceTimers[load])
        clearTimeout(cruceUsaDebounceTimers[load]);
      var doSaveCruce = function (cb) {
        if (cruceUsaDebounceTimers[load]) {
          clearTimeout(cruceUsaDebounceTimers[load]);
          delete cruceUsaDebounceTimers[load];
        }
        delete pendingFieldFlush[load].cruce;
        var rec = recPorLoad_(load);
        var prev = rec ? rec.cruce_usa_fecha : null;
        if (rec) {
          rec.cruce_usa_fecha = val;
          setLocalNotifyPending(rec, "Cruce aduana actualizada");
          renderActionCenter(currentData);
        }
        guardarConVerificacion_(
          function () {
            showToast("Cruce actualizado — Carga " + load, "good");
            if (cb) cb();
          },
          function (err) {
            if (rec) rec.cruce_usa_fecha = prev;
            input.value = apptDatetimeLocalValue(prev);
            showToast(
              "No se pudo guardar el cruce USA: " + err.message,
              "error",
            );
            if (cb) cb();
          },
        ).saveCruceUsa(load, val, myRealIdentity, myPassword);
      };
      if (!pendingFieldFlush[load]) pendingFieldFlush[load] = {};
      pendingFieldFlush[load].cruce = doSaveCruce;
      cruceUsaDebounceTimers[load] = setTimeout(function () {
        doSaveCruce();
      }, 600);
      return;
    }
    return SIGUE_;
  }

  /** Cambio en el selector de estatus (incluye recordatorios y la revisión de "En transito"). */
  function cambioEstatus_(e) {
    var sel;
    if ((sel = e.target.closest(".status-select"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = sel.getAttribute("data-status-load");
      var val = sel.value;
      var rec = recPorLoad_(load);
      var prevStatus = rec ? rec.status : null;

      // Descompuesta / En resguardo / Patio permisionario exigen programar un recordatorio
      // antes de guardar el cambio — se abre el modal y el estatus no se guarda hasta que se
      // confirme una fecha (si se cancela, el select regresa al estatus anterior).
      if (REMINDER_STATUSES.indexOf(val) !== -1) {
        openRecordatorioModal(load, val, "nuevo-estatus", prevStatus, sel);
        return;
      }

      // "En transito" no pide nada a mano — la regla es siempre la misma (revisar cada
      // AUTO_REVIEW_HOURS horas), así que en cuanto entra a este estatus se programa sola la
      // próxima revisión a "ahora + AUTO_REVIEW_HOURS horas". Importante: esto NUNCA debe caer
      // al saveStatus genérico de abajo — ese borra recordatorio_fecha para cualquier estatus
      // que no sea uno de los tres manuales (ver Code.gs), y aquí sí necesitamos conservarla.
      if (AUTO_REVIEW_STATUSES.indexOf(val) !== -1) {
        if (val === prevStatus) return; // ya estaba en "En transito" — no hay nada que guardar
        var prevSnapAuto = snapshotStatusFields_(rec);
        var fechaISO = new Date(
          Date.now() + AUTO_REVIEW_HOURS * 60 * 60 * 1000,
        ).toISOString();
        if (rec) {
          rec.status = val;
          rec.recordatorio_fecha = fechaISO;
          setLocalNotifyPending(rec, "Cambio de estatus: " + val);
        }
        render(currentData);
        if (workspaceCurrentLoad === String(load)) renderWorkspace();
        accionConDeshacer_(
          "En tránsito (revisión en " +
            AUTO_REVIEW_HOURS +
            "h) — Carga " +
            load,
          function () {
            guardarConVerificacion_(null, function (err) {
              restoreStatusFields_(load, prevSnapAuto);
              showToast(
                "No se pudo guardar el estatus: " + err.message,
                "error",
              );
            }).saveStatusConRecordatorio(
              load,
              val,
              fechaISO,
              myRealIdentity,
              myPassword,
            );
          },
          function () {
            restoreStatusFields_(load, prevSnapAuto);
          },
        );
        return;
      }

      // Actualización optimista: reflejamos el nuevo estatus al instante en el navegador
      // (incluye mover la carga de sección si aplica). El guardado real se manda cuando se
      // vence el "Deshacer" (ver accionConDeshacer_) — un clic equivocado en el selector ya no
      // cambia el estatus en la hoja ni deja marcado "pendiente avisar al cliente".
      var prevSnap = snapshotStatusFields_(rec);
      if (rec) {
        rec.status = val;
        setLocalNotifyPending(rec, "Cambio de estatus: " + val);
      }
      render(currentData);
      if (workspaceCurrentLoad === String(load)) renderWorkspace();

      accionConDeshacer_(
        "Estatus: " + val + " — Carga " + load,
        function () {
          guardarConVerificacion_(null, function (err) {
            restoreStatusFields_(load, prevSnap);
            showToast("No se pudo guardar el estatus: " + err.message, "error");
          }).saveStatus(load, val, myRealIdentity, myPassword);
        },
        function () {
          restoreStatusFields_(load, prevSnap);
        },
      );
      return;
    }
    return SIGUE_;
  }

  /** Casillas: POD enviado, recargos en VG y "atendido" de la bitácora. */
  function cambioCasillas_(e) {
    var chk;
    if ((chk = e.target.closest("[data-pod-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          chk.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = chk.getAttribute("data-pod-load");
      var sent = chk.checked;

      // Actualización optimista: movemos la carga de sección al instante en el navegador,
      // sin esperar la respuesta del servidor. El guardado real viaja en segundo plano.
      var rec = recPorLoad_(load);
      if (rec) rec.pod_sent = sent;
      render(currentData);
      showToast(
        sent
          ? "POD marcado como enviado — Carga " + load
          : "POD desmarcado — Carga " + load,
        "good",
      );

      guardarConVerificacion_(null, function (err) {
        if (rec) rec.pod_sent = !sent;
        render(currentData);
        showToast("No se pudo guardar el POD: " + err.message, "error");
      }).savePodSent(load, sent, myRealIdentity, myPassword);
      return;
    }

    if ((chk = e.target.closest("[data-recargos-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          chk.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var load = chk.getAttribute("data-recargos-load");
      var val = chk.checked;

      // Igual que POD: actualización optimista y guardado en segundo plano. En cuanto se
      // marca, la carga (TONU) pasa a la sección "Canceladas/Finalizadas".
      var rec = recPorLoad_(load);
      if (rec) rec.recargos_vg = val;
      render(currentData);
      showToast(
        val
          ? "Recargos marcados como ingresados en VG — Carga " +
              load +
              " pasa a Canceladas/Finalizadas"
          : "Recargos desmarcados — Carga " + load,
        "good",
      );

      guardarConVerificacion_(null, function (err) {
        if (rec) rec.recargos_vg = !val;
        render(currentData);
        showToast("No se pudo guardar: " + err.message, "error");
      }).saveRecargosVg(load, val, myRealIdentity, myPassword);
      return;
    }

    if ((chk = e.target.closest("[data-resolver-bitacora]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          chk.dispatchEvent(new Event("change", { bubbles: true }));
        });
        return;
      }
      var id = chk.getAttribute("data-resolver-bitacora");
      var val = chk.checked;
      var b = bitacora.filter(function (x) {
        return String(x.id) === String(id);
      })[0];
      if (b) b.resuelto = val;
      renderBitacora();
      guardarConVerificacion_(null, function (err) {
        if (b) b.resuelto = !val;
        renderBitacora();
        showToast("No se pudo guardar: " + err.message, "error");
      }).resolverBitacoraTurno(id, val, myRealIdentity, myPassword);
      return;
    }
    return SIGUE_;
  }

  /** Clics: abrir el Expediente de carga, documentos, pendiente de turno y "ya avisé al cliente". */
