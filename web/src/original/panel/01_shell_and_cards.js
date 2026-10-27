(function () {
  // Set chico de iconos SVG (estilo Lucide) para los pocos lugares clave del rediseño visual
  // (header, sidebar, tarjetas de resumen) — en vez de emojis, para que se vean consistentes y
  // discretos en cualquier tamaño/pantalla.
  var ICON_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
  var ICON_LOCK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';
  var ICON_TRUCK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="7" width="14" height="10" rx="1.5"></rect><path d="M15 10h4l3 3v4h-7z"></path><circle cx="6" cy="19" r="1.8"></circle><circle cx="17.5" cy="19" r="1.8"></circle></svg>';
  var ICON_ALERT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16.5v.01"></path></svg>';
  var ICON_DOCS =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>';
  var ICON_CLOCK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>';
  var ICON_EDIT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"></path></svg>';

  // Listas de estatus: vienen del servidor (configPanel_ en Code.gs, la página las mete en
  // window.PANEL_CONFIG). Así el panel y la Vista Gerencia usan exactamente las mismas.
  var PANEL_CONFIG = window.PANEL_CONFIG || {};
  var DONE_STATUSES = PANEL_CONFIG.DONE_STATUSES || [];

  function guardarConVerificacion_(onOk, onFail) {
    return google.script.run
      .withSuccessHandler(function (res) {
        if (res && res.ok === false) {
          if (onFail)
            onFail(new Error(res.error || "El servidor rechazó el cambio"));
          return;
        }
        if (onOk) onOk(res);
      })
      .withFailureHandler(function (err) {
        if (onFail) onFail(err);
      });
  }
  var STATUS_OPTIONS = [
    "Cargando",
    "En transito",
    "En yarda MX",
    "Descargando",
    "PTE. ARRIVO",
    "TONU",
    "DELIVERED",
    "En AA",
    "En Yarda US",
    "Patio permisionario",
    "Cancelado.",
    "COMPLETED",
    "(HOS)",
    "Cruzando",
    "EN PLANTA",
    "PATIO MTY",
    "Recolectando",
    "Descompuesta",
    "En resguardo",
  ];
  /** Cada estatus usa colores semánticos del tema, con contraste sobre fondos claros. */
  var STATUS_STYLES = {
    Cargando: ["var(--purple-soft)", "var(--purple)"],
    "En transito": ["var(--good-soft)", "var(--good)"],
    "En yarda MX": ["var(--warn-soft)", "var(--warn)"],
    Descargando: ["var(--brown-soft)", "var(--brown)"],
    "PTE. ARRIVO": ["var(--critical-soft)", "var(--critical)"],
    "Pendiente arrivo": ["var(--critical-soft)", "var(--critical)"],
    TONU: ["var(--critical-soft)", "var(--critical)"],
    DELIVERED: ["var(--good-soft)", "var(--good)"],
    "En AA": ["var(--info-soft)", "var(--info)"],
    "En Yarda US": ["var(--pink-soft)", "var(--pink)"],
    "Patio permisionario": ["var(--warn-soft)", "var(--warn)"],
    "Cancelado.": ["var(--critical-soft)", "var(--critical)"],
    COMPLETED: ["var(--good-soft)", "var(--good)"],
    "(HOS)": ["var(--slate-soft)", "var(--slate)"],
    Cruzando: ["var(--info-soft)", "var(--info)"],
    "EN PLANTA": ["var(--pink-soft)", "var(--pink)"],
    "PATIO MTY": ["var(--brown-soft)", "var(--brown)"],
    Recolectando: ["var(--warn-soft)", "var(--warn)"],
    Descompuesta: ["var(--critical-soft)", "var(--critical)"],
    "En resguardo": ["var(--slate-soft)", "var(--slate)"],
  };

  /** Una carga solo se considera "Entregada" (y se mueve a esa sección) cuando su estatus es Delivered/Completed Y ya se compartió el POD con el cliente. */
  function isDoneStatus(status) {
    var s = statusNorm(status);
    return (
      s === "delivered" ||
      s === "completed" ||
      s === "entregado" ||
      s === "completado"
    );
  }

  function isArchived(rec) {
    return (
      !!rec.archived || window.panelLoadViews.lifecycle(rec) === "delivered"
    );
  }

  /** True cuando el estatus ya es Delivered/Completed pero todavía falta marcar el POD como enviado. */
  function podPending(rec) {
    return isDoneStatus(rec.status) && !rec.pod_sent;
  }

  /** TONU = la carga no se usó. En cuanto se confirma que ya se ingresaron los recargos (cobro)
   * en VG, la carga se considera finalizada y se mueve a la sección "Canceladas/Finalizadas"
   * (no es una entrega real, así que nunca cuenta como "Entregadas"). */
  function isCanceladaFinalizada(rec) {
    return window.panelLoadViews.lifecycle(rec) === "closed";
  }

  /** True cuando el estatus ya es TONU pero todavía falta confirmar que se ingresaron los recargos. */
  function recargosPending(rec) {
    return rec.status === "TONU" && !rec.recargos_vg;
  }

  // Estatus que usan el recordatorio MANUAL del panel: al entrar a cualquiera de estos tres el
  // panel exige programar una fecha a mano (ver openRecordatorioModal). Para Patio
  // permisionario, esa fecha es la fecha estimada de despacho. El aviso es solo visual dentro
  // del panel (no manda correo). Lista: REMINDER_STATUSES_GS de Code.gs.
  var REMINDER_STATUSES = PANEL_CONFIG.REMINDER_STATUSES || [];

  // Estatus con revisión AUTOMÁTICA de intervalo fijo: a diferencia de los de arriba (donde cada
  // quien elige la fecha), aquí la regla es siempre la misma — "En transito" hay que revisarlo
  // (confirmar ubicación, ver si cambió algo) cada AUTO_REVIEW_HOURS horas, forzosamente. Por
  // eso no se abre ningún modal: en cuanto el load entra a este estatus, el panel calcula solo
  // "ahora + AUTO_REVIEW_HOURS horas" (ver el manejador de .status-select), y cada vez que
  // alguien confirma que lo revisó (botón "Ya revisé", ver recordatorioTagHtml), se reinicia el
  // conteo otras AUTO_REVIEW_HOURS horas — así nunca pasa más de ese tiempo sin que alguien lo
  // vuelva a checar mientras siga en tránsito.
  var AUTO_REVIEW_STATUSES = PANEL_CONFIG.AUTO_REVIEW_STATUSES || [];
  var AUTO_REVIEW_HOURS = PANEL_CONFIG.AUTO_REVIEW_HOURS || 3;

  function pd(v) {
    return v ? new Date(v) : null;
  }

  function tieneRecordatorio(status) {
    return (
      REMINDER_STATUSES.indexOf(status) !== -1 ||
      AUTO_REVIEW_STATUSES.indexOf(status) !== -1
    );
  }

  /** True si la carga tiene una revisión pendiente (manual o automática) y ya se cumplió la
   * fecha. Para los de revisión automática, no tener fecha todavía también cuenta como vencido
   * (significa que nunca se ha revisado) — a diferencia de los manuales, donde no tener fecha
   * solo pasa mientras se está programando por primera vez y no se considera vencido. */
  function isRecordatorioVencido(rec) {
    var esAutoReview = AUTO_REVIEW_STATUSES.indexOf(rec.status) !== -1;
    if (!esAutoReview && REMINDER_STATUSES.indexOf(rec.status) === -1)
      return false;
    if (!rec.recordatorio_fecha) return esAutoReview;
    var fecha = new Date(rec.recordatorio_fecha);
    return !isNaN(fecha.getTime()) && fecha.getTime() <= Date.now();
  }

  function esEstatusPlanta_(status) {
    return /^(en\s+)?planta$/i.test(String(status || "").trim());
  }
  function statusStyle(status) {
    var c = STATUS_STYLES[status];
    if (esEstatusPlanta_(status)) c = STATUS_STYLES["EN PLANTA"];
    // Reconocer también la escritura de cargas guardadas antes de esta actualización.
    if (/^(pte\.?|pendiente)\s+arrivo$/i.test(String(status || "").trim()))
      c = STATUS_STYLES["PTE. ARRIVO"];
    if (!c) return "background:var(--surface-2);color:var(--ink-soft);";
    return "background:" + c[0] + ";color:" + c[1] + ";";
  }

  function statusOptionsHtml(current) {
    var opts = STATUS_OPTIONS.slice();
    if (current && opts.indexOf(current) === -1) opts.unshift(current);
    if (!current) opts.unshift(""); // conservar registros anteriores que todavía no tienen estatus
    return opts
      .map(function (s) {
        var label = s === "" ? "Sin estatus" : s;
        return (
          '<option value="' +
          esc(s) +
          '"' +
          (s === current ? " selected" : "") +
          ">" +
          esc(label) +
          "</option>"
        );
      })
      .join("");
  }

  var currentData = [];
  var lastRenderedAt = null;

  function fmtDate(s) {
    return window.panelUsability.formatMoment(s);
  }

  function fmtDateOnly(s) {
    if (!s) return "";
    var str = String(s);
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
    var y, mon, day;
    if (/Z$/.test(str)) {
      var dtz = new Date(str);
      if (isNaN(dtz.getTime())) return "";
      y = dtz.getFullYear();
      mon = months[dtz.getMonth()];
      day = dtz.getDate();
    } else {
      var sep = str.indexOf("T") !== -1 ? "T" : " ";
      var d = str.split(sep)[0].split("-");
      if (d.length < 3) return "";
      y = d[0];
      mon = months[parseInt(d[1], 10) - 1] || d[1];
      day = parseInt(d[2], 10);
    }
    return day + " " + mon + " " + y;
  }

  function computeLoadsPeriod(data) {
    var min = null,
      max = null;
    (data || []).forEach(function (r) {
      if (!r.pickup_appt) return;
      var t = new Date(r.pickup_appt).getTime();
      if (isNaN(t)) return;
      if (min === null || t < min) min = t;
      if (max === null || t > max) max = t;
    });
    if (min === null) return "";
    var minStr = fmtDateOnly(new Date(min).toISOString());
    var maxStr = fmtDateOnly(new Date(max).toISOString());
    return minStr === maxStr ? minStr : minStr + " – " + maxStr;
  }

  var lastImportAt = "";
  var lastImportInfo_ = null;
  function renderOperationMeta() {
    var el = document.getElementById("operation-meta");
    if (!el) return;
    var periodo = computeLoadsPeriod(currentData);
    var html = "";
    html +=
      "<div>Periodo de cargas (pickup): <b>" +
      (periodo ? esc(periodo) : "—") +
      "</b></div>";
    html +=
      "<div>Último Excel importado: <b>" +
      (lastImportAt ? esc(relativeTimeLabel(lastImportAt)) : "sin registro") +
      "</b>" +
      (lastImportInfo_ && lastImportInfo_.fileName
        ? " · " +
          esc(lastImportInfo_.fileName) +
          " · " +
          esc(lastImportInfo_.author || "")
        : "") +
      "</div>";
    el.innerHTML = html;
  }

  function apptDatetimeLocalValue(s) {
    if (!s) return "";
    var str = String(s);
    var pad2 = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    if (/Z$/.test(str)) {
      var dtz = new Date(str);
      if (isNaN(dtz.getTime())) return "";
      return (
        dtz.getFullYear() +
        "-" +
        pad2(dtz.getMonth() + 1) +
        "-" +
        pad2(dtz.getDate()) +
        "T" +
        pad2(dtz.getHours()) +
        ":" +
        pad2(dtz.getMinutes())
      );
    }
    var sep = str.indexOf("T") !== -1 ? "T" : " ";
    var parts = str.split(sep);
    var d = parts[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
    var timeRaw = parts[1] ? parts[1].replace("Z", "").trim() : "";
    var tm = timeRaw.match(/^(\d{1,2}):(\d{1,2})/);
    var time = tm
      ? pad2(parseInt(tm[1], 10)) + ":" + pad2(parseInt(tm[2], 10))
      : "00:00";
    return d + "T" + time;
  }

  function deltaClass(min) {
    if (min === null || min === undefined || min === "") return "neutral";
    var abs = Math.abs(Number(min));
    if (abs <= 20) return "good";
    if (abs <= 90) return "warn";
    return "critical";
  }

  function deltaLabel(min) {
    if (min === null || min === undefined || min === "") return "pendiente";
    var n = Number(min);
    var abs = Math.abs(n);
    var h = Math.floor(abs / 60),
      m = Math.round(abs % 60);
    var txt = (h > 0 ? h + "h " : "") + m + "m";
    return (n < 0 ? "−" : "+") + txt;
  }

  // Estatus que indican un problema real con la carga (no solo el flujo normal esperado).
  var PROBLEM_STATUSES = PANEL_CONFIG.PROBLEM_STATUSES || [];

  // Minutos de retraso (pickup o entrega) a partir de los cuales se considera que la carga
  // necesita atención.
  var ATTENTION_DELAY_MIN = PANEL_CONFIG.ATTENTION_DELAY_MIN || 90;

  // Días sin ningún comentario nuevo en una carga activa y ya iniciada (pickup ya pasó) para
  // considerarla "necesita atención" por falta de seguimiento.
  var ATTENTION_NO_COMMENT_DAYS = 2;

  function needsAttentionReasons(rec) {
    var reasons = [];
    if (DONE_STATUSES.indexOf(rec.status) !== -1) return reasons;
    if (isCanceladaFinalizada(rec)) return reasons;
    if (PROBLEM_STATUSES.indexOf(rec.status) !== -1)
      reasons.push("Estatus con problema: " + rec.status);
    if (isRecordatorioVencido(rec))
      reasons.push("Revisión/recordatorio vencido");
    if (
      rec.pickup_delta_min !== null &&
      rec.pickup_delta_min !== "" &&
      Math.abs(Number(rec.pickup_delta_min)) > ATTENTION_DELAY_MIN
    )
      reasons.push(
        "Retraso de pickup: " +
          Math.round(Math.abs(Number(rec.pickup_delta_min))) +
          " min",
      );
    if (
      rec.delivery_delta_min !== null &&
      rec.delivery_delta_min !== "" &&
      Math.abs(Number(rec.delivery_delta_min)) > ATTENTION_DELAY_MIN
    )
      reasons.push(
        "Retraso de entrega: " +
          Math.round(Math.abs(Number(rec.delivery_delta_min))) +
          " min",
      );
    if (!pickupIsFuture(rec.pickup_appt)) {
      var lc = ultimosComentarios[String(rec.load)];
      var lastTs = lc && lc.ts ? new Date(lc.ts).getTime() : null;
      var cutoff = Date.now() - ATTENTION_NO_COMMENT_DAYS * 24 * 60 * 60 * 1000;
      if (!lastTs) reasons.push("Sin ningún comentario registrado");
      else if (lastTs < cutoff)
        reasons.push(
          "Sin comentarios en " +
            Math.floor((Date.now() - lastTs) / (24 * 60 * 60 * 1000)) +
            "+ días",
        );
    }
    return reasons;
  }
  function needsAttention(rec) {
    return needsAttentionReasons(rec).length > 0;
  }

  function cardBorderClass(rec) {
    // Un color elegido a mano manda sobre el cálculo automático y tiñe toda la tarjeta — las
    // señales de atención siguen visibles por los badges dentro de la tarjeta (recordatorio,
    // POD pendiente, etc).
    if (rec.color) return "s-" + rec.color + " manual-color";
    if (needsAttention(rec)) return "s-critical";
    if (podPending(rec)) return "s-pod-pending";
    if (isCanceladaFinalizada(rec)) return "s-neutral";
    if (isArchived(rec)) {
      if (
        rec.delivery_delta_min !== null &&
        rec.delivery_delta_min !== "" &&
        Math.abs(Number(rec.delivery_delta_min)) > 90
      )
        return "s-warn";
      return "s-good";
    }
    return "s-neutral";
  }

  var CARD_COLOR_OPTS = [
    ["", "Sin color", "neutral"],
    ["critical", "Urgente", "critical"],
    ["warn", "Atención", "warn"],
    ["good", "Resuelto / OK", "good"],
    ["info", "Informativo", "info"],
    ["purple", "Púrpura", "purple"],
    ["teal", "Turquesa", "teal"],
    ["pink", "Rosa", "pink"],
    ["brown", "Café", "brown"],
    ["slate", "Gris", "slate"],
  ];

  function colorSwatchesHtml(rec) {
    var current = rec.color || "";
    return (
      '<div class="color-swatches color-swatches-compact" title="Color de la carga"><span class="color-swatches-label">Color</span>' +
      CARD_COLOR_OPTS.map(function (o) {
        return (
          '<button type="button" class="color-swatch sw-' +
          esc(o[2]) +
          (current === o[0] ? " selected" : "") +
          '" data-set-color-load="' +
          esc(rec.load) +
          '" data-color="' +
          esc(o[0]) +
          '" title="' +
          esc(o[1]) +
          '"></button>'
        );
      }).join("") +
      "</div>"
    );
  }

  var DOC_ITEM_LABELS = {
    bol: "BOL",
    doda: "DODA",
    entry: "Entry",
    sobre_listo: "Sobre listo",
  };
  function docDots(rec) {
    if (rec.sobre_listo) {
      return (
        '<span class="check-ok" data-doc-toggle="sobre_listo" data-doc-load="' +
        esc(rec.load) +
        '" data-tooltip="Clic para desmarcar">&#10003;</span>' +
        '<span class="label-ok" data-doc-toggle="sobre_listo" data-doc-load="' +
        esc(rec.load) +
        '">Ya se puede despachar</span>'
      );
    }
    var items = [
      ["bol", "BOL", rec.bol],
      ["doda", "DODA", rec.doda],
      ["entry", "Entry", rec.entry],
      ["sobre_listo", "Sobre listo", rec.sobre_listo],
    ];
    return (
      items
        .map(function (it) {
          var field = it[0],
            label = it[1],
            val = it[2];
          var manual =
            String(rec[field + "_source"] || "").toUpperCase() === "MANUAL";
          var tip =
            label +
            ": " +
            (val
              ? "listo" + (manual ? " · marcado a mano" : "")
              : "pendiente") +
            " — clic para " +
            (val ? "desmarcar" : "marcar");
          return (
            '<span class="dot ' +
            (val ? "on" : "") +
            '" data-tooltip="' +
            esc(tip) +
            '" data-doc-toggle="' +
            field +
            '" data-doc-load="' +
            esc(rec.load) +
            '"></span>'
          );
        })
        .join("") +
      '<span class="label">' +
      esc(rec.doc_status || "sin doc. status") +
      "</span>"
    );
  }

  function notesHtml(rec) {
    var parts = [];
    if (rec.regresos)
      parts.push(
        '<b style="color:var(--critical);">Regreso:</b> ' + esc(rec.regresos),
      );
    if (!parts.length) return "";
    return (
      '<div class="notes has-content">' +
      parts.join(" &nbsp;·&nbsp; ") +
      "</div>"
    );
  }

  // Registro de currentData con ese número de load (o undefined). Antes esta búsqueda estaba
  // copiada ~20 veces por todo el archivo.
  function recPorLoad_(load) {
    return currentData.filter(function (r) {
      return String(r.load) === String(load);
    })[0];
  }

  /** Si el servidor reinició la revisión de tránsito (comentar o avisar al cliente cuenta como
   * revisar la carga — ver reiniciarRevisionTransito_ en Code.gs), refleja la nueva fecha de
   * inmediato para que el aviso "Revisión de tránsito vencida · cada 3h sin revisar" se quite sin esperar el refresco. */
  function aplicarRevision_(load, res) {
    if (!res || !res.recordatorio_fecha) return;
    var rec = recPorLoad_(load);
    if (!rec) return;
    rec.recordatorio_fecha = res.recordatorio_fecha;
    render(currentData);
    if (workspaceCurrentLoad === String(load)) renderWorkspace();
  }

  function esc(v) {
    return v === null || v === undefined
      ? ""
      : String(v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
  }

  /** Acción de un plazo concreto. Una revisión nunca completa el seguimiento personal. */
  function homeReminderHtml(entry) {
    var r = entry.row;
    var state =
      entry.state === "sinfecha"
        ? "Falta fecha"
        : entry.state === "vencido"
          ? "Vencido"
          : "Programado";
    var when =
      entry.when && !isNaN(Date.parse(entry.when))
        ? (entry.state === "vencido" ? "Venció: " : "Fecha: ") +
          fmtDateTime(entry.when)
        : "Revisa la carga y programa una fecha.";
    var action = "";
    var role = window.panelApi.profile && window.panelApi.profile.role;
    if (role === "admin" || role === "csr") {
      if (entry.kind === "transit")
        action =
          '<button type="button" class="ws-btn" data-recordatorio-revisar="' +
          esc(r.load) +
          '">Ya revisé (+3 h)</button>';
      else if (entry.kind === "status")
        action =
          '<button type="button" class="ws-btn" data-recordatorio-edit="' +
          esc(r.load) +
          '" data-recordatorio-status="' +
          esc(r.status) +
          '">Cambiar fecha</button>';
      else
        action =
          '<button type="button" class="ws-btn" data-home-reminder-complete="' +
          esc(r.load) +
          '">Completar seguimiento</button>';
    }
    return (
      '<div class="ux-reminder-row" data-reminder-kind="' +
      esc(entry.kind) +
      '" data-reminder-load="' +
      esc(r.load) +
      '"><div><div class="ux-reminder-title"><span class="ux-reminder-kind">' +
      esc(entry.label) +
      '</span><span class="ux-state ' +
      esc(entry.state) +
      '">' +
      state +
      '</span></div><div class="ux-reminder-meta">' +
      esc(when) +
      (entry.kind === "transit"
        ? " · Se repite cada 3 horas."
        : " · No se borra al vencer.") +
      (entry.note ? "<br>" + esc(entry.note) : "") +
      '</div></div><div class="ux-reminder-actions">' +
      action +
      "</div></div>"
    );
  }

  /** Contador compatible con los avisos; las acciones se dibujan una sola vez en Inicio. */
  function renderHomeReminders(rows) {
    var entries = window.panelGuidance.reminderEntries(
      rows,
      Date.now(),
      PANEL_CONFIG,
    );
    var due = entries.filter(function (entry) {
      return entry.needsAction;
    });
    var count = document.getElementById("home-recordatorio-count");
    var label =
      due.length +
      " por atender · " +
      (entries.length - due.length) +
      " programados";
    if (count) count.textContent = label;
    var visibleCount = document.getElementById("attention-reminder-count");
    if (visibleCount) visibleCount.textContent = label;
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-home-reminder-complete]");
    if (!button) return;
    var rec = currentData.find(function (row) {
      return row.load === button.getAttribute("data-home-reminder-complete");
    });
    if (!rec) return;
    ensureLoggedIn(function () {
      button.disabled = true;
      guardarConVerificacion_(
        function (result) {
          Object.assign(rec, result);
          rec.next_review_at = "";
          rec.next_review_note = "";
          rec.next_review_by = "";
          render(currentData);
          showToast("Seguimiento completado · Carga " + rec.load, "good");
        },
        function (error) {
          button.disabled = false;
          showToast("No se pudo completar: " + error.message, "error");
        },
      ).clearNextReview(rec.load, myRealIdentity, myPassword);
    });
  });

  /** Tag de recordatorio. Dos variantes:
   * - Manual (Descompuesta / En resguardo / Patio permisionario): muestra la fecha que alguien
   *   programó a mano (o invita a programarla si por algún motivo no tiene) y, si ya se venció,
   *   lo marca en rojo con un botón para reprogramarla.
   * - Automática (En transito): no se programa a mano — muestra cuándo toca la próxima revisión
   *   (o que ya toca revisar, si nunca se ha hecho) y un botón "Ya revisé" que reinicia el
   *   conteo otras AUTO_REVIEW_HOURS horas (ver el manejador de [data-recordatorio-revisar]). */
  function recordatorioTagHtml(rec) {
    if (AUTO_REVIEW_STATUSES.indexOf(rec.status) !== -1) {
      var revisarBtn =
        '<button type="button" data-recordatorio-revisar="' +
        esc(rec.load) +
        '" title="Confirma la revisión y programa otra dentro de 3 horas">Ya revisé (+3 h)</button>';
      if (!rec.recordatorio_fecha) {
        return (
          '<div class="pod-pending-tag tag-critical">&#9200; Pendiente de revisar (ubicación, estatus, etc.) &mdash; ' +
          revisarBtn +
          "</div>"
        );
      }
      if (isRecordatorioVencido(rec)) {
        return (
          '<div class="pod-pending-tag tag-critical" title="Agregar un comentario o registrar un aviso enviado también reinicia las 3 horas">Revisión de tránsito vencida. Fecha: ' +
          fmtDateTime(rec.recordatorio_fecha) +
          " &mdash; " +
          revisarBtn +
          ' <span style="font-weight:400;opacity:.8">o comenta / avisa al cliente</span></div>'
        );
      }
      return (
        '<div class="recordatorio-tag">Revisión de tránsito (cada 3 h): ' +
        fmtDateTime(rec.recordatorio_fecha) +
        " " +
        revisarBtn +
        "</div>"
      );
    }
    var label =
      rec.status === "Patio permisionario"
        ? "Despacho estimado"
        : "Recordatorio";
    var editBtn =
      '<button type="button" data-recordatorio-edit="' +
      esc(rec.load) +
      '" data-recordatorio-status="' +
      esc(rec.status) +
      '">';
    if (!rec.recordatorio_fecha) {
      return (
        '<div class="pod-pending-tag tag-critical">Falta programar recordatorio &mdash; ' +
        editBtn +
        "programar</button></div>"
      );
    }
    if (isRecordatorioVencido(rec)) {
      return (
        '<div class="pod-pending-tag tag-critical">&#9200; ' +
        label +
        " vencido (" +
        fmtDateTime(rec.recordatorio_fecha) +
        ") &mdash; " +
        editBtn +
        "reprogramar</button></div>"
      );
    }
    return (
      '<div class="recordatorio-tag">' +
      label +
      ": " +
      fmtDateTime(rec.recordatorio_fecha) +
      " " +
      editBtn +
      "editar</button></div>"
    );
  }

  function showToast(message, type) {
    if (
      type !== "error" &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(
        (document.activeElement || {}).tagName || "",
      )
    ) {
      window.dispatchEvent(
        new CustomEvent("panel:notice", { detail: { message: message } }),
      );
      return;
    }
    var container = document.getElementById("toast-container");
    if (!container) return;
    var el = document.createElement("div");
    el.className = "toast" + (type ? " toast-" + type : "");
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add("show");
    });
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () {
        el.remove();
      }, 250);
    }, 2800);
  }

  var DESHACER_MS = 6000;
  var accionesConDeshacer_ = {},
    accionesConDeshacerSeq_ = 0;
  function accionConDeshacer_(mensaje, commit, revertir) {
    var id = ++accionesConDeshacerSeq_,
      terminado = false,
      timer;
    window.panelUsability.pendingChange(id, true);
    var container = document.getElementById("toast-container");
    var el = document.createElement("div");
    el.className = "toast toast-undo";
    var txt = document.createElement("span");
    txt.textContent = mensaje;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-undo-btn";
    btn.textContent = "Deshacer";
    el.appendChild(txt);
    el.appendChild(btn);
    if (container) {
      container.appendChild(el);
      requestAnimationFrame(function () {
        el.classList.add("show");
      });
    }
    function quitarAviso() {
      el.classList.remove("show");
      setTimeout(function () {
        el.remove();
      }, 250);
    }
    function ejecutar() {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      delete accionesConDeshacer_[id];
      window.panelUsability.pendingChange(id, false);
      quitarAviso();
      commit();
    }
    btn.addEventListener("click", function () {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      delete accionesConDeshacer_[id];
      window.panelUsability.pendingChange(id, false);
      quitarAviso();
      revertir();
      showToast("Cambio deshecho", "good");
    });
    accionesConDeshacer_[id] = ejecutar;
    timer = setTimeout(ejecutar, DESHACER_MS);
  }
  function flushAccionesConDeshacer_() {
    var pendientesIds = Object.keys(accionesConDeshacer_);
    pendientesIds.forEach(function (k) {
      if (accionesConDeshacer_[k]) accionesConDeshacer_[k]();
    });
    return pendientesIds.length;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushAccionesConDeshacer_();
  });
  window.addEventListener("beforeunload", function (e) {
    // Se manda lo pendiente y se pide confirmación de salida para darle tiempo a la llamada.
    if (flushAccionesConDeshacer_()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /** Copia el número de load al portapapeles (doble clic sobre el load, en tabla o tarjeta). */
  function copyLoadToClipboard(load) {
    copyTextGeneric(load, "Carga " + load + " copiado");
  }

  function copyTextGeneric(text, successMessage) {
    function ok() {
      showToast(successMessage || "Texto copiado", "good");
    }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = String(text || "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var yes = document.execCommand("copy");
        ta.remove();
        if (yes) ok();
        else showToast("No se pudo copiar", "error");
      } catch (e) {
        showToast("No se pudo copiar", "error");
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(String(text || "")).then(ok, fallback);
    else fallback();
  }

  /** Texto relativo tipo "hace 22 min" / "hace 3h" para la línea de "última actualización" —
   * si ya pasó más de un día, cae a la fecha absoluta (fmtDateTime) porque "hace 2 días" ya no
   * es tan útil como saber exactamente cuándo fue. */
  function relativeTimeLabel(d) {
    if (!d) return "";
    var dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return "";
    var minutos = Math.round((Date.now() - dt.getTime()) / 60000);
    if (minutos < 1) return "justo ahora";
    if (minutos < 60) return "hace " + minutos + " min";
    var horas = Math.round(minutos / 60);
    if (horas < 24) return "hace " + horas + "h";
    return fmtDateTime(dt);
  }

  /** Línea de "última actualización: quién y cuándo" — solo se muestra si ya hay algo registrado
   * (updated_by empieza a llenarse a partir de que el login individual reemplazó al PIN; cargas
   * viejas sin ese dato no muestran la línea en vez de mostrar "por nadie"). */
  function updatedLineHtml(rec) {
    if (!rec.updated_at || !rec.updated_by) return "";
    return (
      '<div class="updated-line">Última actualización: <b>' +
      esc(relativeTimeLabel(rec.updated_at)) +
      "</b> por <b>" +
      esc(rec.updated_by) +
      "</b></div>"
    );
  }

  /** Banner de alerta automática con cuenta regresiva a la cita de entrega — mismo cálculo que ya
   * corre en getLoads() (server), aquí solo se le da forma visual + countdown en vivo. El
   * countdown se recalcula en refreshAlertCountdowns(), llamado junto con autoRefresh. */
  function alertBannerHtml(rec) {
    if (!rec.alertLevel || rec.alertLevel === "good") return "";
    var icon = rec.alertLevel === "critical" ? "⚠️ " : "🟡 ";
    return (
      '<div class="alert-banner-mini l-' +
      esc(rec.alertLevel) +
      '" data-alert-target="' +
      esc(rec.delivery_appt || "") +
      '">' +
      '<span class="alert-msg">' +
      icon +
      esc(rec.alertMessage) +
      "</span>" +
      '<span class="alert-countdown"></span>' +
      "</div>"
    );
  }

  /** Texto del botón "Incidencias", con el contador de incidencias abiertas si hay alguna —
   * evita tener que abrir el modal solo para saber si hay algo pendiente ahí. */
  function incidenciasBtnLabel(rec) {
    var n = Number(rec.incidenciasCount) || 0;
    return (
      "Incidencias" +
      (n > 0 ? ' <span class="badge-count">' + n + "</span>" : "")
    );
  }

  /** Recalcula el texto de cuenta regresiva de todos los banners de alerta visibles ahorita mismo
   * (".alert-countdown"), a partir de la cita de entrega guardada en data-alert-target. Se llama
   * después de cada render() y junto con autoRefresh — no hace falta un timer aparte, cada minuto
   * de diferencia visual es más que suficiente para esto. */
  function refreshAlertCountdowns() {
    document
      .querySelectorAll(".alert-banner-mini[data-alert-target]")
      .forEach(function (el) {
        var raw = el.getAttribute("data-alert-target");
        var span = el.querySelector(".alert-countdown");
        if (!span) return;
        if (!raw) {
          span.textContent = "";
          return;
        }
        var target = new Date(raw);
        if (isNaN(target.getTime())) {
          span.textContent = "";
          return;
        }
        var diffMin = Math.round((target.getTime() - Date.now()) / 60000);
        if (diffMin >= 0) {
          var h = Math.floor(diffMin / 60),
            m = diffMin % 60;
          span.textContent = "faltan " + (h > 0 ? h + "h " : "") + m + "m";
        } else {
          var atrasoMin = -diffMin;
          var ah = Math.floor(atrasoMin / 60),
            am = atrasoMin % 60;
          span.textContent = "atrasado " + (ah > 0 ? ah + "h " : "") + am + "m";
        }
      });
  }

  function clientCommunicationHtml(rec) {
    if (PANEL_CONFIG.INTERNAL_ONLY && !PANEL_CONFIG.MANUAL_CLIENT_MESSAGES)
      return "";
    if (rec.client_notify_pending) {
      return (
        '<div class="client-notify-bar">' +
        '<div class="client-notify-main">' +
        '<div class="client-notify-title">⚠ Cliente pendiente de notificar</div>' +
        '<div class="client-notify-reason">' +
        notifyReasonRows(rec.client_notify_reason) +
        "</div>" +
        "</div>" +
        '<button type="button" class="client-notify-btn" data-client-notified-load="' +
        esc(rec.load) +
        '">Marcar notificado</button>' +
        "</div>"
      );
    }
    if (rec.client_notified_at) {
      return (
        '<div class="client-notified-line">✓ Cliente notificado ' +
        esc(relativeTimeLabel(rec.client_notified_at)) +
        (rec.client_notified_by
          ? " por <b>" + esc(rec.client_notified_by) + "</b>"
          : "") +
        "</div>"
      );
    }
    return "";
  }

  // Para "Deshacer"/reversa de un cambio de estatus: guarda y restaura los campos que toca el
  // cambio (estatus, recordatorio y el "pendiente avisar al cliente" que pone setLocalNotifyPending).
  // restoreStatusFields_ busca el registro por load al momento de restaurar — si un autoRefresh
  // reemplazó el objeto mientras tanto, se restaura sobre el objeto vigente.
  var STATUS_UNDO_FIELDS_ = [
    "status",
    "recordatorio_fecha",
    "client_notify_pending",
    "client_notify_reason",
    "client_notified_at",
    "client_notified_by",
    "client_notify_since",
  ];
  function snapshotStatusFields_(rec) {
    var snap = {};
    if (rec)
      STATUS_UNDO_FIELDS_.forEach(function (f) {
        snap[f] = rec[f];
      });
    return snap;
  }
  function restoreStatusFields_(load, snap) {
    var rec = recPorLoad_(load);
    if (rec)
      STATUS_UNDO_FIELDS_.forEach(function (f) {
        if (f in snap) rec[f] = snap[f];
      });
    render(currentData);
    if (workspaceCurrentLoad === String(load)) renderWorkspace();
  }

  function setLocalNotifyPending(rec, reason) {
    if (PANEL_CONFIG.INTERNAL_ONLY && !PANEL_CONFIG.MANUAL_CLIENT_MESSAGES)
      return;
    if (!rec) return;
    rec.client_notify_pending = true;
    rec.client_notify_since = new Date().toISOString();
    rec.client_notify_reason = reason || "Actualización operativa";
    rec.client_notified_at = "";
    rec.client_notified_by = "";
  }

  function cardHtml(rec) {
    var pdC = deltaClass(rec.pickup_delta_min);
    var ddC = deltaClass(rec.delivery_delta_min);
    return (
      '<article class="card ' +
      esc(cardBorderClass(rec)) +
      '" data-load="' +
      esc(rec.load) +
      '" data-customer="' +
      esc((rec.customer || "").toLowerCase()) +
      '" data-city="' +
      esc(
        ((rec.origin_city || "") + " " + (rec.dest_city || "")).toLowerCase(),
      ) +
      '" data-status="' +
      esc(rec.status) +
      '" data-punctual="' +
      !!rec.punctual_pending +
      '" data-attention="' +
      needsAttention(rec) +
      '" data-pod="' +
      !!rec.pod_sent +
      '" data-recargos="' +
      !!rec.recargos_vg +
      '" data-pickup="' +
      esc(rec.pickup_appt) +
      '" data-truck="' +
      esc((rec.truck || "").toLowerCase()) +
      '" data-trailer="' +
      esc((rec.trailer || "").toLowerCase()) +
      '" data-cruce="' +
      esc(rec.cruce_usa_fecha) +
      '" data-extra="' +
      esc(textoBusqueda_(rec).toLowerCase()) +
      '">' +
      '<div class="card-top">' +
      "<div>" +
      '<span class="load-id">Carga <span class="t-load-num" data-load-copy="' +
      esc(rec.load) +
      '" title="Doble clic para copiar">' +
      esc(rec.load) +
      '</span></span> - <span class="customer">' +
      esc(rec.customer) +
      "</span>" +
      (rec.punctual_pending
        ? '<span class="punctual-badge" title="' +
          esc(rec.punctual_note) +
          '">Pendiente puntual</span>'
        : "") +
      (rec.client_notify_pending
        ? '<span class="notify-badge">Cliente pendiente</span>'
        : "") +
      '<div class="route">' +
      esc(rec.origin_city) +
      ", " +
      esc(rec.origin_state) +
      ' <span class="arrow">&rarr;</span> ' +
      esc(rec.dest_city) +
      ", " +
      esc(rec.dest_state) +
      "</div>" +
      (podPending(rec)
        ? '<div class="pod-pending-tag">POD pendiente</div>'
        : "") +
      (recargosPending(rec)
        ? '<div class="pod-pending-tag">Falta ingresar recargos en VG</div>'
        : "") +
      (tieneRecordatorio(rec.status) ? recordatorioTagHtml(rec) : "") +
      "</div>" +
      '<select class="status-select" aria-label="Estatus de la carga ' +
      esc(rec.load) +
      '" data-status-load="' +
      esc(rec.load) +
      '" style="' +
      statusStyle(rec.status) +
      '">' +
      statusOptionsHtml(rec.status) +
      "</select>" +
      "</div>" +
      alertBannerHtml(rec) +
      clientCommunicationHtml(rec) +
      '<div class="card-commitment"><span>Truck: ' +
      esc(
        [rec.truck, rec.trailer].filter(Boolean).join(" / ") || "Sin asignar",
      ) +
      window.panelSignals.signalStrip(rec.load, rec.logistics_signals) +
      "</span><span>Entrega: " +
      esc(
        rec.delivery_appt
          ? fmtDateTime(rec.delivery_appt)
          : "Sin fecha programada",
      ) +
      '</span></div><details class="card-extra"><summary>Más detalles y edición</summary>' +
      '<div class="card-mid">' +
      '<div class="field"><div class="k">Cita de recolección</div><input class="v field-input" type="datetime-local" value="' +
      apptDatetimeLocalValue(rec.pickup_appt) +
      '" data-pickup-appt-load="' +
      esc(rec.load) +
      '"><div class="delta-line"><span class="delta d-' +
      pdC +
      '">' +
      deltaLabel(rec.pickup_delta_min) +
      "</span></div></div>" +
      '<div class="field"><div class="k">Entrega cita</div><input class="v field-input" type="datetime-local" value="' +
      apptDatetimeLocalValue(rec.delivery_appt) +
      '" data-delivery-appt-load="' +
      esc(rec.load) +
      '"><div class="delta-line"><span class="delta d-' +
      ddC +
      '">' +
      deltaLabel(rec.delivery_delta_min) +
      "</span></div></div>" +
      '<div class="field f-truck"><div class="k">Truck</div><input class="v field-input" type="text" placeholder="—" value="' +
      esc(rec.truck) +
      '" data-truck-load="' +
      esc(rec.load) +
      '"></div>' +
      '<div class="field f-trailer"><div class="k">Trailer</div><input class="v field-input" type="text" placeholder="—" value="' +
      esc(rec.trailer) +
      '" data-trailer-load="' +
      esc(rec.load) +
      '"></div>' +
      '<div class="field"><div class="k">Documentación</div><div class="docs">' +
      docDots(rec) +
      "</div></div>" +
      "</div>" +
      notesHtml(rec) +
      '<div class="pod-row">' +
      '<label class="pod-check">' +
      '<input type="checkbox" data-pod-load="' +
      esc(rec.load) +
      '"' +
      (rec.pod_sent ? " checked" : "") +
      ">" +
      "<span>POD registrado</span>" +
      "</label>" +
      "</div>" +
      (rec.status === "TONU"
        ? '<div class="pod-row">' +
          '<label class="pod-check">' +
          '<input type="checkbox" data-recargos-load="' +
          esc(rec.load) +
          '"' +
          (rec.recargos_vg ? " checked" : "") +
          ">" +
          "<span>Recargos ya ingresados en VG</span>" +
          "</label>" +
          "</div>"
        : "") +
      updatedLineHtml(rec) +
      "</details>" +
      '<div class="comments-row">' +
      '<button type="button" class="workspace-open-btn" data-workspace-load="' +
      esc(rec.load) +
      '">Abrir expediente</button>' +
      '<button type="button" class="comments-btn" data-comments-load="' +
      esc(rec.load) +
      '">Comentarios</button>' +
      '<button type="button" class="incidencias-btn" data-incidencias-load="' +
      esc(rec.load) +
      '">' +
      incidenciasBtnLabel(rec) +
      "</button>" +
      '<details class="card-secondary-actions"><summary>Más acciones</summary><div class="ux-advanced-content">' +
      '<button type="button" class="incidencias-btn" data-create-task-load="' +
      esc(rec.load) +
      '">Crear tarea</button>' +
      colorSwatchesHtml(rec) +
      "</div></details>" +
      "</div>" +
      "</article>"
    );
  }

  // Solo se construye el HTML (pesado) de la vista que está visible en este momento;
  // la otra queda marcada como "pendiente" y se construye hasta que el usuario cambie a
  // ella. Evita dibujar el doble de tarjetas/filas en cada carga o cada edición.
  var viewDirty = { cards: true, table: true };

  // ---- Redibujado incremental (solo lo que realmente cambió) ----
  // Antes, cada actualización (autoRefresh cada 60s, o cualquier guardado optimista: estatus,
  // POD, recargos, color…) volvía a reconstruir TODO el HTML de la tabla/tarjetas/listas y a
  // reemplazarlo de golpe, aunque casi nada hubiera cambiado — eso significa reflow/repintado
  // del navegador sobre cientos de nodos por cada actualización. Ahora, para cada contenedor
  // (tabla, cada sección de tarjetas, pendientes, bitácora) se guarda el HTML que se dibujó por
  // último para cada elemento (por su "key" — el load, el id del pendiente, etc.). Si el orden
  // de los elementos no cambió, se compara elemento por elemento y solo se toca el DOM del que
  // de verdad cambió de contenido — el resto ni se vuelve a tocar. Si el orden sí cambió
  // (se agregó/quitó/reordenó algo — poco frecuente), se reconstruye ese contenedor completo,
  // igual que antes: es lo más simple y seguro para un caso raro, y no vale la pena complicar
  // el código para optimizar algo que casi no pasa. Como los eventos ya están delegados en
  // document (ver wireDelegatedEventsOnce), un elemento nuevo o reemplazado ya "funciona" solo,
  // sin necesitar reconectar nada.
  var lastRenderState = {}; // containerId -> { order: [keys], html: {key: htmlString} }

  function resetRenderState(containerId) {
    delete lastRenderState[containerId];
    window.panelRendering.reset(document.getElementById(containerId));
  }

  function diffRenderContainer(containerId, records, keyFn, htmlFn, opts) {
    window.panelRendering.renderKeyed(
      document.getElementById(containerId),
      records,
      keyFn,
      htmlFn,
      opts,
    );
  }

  function loadKeyFn(rec) {
    return String(rec.load);
  }

  function buildCardsView() {
    var cancelada = currentData.filter(function (r) {
      return window.panelLoadViews.lifecycle(r) === "closed";
    });
    var resto = currentData.filter(function (r) {
      return window.panelLoadViews.lifecycle(r) !== "closed";
    });
    var active = resto.filter(function (r) {
      return !isArchived(r);
    });
    var done = resto.filter(isArchived);
    diffRenderContainer("cards-active", active, loadKeyFn, cardHtml);
    diffRenderContainer("cards-done", done, loadKeyFn, cardHtml);
    diffRenderContainer("cards-cancelada", cancelada, loadKeyFn, cardHtml);
    viewDirty.cards = false;
  }

  function buildTableView() {
    renderTable(currentData);
    viewDirty.table = false;
  }
