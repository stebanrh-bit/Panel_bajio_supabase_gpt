var APARTADO_ESTADOS_ = {
    cruce: "Monitoreando cruce",
    transito: "Cruzó — esperando entrega",
    entregado: "Entregó en destino",
    broker: "En broker",
    usado: "Usado para mi carga",
    liberado: "Liberado",
  };
  var APARTADO_CERRADOS_ = ["usado", "liberado"];
  var APARTADO_PASO_ = {
    cruce: 1,
    transito: 2,
    entregado: 3,
    broker: 4,
    usado: 4,
    liberado: 0,
  };
  var APARTADO_ANTERIOR_ = {
    transito: "cruce",
    entregado: "transito",
    broker: "entregado",
  };
  // Qué hay que hacer en cada paso (título del aviso de la campana).
  var APARTADO_PREGUNTA_ = {
    cruce: "¿Ya cruzó y fue despachado?",
    transito: "¿Ya entregó en destino?",
    entregado: "¿Te sirve para tu carga o va a broker?",
    broker: "Sigue en broker: ¿ya hay carga?",
  };
  // Botón para avanzar de paso según dónde va: [estado destino, texto].
  var APARTADO_AVANCES_ = {
    cruce: [["transito", "Ya cruzó / despachado"]],
    transito: [["entregado", "Ya entregó en destino"]],
    entregado: [
      ["usado", "Me sirve para mi carga"],
      ["broker", "No tengo carga → broker"],
    ],
    broker: [["usado", "Ya hay carga (cerrar)"]],
  };

  function apartadoCerrado_(ap) {
    return APARTADO_CERRADOS_.indexOf(ap.estado) !== -1;
  }
  function apartadoVencido_(ap) {
    var p = pd(ap.proxima_revision);
    return (
      !apartadoCerrado_(ap) &&
      !!p &&
      !isNaN(p.getTime()) &&
      p.getTime() <= Date.now()
    );
  }
  /** Mi carga es en menos de 24 h (o ya pasó) y el apartado todavía no entrega. */
  function apartadoMiCargaEnRiesgo_(ap) {
    var m = pd(ap.fecha_mi_carga);
    return (
      (ap.estado === "cruce" || ap.estado === "transito") &&
      !!m &&
      !isNaN(m.getTime()) &&
      m.getTime() - Date.now() <= 24 * 3600000
    );
  }
  function fechaApartadoHtml_(v, vencida) {
    if (!v) return '<span style="color:var(--ink-faint)">—</span>';
    return (
      "<span" +
      (vencida ? ' class="vencido"' : "") +
      ">" +
      (vencida ? "⚠ " : "") +
      esc(fmtDateTime(v)) +
      "</span>"
    );
  }

  function apartadoCardHtml_(ap) {
    var cerrado = apartadoCerrado_(ap),
      vence = apartadoVencido_(ap),
      ahora = Date.now();
    var pasada = function (v) {
      var d = pd(v);
      return !!d && !isNaN(d.getTime()) && d.getTime() < ahora;
    };
    var paso = APARTADO_PASO_[ap.estado] || 0,
      stepper = "";
    for (var i = 1; i <= 4; i++)
      stepper += "<i" + (i <= paso ? ' class="on"' : "") + "></i>";
    var ruta = [ap.origen, ap.destino].filter(Boolean).join(" → ");
    var sub = [ap.csr_dueno ? "CSR en VG: " + ap.csr_dueno : "", ruta]
      .filter(Boolean)
      .join(" · ");
    if (ap.creado_por && ap.creado_por !== myRealIdentity)
      sub += (sub ? " · " : "") + "Apartó: " + ap.creado_por;
    // Si el load también está en "Loads" (importado de Vanguard), se muestra cómo va en vivo.
    var rec = recPorLoad_(ap.load),
      enLoads = "";
    if (rec) {
      enLoads =
        '<div class="ap-loads">En Loads: <b>' +
        esc(rec.status || "sin estatus") +
        "</b>" +
        (rec.cruce_usa_fecha
          ? " · cruzó " + esc(fmtDateTime(rec.cruce_usa_fecha))
          : "") +
        (rec.delivery_actual
          ? " · entregó " + esc(fmtDateTime(rec.delivery_actual))
          : rec.delivery_appt
            ? " · cita entrega " + esc(fmtDateTime(rec.delivery_appt))
            : "") +
        ' <button type="button" class="link-btn" data-ap-abrir-load="' +
        esc(ap.load) +
        '">Abrir</button></div>';
    }
    var prox = "";
    if (!cerrado) {
      prox = vence
        ? '<div class="ap-proxima vencido">⏰ Toca revisar (desde ' +
          esc(fmtDateTime(ap.proxima_revision)) +
          ") — " +
          esc(APARTADO_PREGUNTA_[ap.estado] || "") +
          "</div>"
        : '<div class="ap-proxima">Próxima revisión: ' +
          esc(ap.proxima_revision ? fmtDateTime(ap.proxima_revision) : "—") +
          "</div>";
      if (apartadoMiCargaEnRiesgo_(ap))
        prox +=
          '<div class="ap-proxima vencido">⚠ Tu carga es ' +
          (pasada(ap.fecha_mi_carga) ? "ya" : "en menos de 24 h") +
          " y este load todavía no entrega. ¿Lo cambias a broker?</div>";
    }
    var btn = function (accion, texto, primario) {
      return (
        '<button type="button" class="ws-btn' +
        (primario ? " primary" : "") +
        '" data-ap-accion="' +
        accion +
        '" data-ap-id="' +
        esc(ap.id) +
        '">' +
        esc(texto) +
        "</button>"
      );
    };
    var acciones = "";
    if (!cerrado) {
      (APARTADO_AVANCES_[ap.estado] || []).forEach(function (x, idx) {
        acciones += btn(x[0], x[1], idx === 0);
      });
      if (apartadoMiCargaEnRiesgo_(ap))
        acciones += btn("broker", "Cambiar a broker");
      acciones += btn("revisar", "Ya revisé (+" + ap.frecuencia_horas + " h)");
      if (APARTADO_ANTERIOR_[ap.estado])
        acciones += btn("atras", "↶ Paso anterior");
      if (ap.destino) acciones += btn("radar", "Cargas en Broker cerca");
      acciones += btn("editar", "Editar") + btn("liberado", "Liberar");
    } else {
      acciones += btn("reabrir", "Reabrir");
    }
    acciones += btn("eliminar", "Eliminar");
    var hist = (ap.historial || []).slice().reverse();
    return (
      '<article class="ap-card' +
      (vence || apartadoMiCargaEnRiesgo_(ap) ? " ap-revisar" : "") +
      (cerrado ? " ap-cerrado" : "") +
      '" data-apartado-id="' +
      esc(ap.id) +
      '">' +
      '<div class="ap-head"><div><b>Carga ' +
      esc(ap.load) +
      "</b><small>" +
      esc(sub || "Sin datos del viaje") +
      "</small></div>" +
      '<span class="ap-estado e-' +
      esc(ap.estado) +
      '">' +
      esc(APARTADO_ESTADOS_[ap.estado] || ap.estado) +
      "</span></div>" +
      '<div class="ap-stepper" title="Paso ' +
      paso +
      ' de 4">' +
      stepper +
      "</div>" +
      '<dl class="ap-datos">' +
      "<dt>Cruce</dt><dd>" +
      fechaApartadoHtml_(
        ap.fecha_cruce,
        ap.estado === "cruce" && pasada(ap.fecha_cruce),
      ) +
      "</dd>" +
      "<dt>Entrega destino</dt><dd>" +
      fechaApartadoHtml_(
        ap.fecha_entrega,
        (ap.estado === "cruce" || ap.estado === "transito") &&
          pasada(ap.fecha_entrega),
      ) +
      "</dd>" +
      "<dt>Mi carga</dt><dd>" +
      (ap.mi_carga ? esc(ap.mi_carga) + " · " : "") +
      fechaApartadoHtml_(
        ap.fecha_mi_carga,
        !cerrado && apartadoMiCargaEnRiesgo_(ap),
      ) +
      "</dd>" +
      "<dt>Avisarme</dt><dd>cada " +
      esc(ap.frecuencia_horas) +
      " h</dd>" +
      "</dl>" +
      enLoads +
      prox +
      (ap.nota ? '<div class="ap-nota">' + esc(ap.nota) + "</div>" : "") +
      '<div class="ap-acciones">' +
      acciones +
      "</div>" +
      '<details class="ap-hist" data-ap-history="' +
      esc(ap.id) +
      '"><summary>Ver historial</summary><ul></ul><button type="button" hidden data-ap-more>Ver más</button></details>' +
      "</article>"
    );
  }

  function loadApartadoHistory_(details, offset) {
    if (details.dataset.busy) return;
    details.dataset.busy = "1";
    google.script.run
      .withSuccessHandler(function (res) {
        delete details.dataset.busy;
        if (!details.isConnected) return;
        if (!res || res.ok === false) {
          showToast(
            (res && res.error) || "No se pudo cargar el historial",
            "error",
          );
          return;
        }
        var ul = details.querySelector("ul");
        if (!offset) ul.innerHTML = "";
        (res.items || []).forEach(function (h) {
          var li = document.createElement("li");
          li.textContent = fmtDateTime(h.ts) + " · " + h.por + ": " + h.txt;
          ul.append(li);
        });
        details.dataset.loaded = "1";
        var more = details.querySelector("[data-ap-more]");
        more.hidden = res.nextOffset == null;
        more.onclick = function () {
          loadApartadoHistory_(details, res.nextOffset);
        };
      })
      .withFailureHandler(function (err) {
        delete details.dataset.busy;
        showToast(err.message, "error");
      })
      .getHistorialApartado(details.dataset.apHistory, offset || 0);
  }
  document.addEventListener(
    "toggle",
    function (e) {
      var el = e.target;
      if (
        el.matches &&
        el.matches("[data-ap-history]") &&
        el.open &&
        !el.dataset.loaded
      )
        loadApartadoHistory_(el, 0);
    },
    true,
  );

  function badgeApartados_() {
    var porRevisar = apartados.filter(function (ap) {
      return apartadoVencido_(ap) || apartadoMiCargaEnRiesgo_(ap);
    }).length;
    var badge = document.getElementById("sidebar-badge-apartados");
    if (badge) {
      badge.textContent = porRevisar > 99 ? "99+" : String(porRevisar);
      badge.classList.toggle("show", porRevisar > 0);
    }
  }

  function renderApartados_() {
    badgeApartados_();
    if (!document.getElementById("page-calendario").hidden) renderCalendario_();
    var cont = document.getElementById("apartados-lista");
    if (!cont) return;
    var filtro = document.getElementById("apartados-filtro").value;
    var q = document
      .getElementById("apartados-buscar")
      .value.trim()
      .toLowerCase();
    var lista = apartados.filter(function (ap) {
      var cerrado = apartadoCerrado_(ap);
      if (filtro === "activos" && cerrado) return false;
      if (filtro === "cerrados" && !cerrado) return false;
      if (
        filtro === "revisar" &&
        !(apartadoVencido_(ap) || apartadoMiCargaEnRiesgo_(ap))
      )
        return false;
      if (!q) return true;
      return (
        [
          ap.load,
          ap.csr_dueno,
          ap.origen,
          ap.destino,
          ap.mi_carga,
          ap.nota,
          ap.creado_por,
        ]
          .join(" ")
          .toLowerCase()
          .indexOf(q) !== -1
      );
    });
    lista.sort(function (a, b) {
      var ca = apartadoCerrado_(a),
        cb = apartadoCerrado_(b);
      if (ca !== cb) return ca ? 1 : -1;
      if (ca)
        return String(b.actualizado_en).localeCompare(String(a.actualizado_en));
      var ra = apartadoVencido_(a) || apartadoMiCargaEnRiesgo_(a),
        rb = apartadoVencido_(b) || apartadoMiCargaEnRiesgo_(b);
      if (ra !== rb) return ra ? -1 : 1;
      return String(a.proxima_revision || "9").localeCompare(
        String(b.proxima_revision || "9"),
      );
    });
    if (!myRealIdentity) {
      cont.innerHTML =
        '<div class="ap-vacio">Inicia sesión para ver tus loads apartados.</div>';
      return;
    }
    if (!apartadosCargados_) {
      cont.innerHTML = '<div class="ap-vacio">Cargando…</div>';
      return;
    }
    cont.innerHTML = lista.length
      ? lista.map(apartadoCardHtml_).join("")
      : apartados.length
        ? '<div class="ap-vacio">Nada con este filtro.</div>'
        : guiaHtml_(
            "Así funcionan los loads apartados",
            [
              [
                "Aparta el load",
                "Cuando otro CSR tiene un viaje que te sirve para regresar cargado, dale <b>+ Apartar load</b> (o <b>Apartar</b> desde el Radar). Pon fecha de cruce y de entrega.",
              ],
              [
                "El panel te avisa",
                "La campana te recuerda revisar cuando debería cruzar, cuando debería entregar y después cada las horas que elijas.",
              ],
              [
                "Decide",
                "Ya entregó: úsalo para tu carga, o si no tienes, pásalo a <b>broker</b>. Al cerrarlo deja de avisar.",
              ],
            ],
            '<button type="button" class="ws-btn primary" data-guia-accion="apartar">+ Apartar mi primer load</button>',
          );
  }

  /** Guía de primeros pasos para secciones vacías (Apartados, Radar). */
  function guiaHtml_(titulo, pasos, accionHtml) {
    return (
      '<div class="guia"><b class="guia-titulo">' +
      esc(titulo) +
      '</b><ol class="guia-pasos">' +
      pasos
        .map(function (p) {
          return "<li><b>" + esc(p[0]) + "</b><span>" + p[1] + "</span></li>";
        })
        .join("") +
      "</ol>" +
      (accionHtml || "") +
      "</div>"
    );
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-guia-accion]");
    if (!b) return;
    var a = b.getAttribute("data-guia-accion");
    if (a === "apartar") document.getElementById("apartado-nuevo").click();
    if (a === "radar-subir") document.getElementById("radar-subir").click();
    if (a === "radar-origen") document.getElementById("radar-origen").focus();
  });

  var apartadosSeq_ = 0;
  function loadApartados_() {
    var seq = ++apartadosSeq_;
    if (!myRealIdentity) {
      apartados = [];
      apartadosCargados_ = false;
      renderApartados_();
      return;
    }
    google.script.run
      .withSuccessHandler(function (res) {
        if (seq !== apartadosSeq_) return; // respuesta de una petición vieja
        aplicarApartados_(res);
      })
      .getApartados(myRealIdentity, myPassword);
  }
  function aplicarApartados_(res) {
    if (!res || res.ok === false) return;
    apartadosSeq_++; // lo que venga de una petición anterior ya no aplica
    apartados = sinBorrandose_(res.items || []);
    apartadosCargados_ = true;
    renderApartados_();
    programarAvisos_();
  }

  function reemplazarApartado_(ap) {
    var hay = false;
    apartados = apartados.map(function (x) {
      if (x.id === ap.id) {
        hay = true;
        return ap;
      }
      return x;
    });
    if (!hay) apartados.unshift(ap);
    renderApartados_();
    if (!document.getElementById("page-radar").hidden) renderRadar_(); // "Apartar" → "Apartado ✓"
    programarAvisos_();
  }

  /** Cambia de paso / "Ya revisé" desde la tarjeta o desde la campana. */
  function accionApartado_(id, accion, boton, alTerminar) {
    var ap = apartados.filter(function (x) {
      return x.id === id;
    })[0];
    if (!ap) return;
    if (accion === "atras") accion = APARTADO_ANTERIOR_[ap.estado];
    if (accion === "reabrir") accion = "cruce";
    if (!accion) return;
    if (boton) boton.disabled = true;
    var ok = function (res) {
      reemplazarApartado_(res.apartado);
      if (alTerminar) alTerminar();
      showToast(
        accion === "revisar"
          ? "Revisión registrada — próxima: " +
              fmtDateTime(res.apartado.proxima_revision) +
              " — Carga " +
              ap.load
          : "Carga " + ap.load + ": " + APARTADO_ESTADOS_[res.apartado.estado],
        "good",
      );
    };
    var fallo = function (err) {
      if (boton) boton.disabled = false;
      showToast("No se pudo guardar: " + err.message, "error");
    };
    if (accion === "revisar")
      guardarConVerificacion_(ok, fallo).revisarApartado(
        id,
        "",
        myRealIdentity,
        myPassword,
      );
    else
      guardarConVerificacion_(ok, fallo).cambiarEstadoApartado(
        id,
        accion,
        "",
        myRealIdentity,
        myPassword,
      );
  }

  function verApartado_(id) {
    showMainPage("apartados");
    var ap = apartados.filter(function (x) {
      return x.id === id;
    })[0];
    if (ap && apartadoCerrado_(ap))
      document.getElementById("apartados-filtro").value = "todos";
    document.getElementById("apartados-buscar").value = "";
    renderApartados_();
    setTimeout(function () {
      var el = document.querySelector(
        '[data-apartado-id="' +
          (window.CSS && CSS.escape ? CSS.escape(id) : id) +
          '"]',
      );
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
  }

  function abrirApartado_(ap) {
    apartadoEditando_ = ap ? ap.id : null;
    var aLocal = function (v) {
      var d = pd(v);
      return d && !isNaN(d.getTime()) ? toDatetimeLocalValue(d) : "";
    };
    document.getElementById("apartado-titulo").textContent = ap
      ? "Editar load apartado " + ap.load
      : "Apartar load para regreso";
    document.getElementById("ap-load").value = ap ? ap.load : "";
    document.getElementById("ap-csr").value = ap ? ap.csr_dueno : "";
    document.getElementById("ap-origen").value = ap ? ap.origen : "";
    document.getElementById("ap-destino").value = ap ? ap.destino : "";
    document.getElementById("ap-fecha-cruce").value = ap
      ? aLocal(ap.fecha_cruce)
      : "";
    document.getElementById("ap-fecha-entrega").value = ap
      ? aLocal(ap.fecha_entrega)
      : "";
    document.getElementById("ap-mi-carga").value = ap ? ap.mi_carga : "";
    document.getElementById("ap-fecha-mi-carga").value = ap
      ? aLocal(ap.fecha_mi_carga)
      : "";
    document.getElementById("ap-frecuencia").value = String(
      ap ? ap.frecuencia_horas : 3,
    );
    if (!document.getElementById("ap-frecuencia").value)
      document.getElementById("ap-frecuencia").value = "3";
    document.getElementById("ap-nota").value = ap ? ap.nota : "";
    document.getElementById("apartado-error").style.display = "none";
    document.getElementById("apartado-backdrop").classList.add("show");
    // Foco inmediato: no interrumpir el CSR que el usuario ya empezó a escribir.
    document.getElementById("ap-load").focus();
    recordarFotoModal_("apartado-backdrop");
  }
  function cerrarApartadoModal_() {
    document.getElementById("apartado-backdrop").classList.remove("show");
  }
  function cerrarApartadoConAviso_() {
    cerrarSiNoHayCambios_("apartado-backdrop", cerrarApartadoModal_);
  }

  /** Si el load ya está en "Loads", llena origen/destino/fechas que estén vacíos. */
  document.getElementById("ap-load").addEventListener("change", function () {
    var rec = recPorLoad_(this.value.trim());
    if (!rec) return;
    var poner = function (id, v) {
      var el = document.getElementById(id);
      if (el && !el.value && v) el.value = v;
    };
    poner(
      "ap-origen",
      [rec.origin_city, rec.origin_state].filter(Boolean).join(", "),
    );
    poner(
      "ap-destino",
      [rec.dest_city, rec.dest_state].filter(Boolean).join(", "),
    );
    var d = pd(rec.cruce_usa_fecha);
    if (d && !isNaN(d.getTime()))
      poner("ap-fecha-cruce", toDatetimeLocalValue(d));
    d = pd(rec.delivery_appt);
    if (d && !isNaN(d.getTime()))
      poner("ap-fecha-entrega", toDatetimeLocalValue(d));
    showToast(
      "Datos tomados del Carga " + rec.load + " en la hoja Loads",
      "good",
    );
  });

  document
    .getElementById("apartado-nuevo")
    .addEventListener("click", function () {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          abrirApartado_(null);
        });
        return;
      }
      abrirApartado_(null);
    });
  document
    .getElementById("apartado-cerrar")
    .addEventListener("click", cerrarApartadoConAviso_);
  document
    .getElementById("apartado-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "apartado-backdrop") cerrarApartadoConAviso_();
    });
  document
    .getElementById("apartado-guardar")
    .addEventListener("click", function () {
      var aIso = function (id) {
        var v = document.getElementById(id).value;
        if (!v) return "";
        var d = new Date(v);
        return isNaN(d.getTime()) ? "" : d.toISOString();
      };
      var datos = {
        id: apartadoEditando_ || "",
        load: document.getElementById("ap-load").value.trim(),
        csr_dueno: document.getElementById("ap-csr").value.trim(),
        origen: document.getElementById("ap-origen").value.trim(),
        destino: document.getElementById("ap-destino").value.trim(),
        fecha_cruce: aIso("ap-fecha-cruce"),
        fecha_entrega: aIso("ap-fecha-entrega"),
        mi_carga: document.getElementById("ap-mi-carga").value.trim(),
        fecha_mi_carga: aIso("ap-fecha-mi-carga"),
        frecuencia_horas:
          Number(document.getElementById("ap-frecuencia").value) || 3,
        nota: document.getElementById("ap-nota").value.trim(),
      };
      var err = document.getElementById("apartado-error");
      if (!datos.load) {
        err.textContent = "Escribe el número de load apartado.";
        err.style.display = "";
        return;
      }
      var btn = this;
      btn.disabled = true;
      guardarConVerificacion_(
        function (res) {
          btn.disabled = false;
          cerrarApartadoModal_();
          reemplazarApartado_(res.apartado);
          showToast(
            (datos.id
              ? "Apartado actualizado"
              : "Carga " + datos.load + " apartado") +
              " — próxima revisión: " +
              fmtDateTime(res.apartado.proxima_revision),
            "good",
          );
        },
        function (e) {
          btn.disabled = false;
          err.textContent = "No se pudo guardar: " + e.message;
          err.style.display = "";
        },
      ).guardarApartado(datos, myRealIdentity, myPassword);
    });

  document
    .getElementById("apartados-filtro")
    .addEventListener("change", renderApartados_);
  document
    .getElementById("apartados-buscar")
    .addEventListener("input", renderApartados_);
  document
    .getElementById("apartados-lista")
    .addEventListener("click", function (e) {
      var b = e.target.closest("[data-ap-abrir-load]");
      if (b) {
        openLoadWorkspace(b.getAttribute("data-ap-abrir-load"), "operacion");
        return;
      }
      b = e.target.closest("[data-ap-accion]");
      if (!b) return;
      var id = b.getAttribute("data-ap-id"),
        accion = b.getAttribute("data-ap-accion");
      var ap = apartados.filter(function (x) {
        return x.id === id;
      })[0];
      if (!ap) return;
      if (accion === "editar") {
        abrirApartado_(ap);
        return;
      }
      if (accion === "radar") {
        abrirRadarDesde_(ap.destino);
        return;
      }
      if (accion === "liberado") {
        confirmarModal_(
          "Liberar el load " + ap.load,
          '<p>Lo sueltas: ya no lo vas a usar y se dejan de mandar avisos. Queda en "Cerrados" por si lo necesitas reabrir.</p>',
          "Sí, liberar",
          function () {
            accionApartado_(id, "liberado", b);
          },
        );
        return;
      }
      if (accion === "eliminar") {
        idsBorrandose_[id] = true;
        apartados = apartados.filter(function (x) {
          return x.id !== id;
        });
        renderApartados_();
        programarAvisos_();
        accionConDeshacer_(
          "Apartado eliminado",
          function () {
            guardarConVerificacion_(
              function () {
                delete idsBorrandose_[id];
                loadApartados_();
              },
              function (err) {
                delete idsBorrandose_[id];
                loadApartados_();
                showToast("No se pudo eliminar: " + err.message, "error");
              },
            ).eliminarApartado(id, myRealIdentity, myPassword);
          },
          function () {
            delete idsBorrandose_[id];
            loadApartados_();
          },
        );
        return;
      }
      accionApartado_(id, accion, b);
    });

  // ===== Radar de millas =====
  // Cargas de TODO el equipo con "Broker" en Regresos (columna P del Excel de VanGuard, ya viene en
  // Loads), ordenadas por distancia en línea recta desde un origen. Las ciudades se ubican con
  // OpenStreetMap (Nominatim: gratis, sin cuenta, máx. 1 consulta por segundo) solo la primera vez;
  // lo encontrado se guarda en la hoja "Coordenadas" (ver guardarCoordenadas en Code.gs) para todo
  // el equipo, así casi nunca se consulta afuera.
