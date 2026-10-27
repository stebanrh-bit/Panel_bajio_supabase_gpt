  var AVISO_POSPONER_MS_ = 3600000; // "Posponer 1 h"
  var AVISOS_MAX_ = 80;
  var avisosEstado_ = null;
  var personalNoticeGroups_ = new Map();
  var personalNoticeState_ = new Map();
  function avisoIds_(id) {
    return personalNoticeGroups_.get(id) || [id];
  }
  function syncAvisos_(changes) {
    window.panelPersonal.syncNoticeState(changes).catch(function (error) {
      showToast(error.message, "error");
    });
  }
  window.addEventListener("panel:notice-state", function (event) {
    personalNoticeState_ = new Map(
      (event.detail || []).map(function (row) {
        return [row.event_key, row];
      }),
    );
    if (!avisosEstado_) return;
    avisosEstado_.lista.forEach(function (a) {
      var state = personalNoticeState_.get(a.id);
      if (state && state.read_at) a.nuevo = false;
    });
    personalNoticeState_.forEach(function (state, key) {
      if (state.snoozed_until)
        avisosEstado_.pospuestos[key] = Date.parse(state.snoozed_until);
    });
    guardarAvisos_();
    renderAvisos_();
  });
  window.addEventListener("panel:save", function (event) {
    if (event.detail?.phase === "reset") {
      personalNoticeState_.clear();
      personalNoticeGroups_.clear();
    }
  });
  var bitacoraCargada_ = false;
  var avisosTimer_ = null;
  var avisosSonido_ = false;
  try {
    avisosSonido_ = localStorage.getItem("bajio_avisos_sonido") === "1";
  } catch (e) {}

  function avisosKey_() {
    return "bajio_avisos_" + myRealIdentity;
  }
  function cargarAvisos_() {
    try {
      var s = JSON.parse(localStorage.getItem(avisosKey_()) || "null");
      if (s && s.lista && s.activos && s.base) {
        s.pospuestos = s.pospuestos || {};
        return s;
      }
    } catch (e) {}
    return { base: {}, activos: {}, lista: [], pospuestos: {} };
  }
  function guardarAvisos_() {
    try {
      localStorage.setItem(
        avisosKey_(),
        JSON.stringify({
          base: avisosEstado_.base,
          activos: avisosEstado_.activos,
          lista: avisosEstado_.lista,
          pospuestos: avisosEstado_.pospuestos,
        }),
      );
    } catch (e) {}
  }

  function avisoLoad_(rec) {
    return "Carga " + rec.load + (rec.customer ? " · " + rec.customer : "");
  }

  /** Todo lo que hoy amerita un aviso, con un id estable (mismo motivo = mismo id). */
  var serverAlerts_ = [];
  function candidatosAvisos_() {
    // La campana pertenece a la sesión real, incluso al consultar otro CSR o toda la operación.
    var scope = window.panelNotices.customerNoticeScope(
      myRealIdentity,
      asignaciones,
      currentData,
    );
    var tasks = new Map(
      (bitacora || []).map(function (item) {
        return [String(item.id), item];
      }),
    );
    var out = serverAlerts_
        .filter(function (a) {
          if (a.task_id) {
            var currentTask = tasks.get(String(a.task_id));
            return (
              !!currentTask &&
              scope.hasTask(currentTask) &&
              window.panelTaskTime.taskReminderDue(currentTask)
            );
          }
          if (a.load) return scope.hasLoad(a.load);
          var task = tasks.get(String(a.task_id));
          return !!task && scope.hasTask(task);
        })
        .map(function (a) {
          var scheduledTask = tasks.get(String(a.task_id));
          return {
            id: "server:" + a.id,
            tipo: "server",
            sev: a.kind === "escalation" ? "critical" : "warn",
            load: a.load || "",
            taskId: a.task_id || "",
            destino: a.kind === "load_review" ? "carga" : "bitacora",
            titulo: a.message,
            detalle:
              a.kind === "load_review"
                ? "Revisión pendiente · abre esta carga para atenderla"
                : scheduledTask
                  ? "Programada: " +
                    fmtDateTime(scheduledTask.fecha_seguimiento) +
                    " · abre su detalle para continuar"
                  : "Tarea pendiente · abre su detalle para continuar",
            ts: a.created_at,
          };
        }),
      ahora = Date.now(),
      yo = myRealIdentity;
    var activas = (currentData || []).filter(function (rec) {
      return (
        scope.hasLoad(rec.load) &&
        !isArchived(rec) &&
        !isCanceladaFinalizada(rec) &&
        !isCancelledStatus(rec.status)
      );
    });
    activas
      .filter(function (rec) {
        return journeyBucket(journeyReasons(rec)) === "now";
      })
      .forEach(function (rec) {
        if (rec.updated_by === yo) return;
        var rs = journeyReasons(rec);
        // Si lo que la manda a "Atender ahora" es el cliente pendiente de avisar, ya lo cubre el
        // aviso de comunicación de abajo — no se duplica.
        if (rs.length && rs[0].kind === "notify" && rec.client_notify_pending)
          return;
        out.push({
          // Cada cambio operativo remoto constituye un evento nuevo; leer uno no silencia los siguientes.
          id: "now:" + rec.load + ":" + String(rec.updated_at || rec.status),
          tipo: "now",
          sev: "critical",
          load: rec.load,
          tab: "operacion",
          titulo: "Atender ahora · " + avisoLoad_(rec),
          detalle: rs.length ? rs[0].text : "Requiere acción inmediata",
        });
      });
    activas.forEach(function (rec) {
      var instruction = window.panelInstructionUI.instructionNotice(rec, ahora);
      if (instruction) out.push(instruction);
      var motivo = String(
        rec.client_notify_reason || "Actualización operativa",
      );
      if (rec.client_notify_pending && rec.updated_by !== yo) {
        out.push({
          id: "com:" + rec.load + ":" + motivo,
          tipo: "com",
          sev: "warn",
          load: rec.load,
          tab: "comunicacion",
          titulo: "Cliente pendiente de avisar · " + avisoLoad_(rec),
          detalle: motivo,
        });
      }
      if (
        rec.client_notify_pending &&
        hoursSince(rec.client_notify_since || rec.updated_at) >= 1
      ) {
        out.push({
          id: "com60:" + rec.load + ":" + motivo,
          tipo: "com60",
          sev: "critical",
          load: rec.load,
          tab: "comunicacion",
          titulo: "Cliente sin avisar hace más de 1 h · " + avisoLoad_(rec),
          detalle: motivo,
        });
      }
      var rev = pd(rec.next_review_at);
      if (rev && !isNaN(rev.getTime()) && rev.getTime() <= ahora) {
        out.push({
          id: "rev:" + rec.load + ":" + rec.next_review_at,
          tipo: "rev",
          sev: "warn",
          load: rec.load,
          tab: "operacion",
          titulo: "Hora de revisar · " + avisoLoad_(rec),
          detalle: rec.next_review_note || "Próxima revisión programada",
        });
      }
      if (isRecordatorioVencido(rec)) {
        out.push({
          id:
            "rec:" +
            rec.load +
            ":" +
            (rec.recordatorio_fecha || "sin-fecha") +
            ":" +
            rec.status,
          tipo: "rec",
          sev: "warn",
          load: rec.load,
          tab: "operacion",
          transito: AUTO_REVIEW_STATUSES.indexOf(rec.status) !== -1,
          titulo:
            (AUTO_REVIEW_STATUSES.indexOf(rec.status) !== -1
              ? "Revisión de tránsito pendiente · "
              : "Recordatorio vencido · ") + avisoLoad_(rec),
          detalle:
            (rec.status || "") +
            (rec.recordatorio_fecha
              ? " · " + fmtDateTime(rec.recordatorio_fecha)
              : " · sin fecha programada"),
        });
      }
      var ent = pd(rec.delivery_appt);
      if (
        ent &&
        !isNaN(ent.getTime()) &&
        ent.getTime() > ahora &&
        ent.getTime() - ahora <= 2 * 3600000 &&
        Number(rec.stageIndex) < 7
      ) {
        out.push({
          id: "ent:" + rec.load + ":" + rec.delivery_appt,
          tipo: "ent",
          sev: "critical",
          load: rec.load,
          tab: "operacion",
          titulo: "Entrega en menos de 2 h · " + avisoLoad_(rec),
          detalle: "Cita " + fmtDateTime(ent) + " y todavía no llega a planta",
        });
      }
    });
    (bitacora || []).forEach(function (b) {
      if (b.resuelto || b.cancelado || !scope.hasTask(b)) return;
      var nota = String(b.nota || "").slice(0, 120);
      // Una tarea programada avisa al vencer, incluso si la creó otra persona.
      if (
        !b.fecha_seguimiento &&
        bitacoraCargada_ &&
        b.creado_por &&
        b.creado_por !== yo
      ) {
        out.push({
          id: "bit:" + b.id,
          taskId: b.id,
          tipo: "bit",
          sev: "info",
          destino: "bitacora",
          titulo: "Nuevo pendiente de turno de " + b.creado_por,
          detalle: nota,
        });
      }
      if (
        window.panelTaskTime.taskReminderDue(b, ahora) &&
        !out.some(function (a) {
          return String(a.taskId) === String(b.id);
        })
      ) {
        out.push({
          id: "bitseg:" + b.id + ":" + b.fecha_seguimiento,
          taskId: b.id,
          tipo: "bitseg",
          sev: "warn",
          destino: "bitacora",
          titulo: "Hora de atender tu tarea",
          detalle: nota + " · Programada: " + fmtDateTime(b.fecha_seguimiento),
        });
      }
    });
    apartados.forEach(function (ap) {
      if (apartadoCerrado_(ap) || !scope.hasReservation(ap)) return;
      var base = {
        destino: "apartados",
        apartado: ap.id,
        estado: ap.estado,
        frecuencia: ap.frecuencia_horas,
      };
      var detalle = [
        ap.csr_dueno ? "CSR en VG " + ap.csr_dueno : "",
        ap.destino,
        ap.mi_carga ? "Mi carga: " + ap.mi_carga : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (apartadoVencido_(ap)) {
        out.push(
          Object.assign(
            {
              id: "apr:" + ap.id + ":" + ap.proxima_revision,
              tipo: "apr",
              sev: ap.estado === "broker" ? "critical" : "warn",
              titulo:
                "Carga apartado " +
                ap.load +
                " · " +
                (APARTADO_PREGUNTA_[ap.estado] || "Revisar"),
              detalle: detalle,
            },
            base,
          ),
        );
      }
      if (apartadoMiCargaEnRiesgo_(ap)) {
        out.push(
          Object.assign(
            {
              id: "apmia:" + ap.id + ":" + ap.fecha_mi_carga + ":" + ap.estado,
              tipo: "apmia",
              sev: "critical",
              titulo:
                "Tu carga es pronto y el apartado " +
                ap.load +
                " no ha entregado",
              detalle:
                "Mi carga: " +
                fmtDateTime(ap.fecha_mi_carga) +
                (ap.mi_carga ? " · " + ap.mi_carga : "") +
                " — ¿lo cambias a broker?",
            },
            base,
          ),
        );
      }
    });
    // Los clientes sin asignación se consultan en Administración; no son avisos personales.
    return PANEL_CONFIG.INTERNAL_ONLY
      ? out.filter(function (a) {
          return a.tipo !== "com" && a.tipo !== "com60" && a.tipo !== "sla";
        })
      : out;
  }

  function programarAvisos_() {
    if (avisosTimer_) clearTimeout(avisosTimer_);
    avisosTimer_ = setTimeout(detectarAvisos_, 400);
  }

  function detectarAvisos_() {
    avisosTimer_ = null;
    if (!myRealIdentity || !lastLoadsFetchTs) return; // sin sesión o sin cargas todavía
    if (!avisosEstado_ || avisosEstado_.usuario !== myRealIdentity) {
      avisosEstado_ = cargarAvisos_();
      avisosEstado_.usuario = myRealIdentity;
    }
    var est = avisosEstado_,
      vigentes = {},
      nuevos = [],
      ahoraMs = Date.now();
    est.pospuestos = est.pospuestos || {};
    candidatosAvisos_().forEach(function (c) {
      if (vigentes[c.id]) return;
      vigentes[c.id] = c;
      var remote = personalNoticeState_.get(c.id);
      var hasta = remote?.snoozed_until
        ? Date.parse(remote.snoozed_until)
        : est.pospuestos[c.id];
      if (hasta) {
        if (hasta > ahoraMs) return; // sigue pospuesto: ni en la lista ni como nuevo
        delete est.pospuestos[c.id]; // se cumplió la hora: se vuelve a avisar
        delete est.activos[c.id];
      }
      if (est.activos[c.id]) return; // ya se avisó antes
      if (AVISO_EVENTO_[c.tipo] && !est.base[c.tipo]) return; // primera vez: lo existente cuenta como visto
      nuevos.push(c);
    });
    est.base.now = true;
    est.base.com = true;
    if (bitacoraCargada_) est.base.bit = true;
    if (puedeVerTodo_()) est.base.sincsr = true;
    est.activos = {};
    Object.keys(vigentes).forEach(function (id) {
      est.activos[id] = true;
    });
    Object.keys(est.pospuestos).forEach(function (id) {
      if (!vigentes[id]) delete est.pospuestos[id];
    });
    var ts = new Date().toISOString();
    // Los avisos que siguen vigentes se refrescan con los datos actuales (texto, acciones), conservando
    // cuándo llegaron y si ya se vieron.
    est.lista = est.lista
      .filter(function (a) {
        return vigentes[a.id] && !(est.pospuestos[a.id] > ahoraMs);
      })
      .map(function (a) {
        var c = vigentes[a.id];
        c.ts = a.ts;
        c.nuevo = a.nuevo;
        return c;
      });
    nuevos.forEach(function (c) {
      c.ts = ts;
      c.nuevo = !personalNoticeState_.get(c.id)?.read_at;
      est.lista.unshift(c);
    });
    if (est.lista.length > AVISOS_MAX_) est.lista.length = AVISOS_MAX_;
    guardarAvisos_();
    renderAvisos_();
    badgeApartados_(); // el conteo de "toca revisar" cambia con la hora, no solo con los datos
    var unread = nuevos.filter(function (a) {
      return a.nuevo;
    });
    if (unread.length) anunciarAvisos_(unread);
    mostrarInicioTurno_();
  }

  /** Botones de acción directa para cada aviso (ver avisos-lista): resolver sin abrir la carga. */
  function accionesAviso_(a) {
    var acc = [];
    if (a.tipo === "com" || a.tipo === "com60")
      acc.push(["avisado", "Ya avisé al cliente"]);
    if (a.tipo === "rev") acc.push(["revisado", "Ya revisé"]);
    if (a.tipo === "rec" && a.transito)
      acc.push(["transito", "Ya revisé (+" + AUTO_REVIEW_HOURS + " h)"]);
    if (a.tipo === "apr") {
      (APARTADO_AVANCES_[a.estado] || []).forEach(function (x) {
        acc.push(["ap:" + x[0], x[1]]);
      });
      acc.push(["ap:revisar", "Ya revisé (+" + a.frecuencia + " h)"]);
    }
    if (a.tipo === "apmia") acc.push(["ap:broker", "Cambiar a broker"]);
    if (!AVISO_EVENTO_[a.tipo]) acc.push(["posponer", "Ocultar aviso 1 h"]);
    return acc
      .map(function (x) {
        return (
          '<button type="button" class="ws-btn" data-aviso-accion="' +
          esc(x[0]) +
          '">' +
          esc(x[1]) +
          "</button>"
        );
      })
      .join("");
  }

  function quitarAviso_(id, posponer) {
    if (!avisosEstado_) return;
    var ids = posponer ? avisoIds_(id) : [id];
    if (posponer) {
      ids.forEach(function (key) {
        avisosEstado_.pospuestos[key] = Date.now() + AVISO_POSPONER_MS_;
      });
      syncAvisos_(
        ids.map(function (key) {
          return { key: key, action: "snooze" };
        }),
      );
    }
    avisosEstado_.lista = avisosEstado_.lista.filter(function (x) {
      return !ids.includes(x.id);
    });
    guardarAvisos_();
    renderAvisos_();
  }

  function ejecutarAccionAviso_(a, accion, boton) {
    if (accion === "posponer") {
      quitarAviso_(a.id, true);
      showToast("Pospuesto 1 hora", "good");
      return;
    }
    if (accion.indexOf("ap:") === 0) {
      accionApartado_(a.apartado, accion.slice(3), boton, function () {
        quitarAviso_(a.id);
      });
      return;
    }
    var rec = recPorLoad_(a.load);
    if (!rec) return;
    boton.disabled = true;
    var fallo = function (err) {
      boton.disabled = false;
      showToast("No se pudo guardar: " + err.message, "error");
    };
    if (accion === "avisado") {
      guardarConVerificacion_(function (res) {
        rec.client_notify_pending = false;
        rec.client_notify_reason = "";
        rec.client_notify_since = "";
        rec.client_notified_at = new Date().toISOString();
        rec.client_notified_by = myRealIdentity;
        if (res && res.recordatorio_fecha)
          rec.recordatorio_fecha = res.recordatorio_fecha;
        quitarAviso_(a.id);
        render(currentData);
        showToast("Cliente marcado como avisado — Carga " + rec.load, "good");
      }, fallo).markClientNotified(rec.load, myRealIdentity, myPassword);
    } else if (accion === "revisado") {
      guardarConVerificacion_(function () {
        rec.next_review_at = "";
        rec.next_review_note = "";
        rec.next_review_by = "";
        quitarAviso_(a.id);
        render(currentData);
        showToast("Revisión registrada — Carga " + rec.load, "good");
      }, fallo).clearNextReview(rec.load, myRealIdentity, myPassword);
    } else if (accion === "transito") {
      var fechaISO = new Date(
        Date.now() + AUTO_REVIEW_HOURS * 3600000,
      ).toISOString();
      guardarConVerificacion_(function () {
        rec.recordatorio_fecha = fechaISO;
        quitarAviso_(a.id);
        render(currentData);
        showToast(
          "Revisión registrada — próxima en " +
            AUTO_REVIEW_HOURS +
            " h — Carga " +
            rec.load,
          "good",
        );
      }, fallo).saveRecordatorio(
        rec.load,
        fechaISO,
        myRealIdentity,
        myPassword,
      );
    }
  }

  function anunciarAvisos_(nuevos) {
    if (isUserEditingField()) return; // Ya están en la campana; no cubrir el campo activo.
    var container = document.getElementById("toast-container");
    var mostrar =
      nuevos.length <= 3
        ? nuevos
        : [
            {
              titulo: "Tienes " + nuevos.length + " avisos nuevos",
              detalle: "Da clic para verlos",
            },
          ];
    mostrar.forEach(function (c) {
      if (!container) return;
      var el = document.createElement("div");
      el.className = "toast toast-aviso";
      var b = document.createElement("b");
      b.textContent = "🔔 " + c.titulo;
      var s = document.createElement("div");
      s.textContent = c.detalle || "";
      el.appendChild(b);
      el.appendChild(s);
      el.addEventListener("click", function () {
        el.remove();
        abrirAvisos_(true);
      });
      container.appendChild(el);
      requestAnimationFrame(function () {
        el.classList.add("show");
      });
      setTimeout(function () {
        el.classList.remove("show");
        setTimeout(function () {
          el.remove();
        }, 250);
      }, 8000);
    });
    sonarAviso_();
    notificarEscritorio_(nuevos);
  }

  // ---- Avisos de escritorio (Windows) para lo urgente, solo con la pestaña en segundo plano ----
  var avisosEscritorio_ = false;
  try {
    avisosEscritorio_ = localStorage.getItem("bajio_avisos_escritorio") === "1";
  } catch (e) {}
  function escritorioDisponible_() {
    return (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    );
  }
  function notificarEscritorio_(nuevos) {
    if (!avisosEscritorio_ || !document.hidden || !escritorioDisponible_())
      return;
    var urgentes = nuevos.filter(function (c) {
      return c.sev === "critical";
    });
    if (!urgentes.length) return;
    try {
      var c = urgentes[0];
      var n = new Notification(
        urgentes.length > 1
          ? urgentes.length + " avisos urgentes en el panel"
          : c.titulo,
        {
          body:
            urgentes.length > 1
              ? urgentes
                  .map(function (x) {
                    return "• " + x.titulo;
                  })
                  .slice(0, 4)
                  .join("\n")
              : c.detalle || "",
          tag: "panel-bajio-avisos",
        },
      );
      n.onclick = function () {
        try {
          window.focus();
        } catch (e) {}
        abrirAvisos_(true);
        n.close();
      };
    } catch (e) {}
  }
  function desactivarEscritorio_(motivo) {
    avisosEscritorio_ = false;
    document.getElementById("avisos-escritorio").checked = false;
    try {
      localStorage.setItem("bajio_avisos_escritorio", "0");
    } catch (e) {}
    if (motivo) showToast(motivo, "error");
  }
  document.getElementById("avisos-escritorio").checked = avisosEscritorio_;
  document
    .getElementById("avisos-escritorio")
    .addEventListener("change", function (e) {
      if (!e.target.checked) {
        desactivarEscritorio_("");
        return;
      }
      var NO_SE_PUEDE =
        'Tu navegador no deja mostrar avisos de escritorio desde el panel (Apps Script lo abre dentro de otra página). Activa "Sonido": suena aunque estés en otra pestaña.';
      if (typeof Notification === "undefined") {
        desactivarEscritorio_(NO_SE_PUEDE);
        return;
      }
      var respondio = false;
      var listo = function (permiso) {
        if (respondio) return; // navegadores viejos llaman el callback Y resuelven la promesa
        respondio = true;
        if (permiso !== "granted") {
          desactivarEscritorio_(
            permiso === "denied"
              ? "Los avisos de escritorio están bloqueados para este sitio en tu navegador."
              : NO_SE_PUEDE,
          );
          return;
        }
        avisosEscritorio_ = true;
        try {
          localStorage.setItem("bajio_avisos_escritorio", "1");
        } catch (err) {}
        showToast(
          "Listo: lo urgente te llegará como aviso de Windows cuando estés en otra pestaña",
          "good",
        );
      };
      try {
        var p = Notification.requestPermission(listo);
        if (p && p.then)
          p.then(listo, function () {
            desactivarEscritorio_(NO_SE_PUEDE);
          });
      } catch (err) {
        desactivarEscritorio_(NO_SE_PUEDE);
      }
    });

  function sonarAviso_() {
    if (!avisosSonido_) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      var ctx = sonarAviso_.ctx || (sonarAviso_.ctx = new C());
      var o = ctx.createOscillator(),
        g = ctx.createGain(),
        t = ctx.currentTime;
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    } catch (e) {}
  }

  var noticesWhileEditing_ = [];
  window.addEventListener("panel:notice", function (e) {
    noticesWhileEditing_.unshift({
      id: "notice:" + Date.now(),
      nuevo: true,
      sev: "info",
      ts: new Date().toISOString(),
      titulo: e.detail.message,
      detalle: "Confirmación del panel",
    });
    noticesWhileEditing_ = noticesWhileEditing_.slice(0, 20);
    renderAvisos_();
  });
  var AVISO_ORDEN_SEV_ = { critical: 0, warn: 1, info: 2 };
  function renderAvisos_() {
    var btn = document.getElementById("avisos-btn"),
      badge = document.getElementById("avisos-badge"),
      lista = document.getElementById("avisos-lista");
    if (!btn) return;
    btn.hidden = !myRealIdentity;
    // También filtrar al pintar: un aviso guardado antes de una reasignación no debe reaparecer.
    var allowed = new Set(
      myRealIdentity
        ? candidatosAvisos_().map(function (a) {
            return a.id;
          })
        : [],
    );
    var items =
      avisosEstado_ && myRealIdentity
        ? avisosEstado_.lista
            .filter(function (a) {
              return allowed.has(a.id);
            })
            .concat(noticesWhileEditing_)
        : [];
    items = items.filter(function (a) {
      var state = personalNoticeState_.get(a.id);
      if (state && state.read_at) a.nuevo = false;
      return (
        !state ||
        !state.snoozed_until ||
        Date.parse(state.snoozed_until) <= Date.now()
      );
    });
    items = window.panelPersonal.groupNotices(items);
    personalNoticeGroups_ = new Map(
      items.map(function (a) {
        return [a.id, a.memberIds];
      }),
    );
    var sinVer = items.filter(function (a) {
      return a.nuevo;
    }).length;
    badge.hidden = !sinVer;
    badge.textContent = sinVer > 99 ? "99+" : String(sinVer);
    var movilBadge = document.getElementById("movil-badge");
    if (movilBadge) {
      movilBadge.hidden = !sinVer;
      movilBadge.textContent = badge.textContent;
    }
    btn.classList.toggle("tiene-nuevos", sinVer > 0);
    btn.title = sinVer ? sinVer + " avisos sin ver" : "Avisos y recordatorios";
    if (!lista) return;
    items.sort(function (a, b) {
      if (!!a.nuevo !== !!b.nuevo) return a.nuevo ? -1 : 1;
      var s = (AVISO_ORDEN_SEV_[a.sev] || 3) - (AVISO_ORDEN_SEV_[b.sev] || 3);
      return s || String(b.ts).localeCompare(String(a.ts));
    });
    lista.innerHTML = items.length
      ? items
          .map(function (a) {
            var acc = accionesAviso_(a);
            return (
              '<div class="aviso-item t-' +
              esc(a.sev) +
              (a.nuevo ? " nuevo" : "") +
              '" data-aviso-id="' +
              esc(a.id) +
              '" role="button" tabindex="0">' +
              '<span class="aviso-dot"></span><span class="aviso-texto"><b>' +
              esc(a.titulo) +
              "</b>" +
              esc(a.detalle || "") +
              "<br><small>" +
              esc(relativeTimeLabel(a.ts)) +
              "</small>" +
              (acc ? '<span class="aviso-acciones">' + acc + "</span>" : "") +
              "</span></div>"
            );
          })
          .join("")
      : '<div class="avisos-vacio">✓ No tienes avisos pendientes.</div>';
  }

  function abrirAvisos_(abrir) {
    var panel = document.getElementById("avisos-panel"),
      btn = document.getElementById("avisos-btn");
    if (!panel) return;
    panel.hidden = !abrir;
    if (btn) btn.setAttribute("aria-expanded", String(!!abrir));
    if (abrir) {
      renderAvisos_();
      syncAvisos_([]);
    }
  }

  function marcarAvisosVistos_(id) {
    var ids = id
      ? avisoIds_(id)
      : avisosEstado_
        ? avisosEstado_.lista.map(function (a) {
            return a.id;
          })
        : [];
    noticesWhileEditing_.forEach(function (n) {
      if (!id || ids.includes(n.id)) n.nuevo = false;
    });
    if (!avisosEstado_) return;
    avisosEstado_.lista.forEach(function (a) {
      if (ids.includes(a.id)) a.nuevo = false;
    });
    guardarAvisos_();
    renderAvisos_();
    // Solo sincroniza lectura; jamás resuelve tareas ni modifica cargas.
    for (var offset = 0; offset < ids.length; offset += 200)
      syncAvisos_(
        ids.slice(offset, offset + 200).map(function (key) {
          return { key: key, action: "read" };
        }),
      );
  }

  document.getElementById("avisos-btn").addEventListener("click", function (e) {
    e.stopPropagation();
    abrirAvisos_(document.getElementById("avisos-panel").hidden);
  });
  document
    .getElementById("avisos-leer-todo")
    .addEventListener("click", function () {
      marcarAvisosVistos_();
    });
  document.getElementById("avisos-sonido").checked = avisosSonido_;
  document
    .getElementById("avisos-sonido")
    .addEventListener("change", function (e) {
      avisosSonido_ = e.target.checked;
      try {
        localStorage.setItem("bajio_avisos_sonido", avisosSonido_ ? "1" : "0");
      } catch (err) {}
      if (avisosSonido_) sonarAviso_(); // prueba del tono (y desbloquea el audio con este clic)
    });
  function abrirDesdeAviso_(item) {
    var id = item.getAttribute("data-aviso-id");
    var a = (avisosEstado_ ? avisosEstado_.lista : []).filter(function (x) {
      return x.id === id;
    })[0];
    marcarAvisosVistos_(id);
    abrirAvisos_(false);
    if (!a) return;
    if (a.destino === "bitacora") {
      showMainPage("home", "group-bitacora");
      var task = (bitacora || []).find(function (item) {
        return String(item.id) === String(a.taskId);
      });
      if (task) openBitacoraModal(task);
    } else if (a.load) openLoadWorkspace(a.load, a.tab || "operacion");
    else if (a.destino === "gestionar") openCsrPasswordGate();
    else if (a.destino === "apartados") verApartado_(a.apartado);
  }
  document
    .getElementById("avisos-lista")
    .addEventListener("click", function (e) {
      var item = e.target.closest("[data-aviso-id]");
      if (!item) return;
      var accion = e.target.closest("[data-aviso-accion]");
      if (accion) {
        e.stopPropagation();
        var id = item.getAttribute("data-aviso-id");
        var a = avisosEstado_.lista.filter(function (x) {
          return x.id === id;
        })[0];
        if (a)
          ejecutarAccionAviso_(
            a,
            accion.getAttribute("data-aviso-accion"),
            accion,
          );
        return;
      }
      abrirDesdeAviso_(item);
    });
  document
    .getElementById("avisos-lista")
    .addEventListener("keydown", function (e) {
      if (
        (e.key === "Enter" || e.key === " ") &&
        e.target.matches("[data-aviso-id]")
      ) {
        e.preventDefault();
        abrirDesdeAviso_(e.target);
      }
    });
  document.addEventListener("click", function (e) {
    var panel = document.getElementById("avisos-panel");
    if (
      panel &&
      !panel.hidden &&
      !e.target.closest("#avisos-panel") &&
      !e.target.closest("#avisos-btn")
    )
      abrirAvisos_(false);
  });

  setInterval(programarAvisos_, 60000); // recordatorios por tiempo aunque no cambie ningún dato

  setInterval(autoRefresh, AUTO_REFRESH_MS); // con la pestaña oculta, autoRefresh solo pregunta cada 5 min
  setInterval(function () {
    if (!document.hidden && myRealIdentity) loadSlaMetrics();
  }, 300000);
  // Aparte de autoRefresh (que solo trae datos nuevos si de verdad cambió algo en el servidor),
  // la cuenta regresiva de los banners de alerta necesita refrescarse sola aunque no haya
  // cambiado nada — si no, se queda congelada mostrando "faltan 3h 40m" para siempre. Con la
  // pestaña oculta no se redibuja nada (nadie lo ve); al volver se pone al día de inmediato.
  setInterval(function () {
    if (!document.hidden) refreshAlertCountdowns();
  }, AUTO_REFRESH_MS);
  setInterval(function () {
    if (!document.hidden) refreshOperationalAttention();
  }, 60000);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    autoRefresh();
    refreshAlertCountdowns();
    refreshOperationalAttention();
    updateHeaderTimestamp();
  });

  // Cierra con Esc el modal que esté abierto en ese momento (comentarios, verificar identidad,
  // nuevo pendiente, vincular pendiente a load, recordatorio, contraseña/gestión de CSR o el
  // cajón de "¿Quién eres?"), sea cual sea.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (
      document.getElementById("confirmar-backdrop").classList.contains("show")
    ) {
      cerrarConfirmar_();
      return;
    }
    if (
      document.getElementById("multimsg-backdrop").classList.contains("show")
    ) {
      document.getElementById("multimsg-backdrop").classList.remove("show");
      return;
    }
    if (
      document.getElementById("apartado-backdrop").classList.contains("show")
    ) {
      cerrarApartadoConAviso_();
      return;
    }
    if (!document.getElementById("avisos-panel").hidden) {
      abrirAvisos_(false);
      return;
    }
    if (
      document.getElementById("comments-backdrop").classList.contains("show")
    ) {
      closeCommentsModal();
      return;
    }
    if (
      document.getElementById("incidencia-backdrop").classList.contains("show")
    ) {
      closeIncidenciaModal();
      return;
    }
    if (
      document.getElementById("workspace-backdrop").classList.contains("show")
    ) {
      closeLoadWorkspace();
      return;
    }
    if (
      document.getElementById("identity-backdrop").classList.contains("show")
    ) {
      closeIdentityModal();
      return;
    }
    if (
      document.getElementById("pendiente-backdrop").classList.contains("show")
    ) {
      closePendienteModal();
      return;
    }
    if (
      document.getElementById("bitacora-backdrop").classList.contains("show")
    ) {
      cerrarBitacoraConAviso_();
      return;
    }
    if (
      document.getElementById("vincular-backdrop").classList.contains("show")
    ) {
      closeVincularModal();
      return;
    }
    if (
      document
        .getElementById("recordatorio-backdrop")
        .classList.contains("show")
    ) {
      cancelRecordatorioModal();
      return;
    }
    if (document.getElementById("csr-pw-backdrop").classList.contains("show")) {
      closeCsrPasswordGate();
      return;
    }
    if (document.getElementById("csr-backdrop").classList.contains("show")) {
      document.getElementById("csr-backdrop").classList.remove("show");
      return;
    }
    if (
      document.getElementById("who-drawer-backdrop").classList.contains("show")
    ) {
      closeWhoDrawer();
      return;
    }
  });

  // Atajos de teclado (no aplican mientras escribes en un campo):
  //   /  buscar (en Operación completa, su buscador; en cualquier otra página, la búsqueda global)
  //   N  nuevo comentario de la carga abierta (Expediente de carga o detalle de la tabla)
  //   R  actualizar ahora      ?  ver esta lista      Esc  cerrar lo que esté abierto
  function hayModalAbierto_() {
    return !!document.querySelector(
      ".modal-backdrop.show, .who-drawer-backdrop.show",
    );
  }
  function mostrarAtajos_() {
    confirmarModal_(
      "Atajos de teclado",
      '<table class="atajos"><tr><td><kbd>/</kbd></td><td>Buscar</td></tr>' +
        "<tr><td><kbd>N</kbd></td><td>Nuevo comentario de la carga abierta</td></tr>" +
        "<tr><td><kbd>R</kbd></td><td>Actualizar ahora</td></tr>" +
        "<tr><td><kbd>Esc</kbd></td><td>Cerrar ventana o panel</td></tr>" +
        "<tr><td><kbd>?</kbd></td><td>Ver esta lista</td></tr></table>",
      "",
      null,
    );
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    var t = e.target,
      tag = t && t.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      (t && t.isContentEditable)
    )
      return;
    if (e.key === "?") {
      e.preventDefault();
      mostrarAtajos_();
      return;
    }
    if (e.key === "/") {
      if (hayModalAbierto_()) return;
      e.preventDefault();
      var enOperacion = !document.getElementById("page-operation").hidden;
      if (!enOperacion) showMainPage("home");
      var campo = document.getElementById(
        enOperacion ? "search" : "home-search",
      );
      if (campo) {
        campo.focus();
        campo.select();
      }
      return;
    }
    if (e.key === "n" || e.key === "N") {
      var wsAbierto = document
        .getElementById("workspace-backdrop")
        .classList.contains("show");
      var load = wsAbierto
        ? workspaceCurrentLoad
        : !hayModalAbierto_()
          ? selectedTableLoad
          : null;
      if (!load) return;
      e.preventDefault();
      openCommentsModal(load, "load");
      setTimeout(function () {
        var ta = document.getElementById("comments-textarea");
        if (ta) ta.focus();
      }, 60);
      return;
    }
    if ((e.key === "r" || e.key === "R") && !hayModalAbierto_()) {
      e.preventDefault();
      document.getElementById("header-refresh-btn").click();
    }
  });

  // FIX: seguridad — las cargas, comentarios, SLA, pendientes, etc. ya solo se entregan con sesión
  // iniciada, así que se piden hasta que verifyIdentity() la confirma (con el token guardado o con
  // el login). Aquí solo se piden las personas, que hacen falta para el selector del login.
  loadStoredIdentity();
  loadPersonasYAsignaciones();

  google.script.run
    .withSuccessHandler(function (info) {
      lastImportInfo_ = info;
      lastImportAt = (info && info.lastImportAt) || "";
      renderOperationMeta();
    })
    .getImportInfo();
})();
