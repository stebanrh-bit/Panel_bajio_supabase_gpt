// ===== Inicio / Action Center =====
  function isSameLocalDay(a, b) {
    if (!a || !b) return false;
    var da = new Date(a),
      db = new Date(b);
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  }

  function hoursSince(d) {
    if (!d) return Infinity;
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return Infinity;
    return (Date.now() - dt.getTime()) / 3600000;
  }

  function computeActiveJourney(data) {
    var scoped = actionCenterScope(data || []);
    var active = scoped.filter(function (r) {
      return (
        !isArchived(r) &&
        !isCanceladaFinalizada(r) &&
        !isCancelledStatus(r.status)
      );
    });
    var items = active
      .map(function (rec) {
        var reasons = journeyReasons(rec),
          bucket = journeyBucket(reasons);
        return bucket
          ? {
              rec: rec,
              reasons: reasons,
              bucket: bucket,
              score: reasons[0].score,
            }
          : null;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.score - a.score;
      });
    return { scoped: scoped, active: active, items: items };
  }
  function shiftSnapshot(data, journey) {
    var j = journey || computeActiveJourney(data);
    var active = j.active,
      items = j.items,
      now = Date.now();
    return {
      active: active,
      items: items,
      urgent: items.filter(function (x) {
        return x.bucket === "now";
      }),
      client: active.filter(function (r) {
        return !!r.client_notify_pending;
      }),
      today: active.filter(function (r) {
        return isSameLocalDay(r.delivery_appt, new Date());
      }),
      overdue: active.filter(function (r) {
        if (!r.next_review_at) return false;
        var t = new Date(r.next_review_at).getTime();
        return !isNaN(t) && t <= now;
      }),
    };
  }
  function briefGreeting() {
    var h = new Date().getHours();
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  }
  function briefText(snap) {
    return (
      briefGreeting() +
      ". Tienes " +
      snap.active.length +
      " cargas activas. " +
      snap.urgent.length +
      " requieren atención inmediata, " +
      snap.client.length +
      " tienen comunicación pendiente con cliente, " +
      snap.today.length +
      " tienen entrega programada hoy y " +
      snap.overdue.length +
      " revisiones ya vencieron."
    );
  }
  function loadDetailLine_(r) {
    return (
      "Carga " +
      (r.load || "—") +
      " | " +
      (r.customer || "Sin cliente") +
      " | Truck " +
      (r.truck || "—") +
      " | Trailer " +
      (r.trailer || "—")
    );
  }
  function detailLines_(records, limit) {
    limit = limit || 15;
    var list = (records || []).slice(0, limit);
    var out = list.map(function (r) {
      return "  · " + loadDetailLine_(r);
    });
    if ((records || []).length > list.length)
      out.push("  · … y " + (records.length - list.length) + " más");
    return out;
  }
  function handoffText(snap) {
    var lines = [
      "CIERRE DE TURNO · " + new Date().toLocaleString(),
      "CSR: " + (myRealIdentity || "Sin identificar"),
      "",
      "RESUMEN",
    ];
    lines.push("- Cargas activas: " + snap.active.length);
    lines = lines.concat(detailLines_(snap.active));
    lines.push("- Atender ahora: " + snap.urgent.length);
    lines = lines.concat(
      detailLines_(
        snap.urgent.map(function (x) {
          return x.rec;
        }),
      ),
    );
    lines.push("- Avisar al cliente: " + snap.client.length);
    lines = lines.concat(detailLines_(snap.client));
    lines.push("- Entregas hoy: " + snap.today.length);
    lines = lines.concat(detailLines_(snap.today));
    lines.push("- Revisiones vencidas: " + snap.overdue.length);
    lines = lines.concat(detailLines_(snap.overdue));
    lines.push("", "PRIORIDADES PARA CONTINUAR");
    snap.items.slice(0, 12).forEach(function (x) {
      lines.push(
        "- Carga " +
          x.rec.load +
          " | " +
          (x.rec.customer || "Sin cliente") +
          " | Truck " +
          (x.rec.truck || "—") +
          " | Trailer " +
          (x.rec.trailer || "—") +
          " | " +
          x.reasons
            .slice(0, 2)
            .map(function (q) {
              return q.text;
            })
            .join(" / ") +
          (x.rec.next_review_note
            ? " | Próxima revisión: " + x.rec.next_review_note
            : ""),
      );
    });
    var openBit = (bitacora || []).filter(function (b) {
      return !b.resuelto;
    });
    if (openBit.length) {
      lines.push("", "BITÁCORA ABIERTA");
      openBit.slice(0, 10).forEach(function (b) {
        lines.push("- Carga " + (b.load || "—") + " | " + b.nota);
      });
    }
    if (!snap.items.length && !openBit.length)
      lines.push("- Sin pendientes críticos identificados.");
    lines = lines.concat(cambiosDelTurnoLineas_());
    return lines.join("\n");
  }

  // Turnos del equipo: 07–16, 16–24 y 00–07 (los mismos de turnoActual_ en Code.gs).
  function inicioTurnoActual_() {
    var d = new Date(),
      h = d.getHours(),
      ini = h >= 16 ? 16 : h >= 7 ? 7 : 0;
    d.setHours(ini, 0, 0, 0);
    return d.getTime();
  }
  /** "LO QUE HICE EN MI TURNO" para el cierre: lo que cambió desde que empezó el turno y lo hizo
   * quien tiene la sesión (estatus/campos, avisos al cliente, comentarios, bitácora, apartados). */
  function cambiosDelTurnoLineas_() {
    var yo = myRealIdentity;
    if (!yo) return [];
    var desde = inicioTurnoActual_(),
      out = [];
    var enTurno = function (v) {
      var t = v ? new Date(v).getTime() : NaN;
      return !isNaN(t) && t >= desde;
    };
    var avisados = (currentData || []).filter(function (r) {
      return r.client_notified_by === yo && enTurno(r.client_notified_at);
    });
    var editadas = (currentData || []).filter(function (r) {
      return (
        r.updated_by === yo &&
        enTurno(r.updated_at) &&
        avisados.indexOf(r) === -1
      );
    });
    var comentadas = Object.keys(ultimosComentarios || {}).filter(function (k) {
      var c = ultimosComentarios[k];
      return c && c.usuario === yo && enTurno(c.ts) && recPorLoad_(k);
    });
    var bitResueltas = (bitacora || []).filter(function (b) {
      return b.resuelto && enTurno(b.resuelto_en);
    });
    var aps = (apartados || []).filter(function (a) {
      return a.actualizado_por === yo && enTurno(a.actualizado_en);
    });
    if (
      !avisados.length &&
      !editadas.length &&
      !comentadas.length &&
      !bitResueltas.length &&
      !aps.length
    )
      return [
        "",
        "LO QUE HICE EN MI TURNO",
        "- (Nada registrado en el panel desde las " +
          new Date(desde).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }) +
          ")",
      ];
    out.push(
      "",
      "LO QUE HICE EN MI TURNO (desde las " +
        new Date(desde).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }) +
        ")",
    );
    if (avisados.length) {
      out.push("- Avisé al cliente: " + avisados.length);
      avisados.slice(0, 15).forEach(function (r) {
        out.push(
          "  · Carga " +
            r.load +
            " | " +
            (r.customer || "") +
            " | " +
            (r.status || "—"),
        );
      });
    }
    if (editadas.length) {
      out.push("- Actualicé: " + editadas.length);
      editadas.slice(0, 15).forEach(function (r) {
        out.push(
          "  · Carga " +
            r.load +
            " | " +
            (r.customer || "") +
            " | ahora: " +
            (r.status || "—"),
        );
      });
    }
    if (comentadas.length) {
      out.push("- Comenté: " + comentadas.length);
      comentadas.slice(0, 10).forEach(function (k) {
        out.push(
          "  · Carga " +
            k +
            " | " +
            String(ultimosComentarios[k].text || "")
              .replace(/\s+/g, " ")
              .slice(0, 90),
        );
      });
    }
    if (bitResueltas.length) {
      out.push("- Pendientes de bitácora atendidos: " + bitResueltas.length);
      bitResueltas.slice(0, 10).forEach(function (b) {
        out.push(
          "  · Carga " +
            (b.load || "—") +
            " | " +
            String(b.nota || "").slice(0, 80),
        );
      });
    }
    if (aps.length) {
      out.push("- Loads apartados que moví: " + aps.length);
      aps.slice(0, 10).forEach(function (a) {
        out.push(
          "  · " + a.load + " | " + (APARTADO_ESTADOS_[a.estado] || a.estado),
        );
      });
    }
    return out;
  }

  var listasExpandidas_ = {};
  function htmlListaConMas_(key, items, limit, rowHtml) {
    var one = function (x) {
      return rowHtml(x);
    };
    if (items.length <= limit) return items.map(one).join("");
    var abierta = !!listasExpandidas_[key],
      resto = items.length - limit;
    return (
      items.slice(0, limit).map(one).join("") +
      '<div class="lista-mas-rows"' +
      (abierta ? "" : " hidden") +
      ">" +
      items.slice(limit).map(one).join("") +
      "</div>" +
      '<button type="button" class="lista-mas-btn" data-lista-mas="' +
      esc(key) +
      '" data-lista-resto="' +
      resto +
      '" aria-expanded="' +
      abierta +
      '">' +
      (abierta ? "Ver menos" : "Ver " + resto + " más") +
      "</button>"
    );
  }
  // Ver CSS .home-mini-panel.is-empty. Una sección cuenta como "vacía" solo cuando su lista trae
  // únicamente el mensaje positivo (los que empiezan con ✓) — "Cargando…" o un error no la colapsan.
  // Se observa la pestaña "Ahora" completa en vez de llamar esto desde cada render (Recordatorios,
  // Cruce, SLA, Cierres… cada uno se pinta desde una función distinta y en momentos distintos).
  function marcarPanelesVacios_() {
    document
      .querySelectorAll("#home-tab-ahora .home-mini-panel-wide")
      .forEach(function (p) {
        var list = p.querySelector(".home-mini-list");
        if (!list) return;
        var kids = list.children;
        var vacio =
          kids.length === 1 &&
          kids[0].classList.contains("action-empty") &&
          /^\s*✓/.test(kids[0].textContent);
        p.classList.toggle("is-empty", vacio);
      });
  }
  (function () {
    var root = document.getElementById("home-tab-ahora");
    if (!root || !window.MutationObserver) return;
    var pendiente = false;
    new MutationObserver(function () {
      if (pendiente) return;
      pendiente = true;
      setTimeout(function () {
        pendiente = false;
        marcarPanelesVacios_();
      }, 60);
    }).observe(root, { childList: true, subtree: true });
    marcarPanelesVacios_();
  })();
  function completarAccesibilidad_() {
    pintarComentariosRapidos_(); // los paneles de comentario del Expediente de carga se dibujan después
    document
      .querySelectorAll(".modal-box, .who-drawer")
      .forEach(function (box) {
        if (!box.hasAttribute("role")) box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        if (
          !box.hasAttribute("aria-label") &&
          !box.hasAttribute("aria-labelledby")
        ) {
          var t = box.querySelector(".modal-title");
          if (t) {
            if (!t.id)
              t.id = "dlg-title-" + Math.random().toString(36).slice(2, 8);
            box.setAttribute("aria-labelledby", t.id);
          }
        }
      });
    document.querySelectorAll("button:not([aria-label])").forEach(function (b) {
      var txt = b.textContent.trim();
      if (txt && txt !== "×" && txt !== "×") return;
      var name =
        b.getAttribute("title") ||
        (txt === "×" ||
        txt === "×" ||
        b.classList.contains("modal-close") ||
        b.classList.contains("workspace-close")
          ? "Cerrar"
          : "");
      if (name) b.setAttribute("aria-label", name);
    });
    document
      .querySelectorAll(
        "input:not([type=hidden]):not([type=file]):not([aria-label]),select:not([aria-label]),textarea:not([aria-label])",
      )
      .forEach(function (f) {
        if (f.labels && f.labels.length) return;
        var name = f.getAttribute("placeholder") || f.getAttribute("title");
        if (name) f.setAttribute("aria-label", name);
      });
  }
  (function () {
    completarAccesibilidad_();
    if (!window.MutationObserver) return;
    var pendiente = false;
    new MutationObserver(function () {
      if (pendiente) return;
      pendiente = true;
      setTimeout(function () {
        pendiente = false;
        completarAccesibilidad_();
      }, 120);
    }).observe(document.body, { childList: true, subtree: true });
  })();
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lista-mas]");
    if (!b) return;
    var k = b.getAttribute("data-lista-mas"),
      abierta = !listasExpandidas_[k];
    listasExpandidas_[k] = abierta;
    var rows = b.previousElementSibling;
    if (rows && rows.classList.contains("lista-mas-rows"))
      rows.hidden = !abierta;
    b.setAttribute("aria-expanded", String(abierta));
    b.textContent = abierta
      ? "Ver menos"
      : "Ver " + b.getAttribute("data-lista-resto") + " más";
  });
  // now/review/monitor = los mismos grupos que el Action Center; clear = activas sin ningún motivo.
  function homeBuckets_(data) {
    var j = computeActiveJourney(data),
      b = { now: [], review: [], monitor: [], clear: [] },
      conMotivo = {};
    j.items.forEach(function (x) {
      if (b[x.bucket]) {
        b[x.bucket].push(x.rec);
        conMotivo[String(x.rec.load)] = true;
      }
    });
    j.active.forEach(function (r) {
      if (!conMotivo[String(r.load)]) b.clear.push(r);
    });
    return b;
  }
  function renderHomeCommand(data) {
    data = Array.isArray(data) ? data : [];
    var scoped = actionCenterScope(data).filter(function (r) {
      return !isDoneStatus(r.status) && !isCancelledStatus(r.status);
    });
    var buckets = homeBuckets_(data);
    var set = function (id, v) {
      var e = document.getElementById(id);
      if (e) e.textContent = v;
    };
    set("home-now", buckets.now.length);
    set("home-review", buckets.review.length);
    set("home-monitor", buckets.monitor.length);
    set("home-clear", buckets.clear.length);
    var upcomingPickups = scoped
      .filter(function (r) {
        return pickupIsFuture(r.pickup_appt);
      })
      .sort(function (a, b) {
        return pd(a.pickup_appt) - pd(b.pickup_appt);
      });
    set("home-pickup-count", upcomingPickups.length + " próximas");
    var pk = document.getElementById("home-pickups");
    if (pk)
      pk.innerHTML = upcomingPickups.length
        ? htmlListaConMas_("pickups", upcomingPickups, 5, function (r) {
            var d = pd(r.pickup_appt);
            return (
              '<div class="deliv-card"><div class="deliv-card-top"><span class="hm-time">' +
              esc(d ? fmtDateTime(d) : "—") +
              '</span><span class="hm-load">Carga ' +
              esc(r.load) +
              '</span><span class="deliv-customer">' +
              esc(r.customer || "—") +
              '</span><button class="ws-btn" data-home-open="' +
              esc(r.load) +
              '">Abrir</button></div><div class="deliv-card-bottom"><span class="deliv-chip">WO ' +
              esc(r.work_order || "—") +
              '</span><span class="deliv-chip">Trailer ' +
              esc(r.trailer || "—") +
              '</span><span class="deliv-chip">' +
              esc(
                titleCity(r.origin_city) +
                  (r.origin_state
                    ? ", " + String(r.origin_state).toUpperCase()
                    : ""),
              ) +
              "</span></div></div>"
            );
          })
        : '<div class="action-empty">Sin cargas próximas.</div>';
    var now = new Date(),
      upcoming = scoped
        .filter(function (r) {
          var d = pd(r.delivery_appt);
          return d && d >= now;
        })
        .sort(function (a, b) {
          return pd(a.delivery_appt) - pd(b.delivery_appt);
        });
    set("home-delivery-count", upcoming.length + " próximas");
    var dl = document.getElementById("home-deliveries");
    if (dl)
      dl.innerHTML = upcoming.length
        ? htmlListaConMas_("deliveries", upcoming, 5, function (r) {
            var d = pd(r.delivery_appt);
            return (
              '<div class="deliv-card"><div class="deliv-card-top"><span class="hm-time">' +
              esc(d ? fmtDateTime(d) : "—") +
              '</span><span class="hm-load">Carga ' +
              esc(r.load) +
              '</span><span class="deliv-customer">' +
              esc(r.customer || "—") +
              '</span><button class="ws-btn" data-home-open="' +
              esc(r.load) +
              '">Abrir</button></div><div class="deliv-card-bottom"><span class="deliv-chip">WO ' +
              esc(r.work_order || "—") +
              '</span><span class="deliv-chip">Trailer ' +
              esc(r.trailer || "—") +
              '</span><span class="deliv-chip">' +
              esc(
                titleCity(r.dest_city) +
                  (r.dest_state
                    ? ", " + String(r.dest_state).toUpperCase()
                    : ""),
              ) +
              "</span></div></div>"
            );
          })
        : '<div class="action-empty">Sin entregas próximas.</div>';
    var comm = scoped
      .filter(function (r) {
        return !!r.client_notify_pending;
      })
      .sort(function (a, b) {
        return (
          (pd(a.delivery_appt) || new Date(8640000000000000)) -
          (pd(b.delivery_appt) || new Date(8640000000000000))
        );
      });
    set("home-comm-count", comm.length + " pendientes");
    var cl = document.getElementById("home-communications");
    if (cl)
      cl.innerHTML = comm.length
        ? htmlListaConMas_("comm", comm, 5, function (r) {
            return (
              '<div class="home-mini-row"><span class="hm-load">' +
              esc(r.load) +
              "</span><span>" +
              esc(r.customer || "—") +
              '</span><span class="hm-soft">' +
              esc(r.client_notify_reason || "Actualización operativa") +
              '</span><span class="hm-soft hm-opt">' +
              esc(r.status || "—") +
              '</span><button class="ws-btn" data-home-comm="' +
              esc(r.load) +
              '">Abrir</button></div>'
            );
          })
        : '<div class="action-empty">✓ No hay comunicaciones pendientes.</div>';
    renderHomeReminders(actionCenterScope(data));
    var conIncidencias = scoped
      .filter(function (r) {
        return Number(r.incidenciasCount) > 0;
      })
      .sort(function (a, b) {
        return Number(b.incidenciasCount) - Number(a.incidenciasCount);
      });
    set(
      "home-incidencias-count",
      conIncidencias.length +
        (conIncidencias.length === 1 ? " carga" : " cargas"),
    );
    var ic = document.getElementById("home-incidencias");
    if (ic)
      ic.innerHTML = conIncidencias.length
        ? htmlListaConMas_("incidencias", conIncidencias, 8, function (r) {
            var n = Number(r.incidenciasCount) || 0;
            return (
              '<div class="home-mini-row"><span class="hm-load">' +
              esc(r.load) +
              "</span><span>" +
              esc(r.customer || "—") +
              '</span><span class="hm-soft hm-opt">' +
              esc(r.status || "—") +
              '</span><span class="hm-soft">' +
              n +
              (n === 1 ? " incidencia" : " incidencias") +
              '</span><button class="ws-btn" data-incidencias-load="' +
              esc(r.load) +
              '">Ver</button></div>'
            );
          })
        : '<div class="action-empty">✓ Sin incidencias registradas.</div>';
    var STALE_CUSTOMER_DAYS = 2;
    var byCustomer = {};
    scoped.forEach(function (r) {
      var cust = String(r.customer || "").trim();
      if (!cust) return;
      if (!byCustomer[cust])
        byCustomer[cust] = { customer: cust, count: 0, lastUpdate: null };
      byCustomer[cust].count++;
      var u = pd(r.updated_at);
      if (
        u &&
        !isNaN(u.getTime()) &&
        (!byCustomer[cust].lastUpdate || u > byCustomer[cust].lastUpdate)
      )
        byCustomer[cust].lastUpdate = u;
    });
    var staleCutoff = Date.now() - STALE_CUSTOMER_DAYS * 24 * 60 * 60 * 1000;
    var clientesInactivos = Object.keys(byCustomer)
      .map(function (k) {
        return byCustomer[k];
      })
      .filter(function (c) {
        return !c.lastUpdate || c.lastUpdate.getTime() <= staleCutoff;
      })
      .sort(function (a, b) {
        var ta = a.lastUpdate ? a.lastUpdate.getTime() : -Infinity;
        var tb = b.lastUpdate ? b.lastUpdate.getTime() : -Infinity;
        return ta - tb;
      });
    set(
      "home-clientes-inactivos-count",
      clientesInactivos.length +
        (clientesInactivos.length === 1 ? " cliente" : " clientes"),
    );
    var ciEl = document.getElementById("home-clientes-inactivos");
    if (ciEl)
      ciEl.innerHTML = clientesInactivos.length
        ? htmlListaConMas_(
            "clientes-inactivos",
            clientesInactivos,
            8,
            function (c) {
              var dias = c.lastUpdate
                ? Math.floor(
                    (Date.now() - c.lastUpdate.getTime()) /
                      (24 * 60 * 60 * 1000),
                  )
                : null;
              var sev =
                dias === null || dias >= STALE_CUSTOMER_DAYS * 2
                  ? "sev-critical"
                  : "sev-warn";
              var diasLabel =
                dias === null
                  ? "Sin actualizaciones"
                  : dias + "d sin actividad";
              return (
                '<div class="home-mini-row client-row"><span class="hm-load">' +
                esc(c.customer) +
                '</span><span class="hm-soft">' +
                esc(c.count) +
                (c.count === 1 ? " carga activa" : " cargas activas") +
                '</span><span class="hm-soft">' +
                esc(c.lastUpdate ? fmtDateTime(c.lastUpdate) : "—") +
                '</span><span class="' +
                sev +
                '">' +
                esc(diasLabel) +
                "</span></div>"
              );
            },
          )
        : '<div class="action-empty">✓ Todos los clientes con cargas activas tienen actividad reciente.</div>';
    renderCruceConfirm_(loadsNeedingCruceConfirm_(scoped));
    renderCargaPorCsr();
    renderCierresRecibidos();
  }

  function loadsNeedingCruceConfirm_(scoped) {
    return (scoped || [])
      .filter(function (r) {
        return journeyStageDone_(r.cruce_usa_fecha) && !r.cruce_confirmado;
      })
      .sort(function (a, b) {
        var da = pd(a.cruce_usa_fecha),
          db = pd(b.cruce_usa_fecha);
        return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
      });
  }
  function destinoLabel_(r) {
    return (
      titleCity(r.dest_city) +
      (r.dest_state ? ", " + String(r.dest_state).toUpperCase() : "")
    );
  }
  // Sugerencia de partida al reprogramar: ahora + 2h, redondeado a los 5 minutos — el CSR la puede
  // cambiar libremente antes de guardar. reviewLocalValue ya existe (misma función que usa "Próxima
  // revisión" para formatear el value de un <input type="datetime-local">).
  function cruceConfirmSuggestedValue_() {
    var d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    return reviewLocalValue(d);
  }
  function renderCruceConfirm_(lista) {
    var countEl = document.getElementById("home-cruce-confirm-count");
    if (countEl)
      countEl.textContent =
        lista.length + (lista.length === 1 ? " pendiente" : " pendientes");
    var box = document.getElementById("home-cruce-confirm");
    if (!box) return;
    if (!lista.length) {
      box.innerHTML =
        '<div class="action-empty">✓ Sin cruces por confirmar.</div>';
      return;
    }
    box.innerHTML = lista
      .map(function (r) {
        var loadKey = esc(r.load);
        var row =
          '<div class="home-mini-row cruce-row"><span class="hm-load">Carga ' +
          loadKey +
          '</span><span class="hm-soft">' +
          esc(r.customer || "Sin cliente") +
          '</span><span class="hm-soft">Unidad ' +
          esc(r.truck || "—") +
          " / Trailer " +
          esc(r.trailer || "—") +
          '</span><span class="hm-soft">' +
          esc(destinoLabel_(r)) +
          '</span><span class="hm-soft">Cruce: ' +
          esc(wsDate(r.cruce_usa_fecha)) +
          '</span><span><button class="ws-btn primary" data-cruce-si="' +
          loadKey +
          '">Sí, ya cruzó</button> <button class="ws-btn" data-cruce-no="' +
          loadKey +
          '">No, ajustar</button></span></div>';
        var adjust =
          '<div class="cruce-adjust" id="cruce-adjust-' +
          loadKey +
          '" hidden><input type="datetime-local" class="review-input" id="cruce-adjust-input-' +
          loadKey +
          '" value="' +
          esc(cruceConfirmSuggestedValue_()) +
          '"><button class="ws-btn primary" data-cruce-guardar="' +
          loadKey +
          '">Guardar nueva fecha</button></div>';
        return row + adjust;
      })
      .join("");
  }
  // confirmado=true: marca cruce_confirmado y listo. confirmado=false: reprograma cruce_usa_fecha a
  // nuevaFecha y deja cruce_confirmado en false (vuelve a avisar cuando esa fecha nueva pase) —
  // mismo flujo que editar el campo a mano en "Ruta y cruce" (ver saveCruceUsa en Code.gs), así que
  // también marca "Cliente pendiente" si corresponde.
  function confirmarCruce_(load, confirmado, nuevaFecha) {
    google.script.run
      .withSuccessHandler(function (res) {
        if (!res || res.ok === false) {
          showToast((res && res.error) || "No se pudo guardar", "error");
          return;
        }
        var rec = recPorLoad_(load);
        if (rec) {
          if (confirmado) {
            rec.cruce_confirmado = true;
          } else {
            rec.cruce_usa_fecha = nuevaFecha;
            rec.cruce_confirmado = false;
            setLocalNotifyPending(rec, "Cruce aduana actualizada");
            renderActionCenter(currentData);
          }
        }
        renderHomeCommand(currentData);
        showToast(
          confirmado
            ? "Cruce confirmado — Carga " + load
            : "Cruce reprogramado — Carga " + load,
          "good",
        );
      })
      .withFailureHandler(function (err) {
        showToast("No se pudo guardar: " + err.message, "error");
      })
      .confirmarCruceUsa(
        load,
        confirmado,
        nuevaFecha,
        myRealIdentity,
        myPassword,
      );
  }

  // FIX: "Carga de trabajo por CSR" — a petición de Esteban. A propósito NO usa "scoped" (que ya
  // viene acotado a los clientes del CSR activo) ni actionCenterScope: aquí el punto es comparar
  // entre TODOS los CSR, así que siempre mira el operativo completo sin importar quién esté viendo
  // el panel. Reutiliza clientesDeCsr (ya usada por currentCsrClienteFiltro) más "Seguir load" —
  // el mismo criterio de alcance que el resto del panel — para saber qué cargas le tocan a cada
  // quien, y needsAttention (ya usado por el borde rojo de las tarjetas) para contar cuántas de
  // esas necesitan atención.
  function loadsOfCsr(csrNombre) {
    var clientes = clientesDeCsr(csrNombre);
    var seguidos = loadSeguimientos
      .filter(function (s) {
        return s.csr === csrNombre;
      })
      .map(function (s) {
        return String(s.load).trim();
      });
    return (currentData || []).filter(function (r) {
      if (isArchived(r) || isCanceladaFinalizada(r)) return false;
      var cust = String(r.customer || "").toLowerCase();
      return (
        (cust && clientes.indexOf(cust) !== -1) ||
        seguidos.indexOf(String(r.load).trim()) !== -1
      );
    });
  }
  function currentWhoEsSupervisor_() {
    if (!currentWho || currentOperationalScope) return false;
    var p = (personas || []).filter(function (x) {
      return x.nombre === currentWho;
    })[0];
    return !!(p && p.rol === "Supervisor");
  }
  function renderCargaPorCsr() {
    var section = document.getElementById("group-carga-csr");
    var box = document.getElementById("home-carga-csr");
    if (!box) return;
    if (!currentWhoEsSupervisor_()) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    var csrs = (personas || []).filter(function (p) {
      return esCsrOperativo_(p);
    });
    var countEl = document.getElementById("home-carga-csr-count");
    if (countEl) countEl.textContent = csrs.length + " CSR";
    if (!csrs.length) {
      box.innerHTML =
        '<div class="action-empty">No hay CSR configurados todavía.</div>';
      return;
    }
    // FIX: Esteban — "no podemos entrar a investigar a qué le movemos" con solo el número de
    // "necesitan atención". Ahora cada fila con atención>0 trae un botón "Ver" que despliega, por
    // cada load, EL MOTIVO exacto (reutiliza needsAttentionReasons — mismo criterio que ya pinta el
    // borde rojo de la tarjeta y el ⚠ de la tabla, no uno nuevo inventado aparte) sin tener que
    // abrir la carga ni adivinar.
    var rows = csrs
      .map(function (p) {
        var cargas = loadsOfCsr(p.nombre);
        var atencionCargas = cargas.filter(needsAttention);
        return {
          nombre: p.nombre,
          total: cargas.length,
          atencion: atencionCargas.length,
          atencionCargas: atencionCargas,
        };
      })
      .sort(function (a, b) {
        return b.atencion - a.atencion || b.total - a.total;
      });
    box.innerHTML = rows
      .map(function (r, idx) {
        var sev =
          r.atencion > 0
            ? r.atencion >= 3
              ? "sev-critical"
              : "sev-warn"
            : "sev-good";
        var verBtn =
          r.atencion > 0
            ? '<button class="ws-btn" data-carga-csr-toggle="' +
              idx +
              '">Ver</button>'
            : "";
        var row =
          '<div class="home-mini-row csr-row"><span class="hm-load">' +
          esc(r.nombre) +
          '</span><span class="hm-soft">' +
          esc(r.total) +
          (r.total === 1 ? " carga activa" : " cargas activas") +
          '</span><span class="' +
          sev +
          '">' +
          esc(r.atencion) +
          (r.atencion === 1 ? " necesita atención" : " necesitan atención") +
          "</span>" +
          verBtn +
          "</div>";
        if (!r.atencion) return row;
        var detail = r.atencionCargas
          .map(function (rec) {
            return (
              '<div class="carga-csr-detail-row"><span class="hm-load">Carga ' +
              esc(rec.load) +
              '</span><span class="hm-soft">' +
              esc(rec.customer || "Sin cliente") +
              '</span><span class="sev-warn">' +
              esc(needsAttentionReasons(rec).join(" · ")) +
              "</span></div>"
            );
          })
          .join("");
        return (
          row +
          '<div class="carga-csr-detail" id="carga-csr-detail-' +
          idx +
          '" hidden>' +
          detail +
          "</div>"
        );
      })
      .join("");
  }

  function currentWhoPuedeVerCierres_() {
    if (!currentWho) return false;
    var p = (personas || []).filter(function (x) {
      return x.nombre === currentWho;
    })[0];
    return !!(p && (p.rol === "Seguimiento" || p.rol === "Supervisor"));
  }
  var lastCierresRecibidos = [];
  var cierresLoaded = false;
  function loadCierresRecibidos() {
    if (!myRealIdentity || !myPassword) {
      cierresLoaded = true;
      lastCierresRecibidos = [];
      renderCierresRecibidos();
      return;
    }
    google.script.run
      .withSuccessHandler(aplicarCierres_)
      .withFailureHandler(function () {
        // Como el SLA: es contexto para Seguimiento/Supervisor, no algo crítico para operar — si
        // falla se deja el panel como estaba en vez de tapar el resto con un error.
      })
      .getCierresTurnoRecibidos(myRealIdentity, myPassword);
  }
  function aplicarCierres_(res) {
    lastCierresRecibidos =
      res && res.ok && Array.isArray(res.items) ? res.items : [];
    cierresLoaded = true;
    renderCierresRecibidos();
  }
  function renderCierresRecibidos() {
    var section = document.getElementById("group-cierres-recibidos");
    var box = document.getElementById("home-cierres");
    if (!box) return;
    if (!currentWhoPuedeVerCierres_()) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    if (!cierresLoaded) return; // deja el "Cargando…" inicial del HTML hasta que responda el servidor
    var countEl = document.getElementById("home-cierres-count");
    if (countEl)
      countEl.textContent =
        lastCierresRecibidos.length +
        (lastCierresRecibidos.length === 1 ? " cierre" : " cierres");
    if (!lastCierresRecibidos.length) {
      box.innerHTML =
        '<div class="action-empty">Sin cierres de turno recibidos todavía.</div>';
      return;
    }
    box.innerHTML = lastCierresRecibidos
      .map(function (c, idx) {
        return (
          '<div class="home-mini-row cierre-row"><span class="hm-load">' +
          esc(c.csr || "—") +
          '</span><span class="hm-soft">' +
          esc(c.creado_en ? fmtDateTime(c.creado_en) : "—") +
          '</span><button class="ws-btn" data-cierre-toggle="' +
          idx +
          '">Ver</button></div>' +
          '<pre class="cierre-detail" id="cierre-detail-' +
          idx +
          '" hidden>' +
          esc(c.texto || "") +
          "</pre>"
        );
      })
      .join("");
  }

  function refreshOperationalAttention() {
    var journey = computeActiveJourney(currentData);
    renderHomeCommand(currentData);
    renderActionCenter(currentData, journey);
    renderShiftBrief(currentData, journey);
    renderSlaPanel();
  }

  var SLA_LOOKBACK_DAYS = 30;
  var lastSlaPairs = [];
  var slaLoaded = false;
  function loadSlaMetrics() {
    google.script.run
      .withSuccessHandler(function (res) {
        lastSlaPairs =
          res && res.ok && Array.isArray(res.pairs) ? res.pairs : [];
        slaLoaded = true;
        renderSlaPanel();
      })
      .withFailureHandler(function () {
        // Es una métrica de contexto, no algo crítico para operar — si falla, se deja el panel como
        // estaba (o "Cargando…" la primera vez) en vez de tapar el resto del panel con un error.
      })
      .getSlaComunicacion(myRealIdentity, myPassword);
  }
  function fmtMinutesSla(min) {
    min = Math.round(min);
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60),
      m = min % 60;
    return h + "h" + (m ? " " + m + "m" : "");
  }
  function renderSlaPanel() {
    var box = document.getElementById("home-sla");
    if (!box || !slaLoaded) return;
    var f = currentCsrClienteFiltro(),
      seg = loadsSeguidosScope();
    var loadInfo = {};
    (currentData || []).forEach(function (r) {
      loadInfo[String(r.load)] = r;
    });
    var scopedPairs = lastSlaPairs.filter(function (p) {
      if (!f) return true;
      var rec = loadInfo[String(p.load)];
      var cust = rec ? String(rec.customer || "").toLowerCase() : "";
      return (
        (cust && f.indexOf(cust) !== -1) ||
        seg.indexOf(String(p.load).trim()) !== -1
      );
    });
    if (!scopedPairs.length) {
      box.innerHTML =
        '<div class="action-empty">Sin comunicaciones registradas en los últimos ' +
        SLA_LOOKBACK_DAYS +
        " días.</div>";
      return;
    }
    var avgMin =
      scopedPairs.reduce(function (s, p) {
        return s + p.minutes;
      }, 0) / scopedPairs.length;
    var sev =
      avgMin <= 60 ? "sev-good" : avgMin <= 180 ? "sev-warn" : "sev-critical";
    box.innerHTML =
      '<div class="sla-summary"><div class="sla-big ' +
      sev +
      '">' +
      fmtMinutesSla(avgMin) +
      '</div><div class="sla-sub">Promedio de ' +
      esc(scopedPairs.length) +
      (scopedPairs.length === 1 ? " aviso al cliente" : " avisos al cliente") +
      " en los últimos " +
      SLA_LOOKBACK_DAYS +
      " días, medido desde el último cambio de la carga hasta el aviso.</div></div>";
  }

  function renderShiftBrief(data, journey) {
    var box = document.getElementById("shift-brief");
    if (!box) return;
    var snap = shiftSnapshot(data, journey);
    document.getElementById("brief-greeting").textContent =
      briefGreeting() +
      (myRealIdentity ? ", " + myRealIdentity : "") +
      " · Resumen de turno";
    document.getElementById("brief-time").textContent =
      "Actualizado " + new Date().toLocaleString();
    document.getElementById("brief-summary").textContent = briefText(snap);
    document.getElementById("brief-active").textContent = snap.active.length;
    document.getElementById("brief-now").textContent = snap.urgent.length;
    document.getElementById("brief-client").textContent = snap.client.length;
    document.getElementById("brief-today").textContent = snap.today.length;
    document.getElementById("brief-overdue").textContent = snap.overdue.length;
    var ta = document.getElementById("handoff-text");
    if (
      ta &&
      document.getElementById("handoff-box") &&
      !document.getElementById("handoff-box").hidden
    )
      ta.value = handoffText(snap);
    var hl = document.getElementById("handoff-list");
    if (hl)
      hl.innerHTML = snap.items
        .slice(0, 6)
        .map(function (x) {
          return (
            '<div class="handoff-item"><b>Carga ' +
            esc(x.rec.load) +
            "</b><span>" +
            esc(
              x.reasons
                .slice(0, 2)
                .map(function (q) {
                  return q.text;
                })
                .join(" · "),
            ) +
            "</span></div>"
          );
        })
        .join("");
  }

  function statusNorm(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/\.$/, "");
  }
  function hoursBetween(from, to) {
    if (!from) return null;
    var d = new Date(from);
    if (isNaN(d.getTime())) return null;
    return ((to || Date.now()) - d.getTime()) / 3600000;
  }
  function isCancelledStatus(status) {
    return statusNorm(status) === "cancelado";
  }
  function isPteArriboStatus(status) {
    var s = statusNorm(status);
    return (
      s === "pte. arrivo" ||
      s === "pte. arribo" ||
      s === "pendiente arrivo" ||
      s === "pendiente arribo"
    );
  }

  function journeyReasons(rec) {
    var reasons = [],
      now = Date.now(),
      st = statusNorm(rec.status);
    function add(level, score, text, kind) {
      reasons.push({
        level: level,
        score: score,
        text: text,
        kind: kind || "",
      });
    }
    if (isCancelledStatus(rec.status)) return reasons;
    if (rec.client_notify_pending) {
      var notifyParts = String(rec.client_notify_reason || "actualización")
        .split(" · ")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      notifyParts.forEach(function (p, i) {
        add(
          "critical",
          110 - i * 0.01,
          (i === 0 ? "Avisar al cliente: " : "") + p,
          "notify",
        );
      });
    }
    if (rec.next_review_at) {
      var rt = new Date(rec.next_review_at).getTime();
      if (!isNaN(rt) && rt <= now)
        add("critical", 105, "Seguimiento que programaste: vencido");
      else if (!isNaN(rt) && rt > now)
        add(
          "monitor",
          50,
          "Seguimiento programado " + relativeTimeLabel(rec.next_review_at),
        );
    }
    if (st === "tonu") {
      if (!rec.recargos_vg)
        add("warn", 88, "TONU · aplicar/confirmar cargo USD $350");
    } else if (
      st === "delivered" ||
      st === "completed" ||
      st === "entregado" ||
      st === "completado"
    ) {
      if (!rec.pod_sent) add("warn", 88, "POD pendiente de compartir");
    } else if (
      isPteArriboStatus(rec.status) ||
      pickupIsFuture(rec.pickup_appt)
    ) {
      // Excepción acordada: no forzar revisión cada 3h antes del arribo/pickup futuro.
    } else if (st === "en transito") {
      var commAge = hoursBetween(rec.client_notified_at);
      if (commAge === null)
        add(
          "warn",
          82,
          "Registra el aviso al cliente cuando lo hayas enviado",
          "comm",
        );
      else if (commAge >= 3)
        add("critical", 108, "Más de 3h sin estatus al cliente", "comm");
      else if (commAge >= 2.5)
        add(
          "warn",
          80,
          "Próximo estatus al cliente en " +
            Math.max(0, Math.round((3 - commAge) * 60)) +
            " min",
          "comm",
        );
      else
        add(
          "monitor",
          49,
          "Cliente actualizado hace " +
            Math.max(0, Math.floor(commAge * 60)) +
            " min",
          "comm",
        );
    } else {
      if (PROBLEM_STATUSES.indexOf(rec.status) !== -1)
        add("critical", 100, "Estatus con incidencia: " + rec.status);
    }
    if (rec.incidenciasCount && Number(rec.incidenciasCount) > 0)
      add("warn", 76, Number(rec.incidenciasCount) + " incidencia(s)");
    reasons.sort(function (a, b) {
      return b.score - a.score;
    });
    return reasons;
  }
  function journeyBucket(reasons) {
    if (!reasons.length) return null;
    var top = reasons[0];
    if (top.score >= 90) return "now";
    if (top.score >= 60) return "review";
    return "monitor";
  }
  function actionCenterScope(data) {
    var f = currentCsrClienteFiltro();
    if (!f) return data || [];
    var seg = loadsSeguidosScope();
    return (data || []).filter(function (r) {
      return (
        f.indexOf(String(r.customer || "").toLowerCase()) !== -1 ||
        seg.indexOf(String(r.load || "").trim()) !== -1
      );
    });
  }
  function openLoadFromActionCenter(load) {
    var rec = (currentData || []).filter(function (r) {
      return String(r.load) === String(load);
    })[0];
    var tab = "operacion";
    if (rec) {
      var reasons = journeyReasons(rec);
      if (
        reasons.length &&
        (reasons[0].kind === "notify" || reasons[0].kind === "comm")
      )
        tab = "comunicacion";
    }
    openLoadWorkspace(load, tab);
  }
  function renderActionRow(x) {
    var r = x.rec,
      rs = x.reasons,
      next = r.next_review_at
        ? "Revisar " + relativeTimeLabel(r.next_review_at)
        : "";
    return (
      '<div class="action-row"><div class="action-row-top"><span class="action-dot ' +
      (x.bucket === "now" ? "critical" : x.bucket === "review" ? "warn" : "") +
      '"></span>' +
      '<span class="action-load" data-journey-load="' +
      esc(r.load) +
      '">Carga ' +
      esc(r.load) +
      "</span>" +
      (r.trailer
        ? '<span class="action-trailer"><span class="lbl">Trailer</span>' +
          esc(r.trailer) +
          "</span>"
        : "") +
      '<span class="action-customer" title="' +
      esc(r.customer || "") +
      '">' +
      esc(shortCustomerName(r.customer || "")) +
      "</span>" +
      '<span class="action-review">' +
      esc(
        next ||
          (r.updated_at
            ? relativeTimeLabel(r.updated_at)
            : "sin actualización"),
      ) +
      "</span>" +
      '<button type="button" class="action-open" data-journey-load="' +
      esc(r.load) +
      '">Abrir carga</button></div>' +
      '<div class="action-reasons">' +
      rs
        .slice(0, 4)
        .map(function (q) {
          return (
            '<span class="action-reason-chip' +
            (q.kind === "notify" ? " notify" : "") +
            '">' +
            esc(q.text) +
            "</span>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }
  var homeAttentionFilter = null;
  var homeDetailsOpen_ = new Set(); // Mantener solo los detalles que el usuario decidió abrir.
  /** Plan en tres grupos: cada tarjeta reúne equipo, ruta y acciones de una sola carga. */
  function renderActionCenter(data, journey) {
    renderPendientesPuntuales_(actionCenterScope(data));
    var list = document.getElementById("action-center-list");
    if (!list) return;
    var j = journey || computeActiveJourney(data);
    var scoped = actionCenterScope(data).filter(function (r) {
      return (
        !r.archived &&
        !isCanceladaFinalizada(r) &&
        !isCancelledStatus(r.status) &&
        !isArchived(r)
      );
    });
    var reminders = window.panelGuidance.reminderEntries(
      scoped,
      Date.now(),
      PANEL_CONFIG,
    );
    var groups = window.panelUsability.attentionGroups(
      scoped,
      j.items,
      reminders,
    );
    var planned = new Set(
      groups.map(function (e) {
        return String(e.row.load);
      }),
    );
    scoped.forEach(function (r) {
      if (
        !planned.has(String(r.load)) &&
        (r.pickup_appt || r.delivery_appt || r.cruce_usa_fecha)
      )
        groups.push({
          row: r,
          reasons: [],
          bucket: "scheduled",
          reminders: [],
        });
    });
    // Reutilizar formato y clasificación en filtros, contadores y ordenamiento de este render.
    var planNow = Date.now();
    var dayFormat = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
    });
    var todayKey = dayFormat.format(new Date(planNow));
    var dayCache = new Map();
    function dayBucket(entry) {
      if (!dayCache.has(entry)) dayCache.set(entry, computeDayBucket(entry));
      return dayCache.get(entry);
    }
    function computeDayBucket(entry) {
      if (
        entry.bucket === "now" ||
        entry.reminders.some(function (r) {
          return r.needsAction;
        })
      )
        return "now";
      var times = entry.reminders
        .map(function (r) {
          return r.time;
        })
        .concat(
          [
            entry.row.pickup_appt,
            entry.row.delivery_appt,
            entry.row.cruce_usa_fecha,
          ]
            .filter(Boolean)
            .map(Date.parse),
        )
        .filter(function (t) {
          return isFinite(t) && t >= planNow;
        });
      return times.some(function (t) {
        return dayFormat.format(new Date(t)) === todayKey;
      }) ||
        entry.row.client_notify_pending ||
        entry.bucket === "review"
        ? "today"
        : "future";
    }
    groups.sort(function (a, b) {
      return (
        ["now", "today", "future"].indexOf(dayBucket(a)) -
        ["now", "today", "future"].indexOf(dayBucket(b))
      );
    });
    document.getElementById("journey-today").textContent = j.active.filter(
      function (r) {
        return isSameLocalDay(r.delivery_appt, new Date());
      },
    ).length;
    document.getElementById("journey-stale").textContent = j.active.filter(
      function (r) {
        return hoursSince(r.updated_at) >= 3;
      },
    ).length;
    document.getElementById("action-center-count").textContent =
      groups.length + (groups.length === 1 ? " carga" : " cargas");
    var counts = {
      all: groups.length,
      now: 0,
      today: 0,
      future: 0,
      review: 0,
      notify: 0,
    };
    groups.forEach(function (entry) {
      counts[dayBucket(entry)]++;
      if (entry.reminders.length) counts.review++;
      if (entry.row.client_notify_pending) counts.notify++;
    });
    if (homeAttentionFilter === null && groups.length) {
      homeAttentionFilter = counts.now
        ? "now"
        : counts.today
          ? "today"
          : "future";
    }
    var activeFilter = homeAttentionFilter || "now";
    document
      .querySelectorAll("[data-attention-filter]")
      .forEach(function (button) {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.attentionFilter === activeFilter),
        );
        button.querySelector("[data-attention-count]").textContent =
          counts[button.dataset.attentionFilter];
      });
    var extraFilters = document.querySelector(".attention-extra-filters");
    var extraLabel = {
      all: "Todas",
      review: "Revisiones y seguimientos",
      notify: "Avisar al cliente",
    }[activeFilter];
    extraFilters.querySelector("summary").textContent =
      extraLabel || "Más filtros";
    extraFilters.classList.toggle("has-active-filter", !!extraLabel);
    var filtered = groups.filter(function (entry) {
      if (["now", "today", "future"].indexOf(activeFilter) !== -1)
        return dayBucket(entry) === activeFilter;
      if (activeFilter === "review") return entry.reminders.length > 0;
      if (activeFilter === "notify") return !!entry.row.client_notify_pending;
      return true;
    });
    // Una carga aparece una sola vez. Cada columna conserva sus acciones y su propio «Ver más».
    function loadCard(entry) {
      var r = entry.row;
      var due = entry.reminders.filter(function (item) {
        return item.needsAction;
      });
      var upcoming = entry.reminders.filter(function (item) {
        return !item.needsAction;
      });
      var reason = due.length
        ? due.length +
          (due.length === 1 ? " revisión pendiente" : " revisiones pendientes")
        : r.client_notify_pending
          ? "Avisar al cliente"
          : entry.reasons.length
            ? entry.reasons[0].text
            : "Carga programada";
      var nextDate = due.length
        ? due[0].time
        : upcoming.length
          ? upcoming[0].time
          : r.delivery_appt || r.pickup_appt;
      var actions = entry.reminders.length + (r.client_notify_pending ? 1 : 0);
      return (
        '<article class="attention-load" data-attention-load="' +
        esc(r.load) +
        '">' +
        '<div class="attention-row-main"><div class="attention-load-header"><h3>Carga ' +
        esc(r.load) +
        '</h3><span class="attention-customer">' +
        esc(r.customer || "Sin cliente") +
        "</span></div>" +
        '<dl class="attention-equipment"><div><dt>Trailer</dt><dd>' +
        esc(r.trailer || "Sin asignar") +
        "</dd></div><div><dt>Truck</dt><dd>" +
        esc(r.truck || "Sin asignar") +
        "</dd></div></dl>" +
        '<div class="attention-focus"><strong>' +
        esc(reason) +
        "</strong><span>" +
        esc(nextDate ? fmtDate(new Date(nextDate)) : r.status || "Sin fecha") +
        "</span></div>" +
        '<button type="button" class="ws-btn attention-open" data-home-open="' +
        esc(r.load) +
        '">Abrir carga <span aria-hidden="true">›</span></button></div>' +
        '<details class="attention-actions" data-attention-details="' +
        esc(r.load) +
        '"' +
        (homeDetailsOpen_.has(String(r.load)) ? " open" : "") +
        ">" +
        "<summary>" +
        (actions ? "Ver acciones (" + actions + ")" : "Ver detalles") +
        '</summary><div class="attention-card-content">' +
        '<p class="attention-route">' +
        esc(
          [r.origin_city, r.origin_state].filter(Boolean).join(", ") ||
            "Origen sin capturar",
        ) +
        " → " +
        esc(
          [r.dest_city, r.dest_state].filter(Boolean).join(", ") ||
            "Destino sin capturar",
        ) +
        " · " +
        esc(r.status || "Sin estatus") +
        "</p>" +
        (entry.reasons.length
          ? '<div class="action-reasons">' +
            entry.reasons
              .filter(function (reason) {
                return (
                  reason.kind !== "notify" &&
                  !reason.text.startsWith("Seguimiento ")
                );
              })
              .map(function (reason) {
                return (
                  '<span class="action-reason-chip">' +
                  esc(reason.text) +
                  "</span>"
                );
              })
              .join("") +
            "</div>"
          : "") +
        (r.client_notify_pending
          ? '<div class="attention-notify"><span>Avisar al cliente: ' +
            esc(r.client_notify_reason || "Actualización operativa") +
            '</span><button type="button" class="ws-btn" data-home-comm="' +
            esc(r.load) +
            '">Preparar aviso</button></div>'
          : "") +
        (!entry.reminders.length
          ? "<p>Recolección: " +
            esc(fmtDate(r.pickup_appt)) +
            " · Entrega: " +
            esc(fmtDate(r.delivery_appt)) +
            "</p>"
          : "") +
        due.map(homeReminderHtml).join("") +
        (upcoming.length
          ? '<details class="home-reminders-upcoming"><summary>Próximas revisiones (' +
            upcoming.length +
            ")</summary>" +
            upcoming.map(homeReminderHtml).join("") +
            "</details>"
          : "") +
        "</div></details></article>"
      );
    }
    var lanes = [
      {
        key: "now",
        title: "Atender primero",
        note: "Vencido o requiere atención",
      },
      {
        key: "today",
        title: "Durante el día",
        note: "Revisiones y avisos de hoy",
      },
      {
        key: "future",
        title: "Próximos días",
        note: "Lo que ya está programado",
      },
    ].filter(function (lane) {
      return (
        ["now", "today", "future"].indexOf(activeFilter) === -1 ||
        lane.key === activeFilter
      );
    });
    list.classList.toggle("attention-single-lane", lanes.length === 1);
    list.innerHTML = lanes
      .map(function (lane) {
        var items = filtered.filter(function (entry) {
          return dayBucket(entry) === lane.key;
        });
        return (
          '<section class="attention-lane attention-lane-' +
          lane.key +
          '" aria-labelledby="attention-lane-' +
          lane.key +
          '">' +
          '<header class="attention-lane-head"><div><h3 id="attention-lane-' +
          lane.key +
          '">' +
          lane.title +
          "</h3><p>" +
          lane.note +
          '</p></div><span class="attention-lane-count">' +
          items.length +
          "</span></header>" +
          '<div class="attention-lane-items">' +
          (items.length
            ? htmlListaConMas_(
                "attention-" + activeFilter + "-" + lane.key,
                items,
                3,
                loadCard,
              )
            : '<p class="attention-lane-empty">' +
              (filtered.length || groups.length
                ? "Sin cargas para este grupo."
                : "Sin pendientes en este grupo.") +
              "</p>") +
          "</div></section>"
        );
      })
      .join("");
    renderHomeReminders(scoped);
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-attention-filter]");
    if (!button) return;
    homeAttentionFilter = button.getAttribute("data-attention-filter");
    document.querySelector(".attention-extra-filters").open = false;
    document
      .querySelectorAll("[data-attention-filter]")
      .forEach(function (item) {
        item.setAttribute("aria-pressed", String(item === button));
      });
    renderActionCenter(currentData);
  });

  document.getElementById("action-center-list").addEventListener(
    "toggle",
    function (event) {
      if (
        !event.target.matches("details[data-attention-details]") ||
        !event.target.isConnected
      )
        return;
      var load = event.target.dataset.attentionDetails;
      if (event.target.open) homeDetailsOpen_.add(load);
      else homeDetailsOpen_.delete(load);
    },
    true,
  );

  function kpiSimpleRowHtml(r, note) {
    return (
      '<div class="action-row"><div class="action-row-top">' +
      '<span class="action-load" data-journey-load="' +
      esc(r.load) +
      '">Carga ' +
      esc(r.load) +
      "</span>" +
      (r.trailer
        ? '<span class="action-trailer"><span class="lbl">Trailer</span>' +
          esc(r.trailer) +
          "</span>"
        : "") +
      '<span class="action-customer" title="' +
      esc(r.customer || "") +
      '">' +
      esc(shortCustomerName(r.customer || "")) +
      "</span>" +
      '<span class="action-review">' +
      esc(note || "") +
      "</span>" +
      '<button type="button" class="action-open" data-journey-load="' +
      esc(r.load) +
      '">Abrir</button></div></div>'
    );
  }
  function attentionRowHtml(r) {
    var reasons = needsAttentionReasons(r);
    return (
      '<div class="action-row"><div class="action-row-top">' +
      '<span class="action-load" data-journey-load="' +
      esc(r.load) +
      '">Carga ' +
      esc(r.load) +
      "</span>" +
      (r.trailer
        ? '<span class="action-trailer"><span class="lbl">Trailer</span>' +
          esc(r.trailer) +
          "</span>"
        : "") +
      '<span class="action-customer" title="' +
      esc(r.customer || "") +
      '">' +
      esc(shortCustomerName(r.customer || "")) +
      "</span>" +
      '<button type="button" class="action-open" data-journey-load="' +
      esc(r.load) +
      '">Abrir</button></div>' +
      '<div class="action-reasons">' +
      reasons
        .map(function (txt) {
          return '<span class="action-reason-chip">' + esc(txt) + "</span>";
        })
        .join("") +
      "</div></div>"
    );
  }
  var KPI_DETAIL_LABELS = {
    now: "🔴 Atender ahora",
    review: "🟠 Revisar",
    monitor: "🟡 Monitorear",
    clear: "🟢 Sin acción",
    today: "Entregas hoy",
    stale: "Sin actualizar (+3h)",
    attention: "⚠️ Necesitan atención",
  };
  function openKpiDetailModal(kind) {
    var list = document.getElementById("kpi-detail-list"),
      title = document.getElementById("kpi-detail-title");
    if (!list || !title) return;
    title.textContent = KPI_DETAIL_LABELS[kind] || "Cargas";
    var rowsHtml = "";
    if (
      kind === "now" ||
      kind === "review" ||
      kind === "monitor" ||
      kind === "clear"
    ) {
      // FIX: mismo cómputo EXACTO que usa renderHomeCommand() para llenar home-now/home-review/
      // home-monitor/home-clear (scoped filtrado por isDoneStatus/isCancelledStatus) — OJO que
      // esto NO es lo mismo que el "active" de computeActiveJourney (ver bloque today/stale más
      // abajo); si se usara ese otro cómputo aquí, el listado podría no cuadrar con el número de
      // la tarjeta.
      // (Actualizado: renderHomeCommand ahora usa homeBuckets_, el mismo cálculo del Action Center.)
      var matches = homeBuckets_(currentData)[kind].map(function (r) {
        var rs = journeyReasons(r);
        return { rec: r, reasons: rs, bucket: journeyBucket(rs) };
      });
      rowsHtml = matches.length
        ? matches
            .map(function (x) {
              return kind === "clear"
                ? kpiSimpleRowHtml(x.rec, "Sin pendientes identificados")
                : renderActionRow(x);
            })
            .join("")
        : '<div class="action-empty">Sin cargas en este grupo.</div>';
    } else if (kind === "today" || kind === "stale") {
      var active = computeActiveJourney(currentData).active;
      var rows =
        kind === "today"
          ? active.filter(function (r) {
              return isSameLocalDay(r.delivery_appt, new Date());
            })
          : active.filter(function (r) {
              return hoursSince(r.updated_at) >= 3;
            });
      rowsHtml = rows.length
        ? rows
            .map(function (r) {
              var note =
                kind === "today"
                  ? "Entrega " +
                    (pd(r.delivery_appt)
                      ? fmtDateTime(pd(r.delivery_appt))
                      : "—")
                  : "Sin tocar desde " +
                    (r.updated_at ? relativeTimeLabel(r.updated_at) : "—");
              return kpiSimpleRowHtml(r, note);
            })
            .join("")
        : '<div class="action-empty">Sin cargas en este grupo.</div>';
    } else if (kind === "attention") {
      // FIX: "Necesitan atención" (tarjeta de Operación completa) — a petición de Esteban, ahora
      // dice CUÁLES cargas son y POR QUÉ, en vez de solo el número. Mismo cómputo EXACTO que usa
      // updateStats() para "attentionCount" (actionCenterScope + !isArchived/!isCanceladaFinalizada
      // + needsAttention), para que el listado siempre cuadre con el número de la tarjeta. El motivo
      // reutiliza needsAttentionReasons — el mismo criterio que ya pinta el borde rojo de la tarjeta
      // y el ⚠ de la tabla (estatus con problema, revisión/recordatorio vencido, retraso de
      // pickup/entrega >90min, o sin comentarios en 2+ días).
      var attActive = actionCenterScope(currentData).filter(function (r) {
        return !isArchived(r) && !isCanceladaFinalizada(r);
      });
      var attRows = attActive.filter(needsAttention);
      rowsHtml = attRows.length
        ? attRows.map(attentionRowHtml).join("")
        : '<div class="action-empty">Sin cargas en este grupo.</div>';
    }
    list.innerHTML = rowsHtml;
    document.getElementById("kpi-detail-backdrop").classList.add("show");
    toggleKpiDetailScrollHint_();
  }
  function toggleKpiDetailScrollHint_() {
    var list = document.getElementById("kpi-detail-list"),
      hint = document.getElementById("kpi-detail-more");
    if (!list || !hint) return;
    var hasMore = list.scrollHeight - list.scrollTop - list.clientHeight > 4;
    hint.classList.toggle("show", hasMore);
  }
  (function () {
    var list = document.getElementById("kpi-detail-list");
    if (list) list.addEventListener("scroll", toggleKpiDetailScrollHint_);
  })();
  function closeKpiDetailModal() {
    document.getElementById("kpi-detail-backdrop").classList.remove("show");
  }
  document
    .getElementById("kpi-detail-close")
    .addEventListener("click", closeKpiDetailModal);
  document
    .getElementById("kpi-detail-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "kpi-detail-backdrop") closeKpiDetailModal();
    });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-kpi-detail]");
    if (b) openKpiDetailModal(b.getAttribute("data-kpi-detail"));
  });

  document.getElementById("brief-copy").addEventListener("click", function () {
    copyTextGeneric(
      briefText(shiftSnapshot(currentData)),
      "Resumen de turno copiado",
    );
  });
  document
    .getElementById("handoff-toggle")
    .addEventListener("click", function () {
      var b = document.getElementById("handoff-box");
      b.hidden = !b.hidden;
      this.textContent = b.hidden
        ? "Preparar cierre de turno"
        : "Ocultar cierre";
      if (!b.hidden) renderShiftBrief(currentData);
    });
  document
    .getElementById("handoff-regenerate")
    .addEventListener("click", function () {
      document.getElementById("handoff-text").value = handoffText(
        shiftSnapshot(currentData),
      );
      showToast("Cierre de turno actualizado", "good");
    });
  document
    .getElementById("handoff-copy")
    .addEventListener("click", function () {
      copyTextGeneric(
        document.getElementById("handoff-text").value,
        "Cierre de turno copiado",
      );
    });
  document
    .getElementById("handoff-send")
    .addEventListener("click", function () {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(enviarCierreDeTurno_);
        return;
      }
      enviarCierreDeTurno_();
    });
  function enviarCierreDeTurno_() {
    var texto = document.getElementById("handoff-text").value;
    if (!texto || !texto.trim()) {
      showToast("No hay nada que enviar", "error");
      return;
    }
    var btn = document.getElementById("handoff-send");
    btn.disabled = true;
    google.script.run
      .withSuccessHandler(function (res) {
        btn.disabled = false;
        if (!res || res.ok === false) {
          showToast((res && res.error) || "No se pudo enviar", "error");
          return;
        }
        showToast("Cierre de turno enviado", "good");
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        showToast("Error: " + err.message, "error");
      })
      .enviarCierreTurno(texto, myRealIdentity, myPassword);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-journey-load]");
    if (!btn) return;
    var kpiModal = document.getElementById("kpi-detail-backdrop");
    if (kpiModal && kpiModal.classList.contains("show")) closeKpiDetailModal();
    openLoadFromActionCenter(btn.getAttribute("data-journey-load"));
  });

  function render(data) {
    currentData = data || [];
    programarAvisos_(); // centro de avisos: revisa si hay algo nuevo con los datos recién llegados
    viewDirty.cards = true;
    viewDirty.table = true;

    lastRenderedAt = new Date();
    updateHeaderTimestamp();
    renderOperationMeta();
    var journey = computeActiveJourney(currentData);
    renderActionCenter(currentData, journey);
    renderHomeCommand(currentData);
    renderShiftBrief(currentData, journey);

    if (currentView === "table") {
      buildTableView();
    } else {
      buildCardsView();
    }
    wireCardEvents();
    applyFilters();
    refreshAlertCountdowns();
    if (!document.getElementById("page-calendario").hidden) renderCalendario_();
  }

  // Carga seleccionada en la hoja; su detalle se abre en un diálogo (renderTableDetailPanel). El panel rehace el HTML de la tabla completa cada vez que llega
  // un dato nuevo (autoRefresh cada 60s, o cualquier guardado optimista: estatus, POD, recargos,
  // etc.); guardar esto aparte (y no solo una clase en el DOM) es lo que permite que el panel de
  // detalle se vuelva a pintar con datos frescos después de cada uno de esos renders, en vez de
  // cerrarse solo.
  var selectedTableLoad = null;

  // Los eventos de tarjetas/tabla (status, POD, recargos, color, truck, trailer, citas, expandir
  // fila, etc.) se conectan UNA sola vez por delegación (ver wireDelegatedEventsOnce más abajo).
  // Esta bandera se declara aquí arriba — antes de que applyView() la use por primera vez —
  // porque "var" solo adelanta la declaración (queda "undefined"), no la asignación: si el
  // "var delegatedEventsWired = false;" se queda más abajo en el archivo, para cuando esa línea
  // por fin corre ya se ejecutó una vez wireDelegatedEventsOnce() y la deja otra vez en false,
  // provocando que los eventos se conecten dos veces (y que, por ejemplo, expandir una fila deje
  // de funcionar por el doble toggle).
  var delegatedEventsWired = false;

  var currentFilter = "all";
  var currentSearch = "";
  var currentClienteFiltro = ""; // nombre de cliente (minúsculas) o '' = todos
  // Carga al que se le dio clic desde un "Carga XXXX" de la Bitácora de turno — se fuerza a que se
  // vea en el listado aunque no pase el filtro normal de CSR/cliente (ver abrirLoadDesdeBitacora),
  // porque un pendiente de turno puede estar ligado a un load de otro CSR distinto al que lo ve.
  var forcedVisibleLoad = null;

  var personas = [];
  var asignaciones = [];
  var loadSeguimientos = [];
  var currentWho = "";
  // Cambia solo la vista: la identidad Auth y el rol administrativo permanecen iguales.
  var currentOperationalScope = false;
  var currentFollowCsrs = [];

  function esCsrOperativo_(persona) {
    return window.panelPeople.isOperational(
      persona,
      asignaciones,
      loadSeguimientos,
    );
  }

  var currentView = "table";
  try {
    // La primera entrada a esta entrega abre la hoja simple, incluso si antes se usaban tarjetas.
    if (localStorage.getItem("bajio_sheet_version") !== "1") {
      localStorage.setItem("bajio_sheet_version", "1");
      localStorage.setItem("bajio_view", "table");
    }
    currentView = localStorage.getItem("bajio_view") || "table";
  } catch (e) {}

  var tableSort = { col: null, dir: 1 };
  var ultimosComentarios = {};
  var pendientes = [];
  // ids de pendientes de load / de turno borrados pero todavía dentro de su ventana de "Deshacer"
  // (ver data-remove-pendiente/data-remove-bitacora) — loadPendientes/loadBitacora los omiten.
  var idsBorrandose_ = {};
  function sinBorrandose_(lista) {
    return (lista || []).filter(function (x) {
      return !idsBorrandose_[String(x.id)];
    });
  }

  /** Registros de cargas que el cliente todavía no ha confirmado, por eso no tienen load
   * todavía — viven aparte, en su propia sección, y nunca se mezclan con las tarjetas/tabla de
   * Loads. Tienen su propio hilo de comentarios (misma hoja "Comentarios" que los loads, solo
   * que guardados bajo el id del pendiente) — en cuanto el cliente confirma y ya se importó el
   * load real, "Vincular a load" combina esos comentarios (y la nota libre) con el historial del
   * load real, y borra el registro pendiente (ver vincularPendiente en Code.gs). */
  function pendienteCardHtml(p) {
    var origen = esc(p.origen) || "—";
    var destino = esc(p.destino) || "—";
    var meta =
      "Registrado por " +
      esc(p.creado_por || "—") +
      (p.creado_en ? " · " + fmtDateTime(p.creado_en) : "");
    var lc = ultimosComentarios[String(p.id)];
    var comentarioPreview = lc
      ? '<div class="t-comment-text">' +
        escHtml(lc.text) +
        '</div><div class="t-comment-ts">' +
        fmtDateTime(lc.ts) +
        (lc.usuario ? " · " + escHtml(lc.usuario) : "") +
        "</div>"
      : "";
    return (
      '<article class="card s-neutral" data-pendiente-id="' +
      esc(p.id) +
      '">' +
      '<div class="card-top">' +
      "<div>" +
      '<span class="customer">' +
      esc(p.cliente) +
      "</span>" +
      '<div class="route">' +
      origen +
      ' <span class="arrow">&rarr;</span> ' +
      destino +
      "</div>" +
      "</div>" +
      '<button type="button" class="csr-remove" data-remove-pendiente="' +
      esc(p.id) +
      '" title="Eliminar">&times;</button>' +
      "</div>" +
      (p.fecha_estimada
        ? '<div class="field"><div class="k">Fecha estimada</div><div class="v small">' +
          esc(window.panelUsability.formatMoment(p.fecha_estimada, true)) +
          "</div></div>"
        : "") +
      (p.nota
        ? '<div class="notes has-content">' + escHtml(p.nota) + "</div>"
        : "") +
      '<div class="t-comment-ts">' +
      meta +
      "</div>" +
      (comentarioPreview
        ? '<div class="notes has-content">' + comentarioPreview + "</div>"
        : "") +
      '<div class="comments-row">' +
      '<button type="button" class="comments-btn" data-comments-pendiente="' +
      esc(p.id) +
      '">Comentarios</button>' +
      '<button type="button" class="csr-btn" data-vincular-pendiente="' +
      esc(p.id) +
      '">Vincular a una carga</button>' +
      "</div>" +
      "</article>"
    );
  }

  function renderPendientes() {
    document.getElementById("count-pendientes").textContent = pendientes.length;
    var badgeP = document.getElementById("sidebar-badge-pendientes");
    if (badgeP) {
      badgeP.textContent =
        pendientes.length > 99 ? "99+" : String(pendientes.length);
      badgeP.classList.toggle("show", pendientes.length > 0);
    }
    var el = document.getElementById("pendientes-list");
    if (!pendientes.length) {
      el.innerHTML =
        '<div class="comments-empty">' +
        (myRealIdentity
          ? "No tienes solicitudes sin carga confirmada."
          : "Inicia sesión para ver tus solicitudes.") +
        "</div>";
      resetRenderState("pendientes-list");
      return;
    }
    // Los botones (eliminar/comentarios/vincular) están delegados en document (ver
    // wireDelegatedEventsOnce) — no hace falta reconectar nada aquí, ni siquiera para las
    // tarjetas que se acaban de crear o reemplazar.
    diffRenderContainer(
      "pendientes-list",
      pendientes,
      function (p) {
        return String(p.id);
      },
      pendienteCardHtml,
    );
  }

  function loadPendientes() {
    if (!myRealIdentity) {
      pendientes = [];
      renderPendientes();
      return;
    }
    google.script.run
      .withSuccessHandler(aplicarPendientes_)
      .getPendientes(myRealIdentity, myPassword);
  }
  function aplicarPendientes_(json) {
    pendientes = sinBorrandose_(JSON.parse(json));
    renderPendientes();
  }
