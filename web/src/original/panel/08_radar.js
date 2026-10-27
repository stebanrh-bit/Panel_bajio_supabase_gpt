  var RADAR_CONOCIDAS_ = {
    // ciudades frecuentes (las del Radar original), sin red
    "three rivers|mi": [41.9445, -85.6336],
    "enid|ok": [36.3956, -97.8784],
    "sanford|nc": [35.4799, -79.1803],
    "weslaco|tx": [26.1597, -97.9908],
    "louisville|ky": [38.2527, -85.7585],
    "plymouth|in": [41.3434, -86.3097],
    "duncan|sc": [34.9385, -82.1418],
    "hammond|in": [41.5834, -87.5],
    "simpsonville|ky": [38.2231, -85.3508],
    "san luis potosi|slp": [22.1565, -100.9855],
    "montgomery|al": [32.3668, -86.3],
    "guanajuato|gto": [21.019, -101.2574],
    "chattanooga|tn": [35.0456, -85.3097],
    "madison|ms": [32.4637, -90.1284],
    "wooster|oh": [40.8051, -81.9351],
    "warren|mi": [42.5145, -83.0147],
    "new braunfels|tx": [29.703, -98.1245],
    "houston|tx": [29.7604, -95.3698],
    "temple|tx": [31.0982, -97.3428],
    "loveland|co": [40.3978, -105.075],
    "murfreesboro|tn": [35.8456, -86.3903],
    "spring hill|tn": [35.7512, -86.93],
    "waverly|tn": [36.0867, -87.7944],
    "rochester hill|mi": [42.6583, -83.1499],
    "rochester hills|mi": [42.6583, -83.1499],
    "lewisburg|tn": [35.4492, -86.7902],
    "greer|sc": [34.9382, -82.2271],
    "queretaro|qro": [20.5888, -100.3899],
    "collierville|tn": [35.042, -89.6645],
    "toledo|oh": [41.6528, -83.5379],
    "oklahoma city|ok": [35.4676, -97.5164],
    "bellefontaine|oh": [40.3617, -83.7607],
    "memphis|tn": [35.1495, -90.049],
    "brook park|oh": [41.4017, -81.8407],
    "columbus|in": [39.2014, -85.9214],
    "charleston|sc": [32.7765, -79.9311],
    "coldwater|mi": [41.9408, -84.9816],
    "desoto|tx": [32.5896, -96.857],
    "detroit|mi": [42.3314, -83.0458],
    "elgin|il": [42.0354, -88.2826],
    "fountain inn|sc": [34.6904, -82.1873],
    "fremont|ca": [37.5485, -121.9886],
    "gainesville|ga": [34.2979, -83.8241],
    "grand prairie|tx": [32.7459, -96.9978],
    "laredo|tx": [27.5306, -99.4803],
    "normal|il": [40.5142, -88.9906],
    "pataskala|oh": [39.9931, -82.6679],
    "redlands|ca": [34.0556, -117.1825],
    "santa fe springs|ca": [33.9456, -118.0859],
    "sumter|sc": [33.9204, -80.3414],
    "tuscaloosa|al": [33.2098, -87.5692],
    "wilmer|tx": [32.599, -96.6975],
    "youngsville|nc": [36.0301, -78.5683],
    "auburn hills|mi": [42.6875, -83.2341],
    "nuevo laredo|tam": [27.4862, -99.5075],
    "pesqueria|nl": [25.7783, -100.0539],
    "saltillo|coah": [25.4232, -101.0053],
    "monterrey|nl": [25.6866, -100.3161],
    "silao|gto": [20.9434, -101.428],
    "irapuato|gto": [20.6767, -101.3559],
    "celaya|gto": [20.5234, -100.8157],
    "leon|gto": [21.1226, -101.6818],
    "aguascalientes|ags": [21.8853, -102.2916],
    "puebla|pue": [19.0414, -98.2063],
    "toluca|mex": [19.2826, -99.6557],
    "ramos arizpe|coah": [25.5378, -100.9469],
  };
  var RADAR_MX_ = {
    ags: "Aguascalientes",
    bc: "Baja California",
    bcs: "Baja California Sur",
    camp: "Campeche",
    chis: "Chiapas",
    chih: "Chihuahua",
    cdmx: "Ciudad de México",
    df: "Ciudad de México",
    coah: "Coahuila",
    col: "Colima",
    dgo: "Durango",
    gto: "Guanajuato",
    gro: "Guerrero",
    hgo: "Hidalgo",
    jal: "Jalisco",
    mex: "Estado de México",
    edomex: "Estado de México",
    mich: "Michoacán",
    mor: "Morelos",
    nay: "Nayarit",
    nl: "Nuevo León",
    oax: "Oaxaca",
    pue: "Puebla",
    qro: "Querétaro",
    qroo: "Quintana Roo",
    slp: "San Luis Potosí",
    sin: "Sinaloa",
    son: "Sonora",
    tab: "Tabasco",
    tam: "Tamaulipas",
    tamps: "Tamaulipas",
    tlax: "Tlaxcala",
    ver: "Veracruz",
    yuc: "Yucatán",
    zac: "Zacatecas",
  };
  var RADAR_US_ =
    "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(
      " ",
    );
  var radarCoords_ = null; // llave → [lat, lon] (conocidas + hoja Coordenadas + nuevas)
  var radarFallidas_ = {}; // llaves que OpenStreetMap no encontró en esta sesión
  var radarResultados_ = null; // [{ r, key, dist }] del último cálculo
  var radarOrigenTxt_ = "";
  var radarOcupado_ = false;
  var radarUltimaConsulta_ = 0;

  function radarNorm_(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function radarKey_(ciudad, estado) {
    return radarNorm_(ciudad) + "|" + radarNorm_(estado).replace(/\s/g, "");
  }
  function radarLugar_(ciudad, estado) {
    return (
      titleCity(ciudad) + (estado ? ", " + String(estado).toUpperCase() : "")
    );
  }
  function radarMillas_(a, b) {
    var R = 3958.8,
      rad = function (d) {
        return (d * Math.PI) / 180;
      };
    var dLat = rad(b[0] - a[0]),
      dLon = rad(b[1] - a[1]);
    var h =
      Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(rad(a[0])) *
        Math.cos(rad(b[0])) *
        Math.pow(Math.sin(dLon / 2), 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function radarEstado_(txt, err) {
    var e = document.getElementById("radar-estado");
    e.textContent = txt || "";
    e.className = "radar-estado" + (err ? " err" : "");
  }
  function radarProgreso_(pct) {
    var p = document.getElementById("radar-progreso");
    p.hidden = pct === null;
    if (pct !== null)
      document.getElementById("radar-progreso-barra").style.width = pct + "%";
  }

  function radarCargarCoords_(listo) {
    var keys = radarCargas_("todas")
      .map(function (r) {
        return radarKey_(r.dest_city, r.dest_state);
      })
      .concat([radarOrigenKey_])
      .filter(Boolean);
    radarCoords_ = radarCoords_ || Object.assign({}, RADAR_CONOCIDAS_);
    var missing = keys.filter(function (key) {
      return !Object.prototype.hasOwnProperty.call(radarCoords_, key);
    });
    if (!missing.length) {
      listo();
      return;
    }
    google.script.run
      .withSuccessHandler(function (res) {
        Object.assign(radarCoords_, (res && res.items) || {});
        listo();
      })
      .withFailureHandler(listo)
      .getCoordenadas(missing, myRealIdentity, myPassword);
  }

  /** Pregunta a OpenStreetMap dónde está "ciudad, estado". Respeta 1 consulta por segundo. */
  function radarBuscarOSM_(ciudad, estado) {
    var st = radarNorm_(estado).replace(/\s/g, ""),
      p;
    if (RADAR_US_.indexOf(st) !== -1)
      p =
        "city=" +
        encodeURIComponent(ciudad) +
        "&state=" +
        encodeURIComponent(st.toUpperCase()) +
        "&country=USA";
    else if (RADAR_MX_[st])
      p =
        "city=" +
        encodeURIComponent(ciudad) +
        "&state=" +
        encodeURIComponent(RADAR_MX_[st]) +
        "&country=Mexico";
    else p = "q=" + encodeURIComponent(ciudad + (estado ? ", " + estado : ""));
    var espera = Math.max(0, radarUltimaConsulta_ + 1100 - Date.now());
    return new Promise(function (ok) {
      setTimeout(ok, espera);
    })
      .then(function () {
        radarUltimaConsulta_ = Date.now();
        return window.panelNetwork.fetchExternal(
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&" +
            p,
          { headers: { Accept: "application/json" }, group: "geocode" },
        );
      })
      .then(function (r) {
        if (!r.ok) throw new Error("OpenStreetMap respondió " + r.status);
        return r.json();
      })
      .then(function (d) {
        return d && d.length ? [Number(d[0].lat), Number(d[0].lon)] : null;
      });
  }

  /** Ubica todas las llaves que falten (una tras otra), las guarda en la hoja y llama a listo(). */
  function radarUbicar_(pendientes, listo) {
    var nuevas = [],
      i = 0,
      errorRed = false;
    var siguiente = function () {
      if (i >= pendientes.length) {
        radarProgreso_(null);
        if (nuevas.length)
          google.script.run
            .withSuccessHandler(function () {})
            .withFailureHandler(function () {})
            .guardarCoordenadas(nuevas, myRealIdentity, myPassword);
        listo(errorRed);
        return;
      }
      var x = pendientes[i++];
      radarEstado_(
        "Ubicando ciudades nuevas en OpenStreetMap… " +
          i +
          " de " +
          pendientes.length +
          " (" +
          radarLugar_(x.ciudad, x.estado) +
          ")",
      );
      radarProgreso_(Math.round((i * 100) / pendientes.length));
      radarBuscarOSM_(x.ciudad, x.estado)
        .then(function (c) {
          if (c) {
            radarCoords_[x.key] = c;
            nuevas.push({
              key: x.key,
              ciudad: x.ciudad,
              estado: x.estado,
              lat: c[0],
              lon: c[1],
            });
          } else radarFallidas_[x.key] = true;
        })
        .catch(function () {
          errorRed = true;
        })
        .then(siguiente);
    };
    siguiente();
  }

  // Fuente de cargas del Radar: el Excel de VanGuard que se sube aquí (el que importa el panel no
  // trae ciudad/estado de destino). Mismo formato que el Radar original: desde la fila 3,
  // A = load, I = ciudad, J = estado, L = Delivery appt., P = Regresos (solo filas con "Broker").
  // Se comparte con todo el equipo (hoja "RadarExcel", ver guardarRadarExcel en Code.gs): el último
  // que lo sube lo reemplaza para todos. En este navegador queda una copia para abrir más rápido.
  var radarExcel_ = null; // { nombre, cargado_en, por, compartido, filas: [{ load, ciudad, estado, regresos, entrega }] }
  try {
    radarExcel_ = JSON.parse(
      localStorage.getItem("bajio_radar_excel") || "null",
    );
  } catch (e) {}
  var radarExcelRevisadoEn_ = 0; // cuándo se preguntó al servidor por última vez (se repite cada 5 min)

  function guardarRadarExcelLocal_() {
    try {
      if (radarExcel_)
        localStorage.setItem("bajio_radar_excel", JSON.stringify(radarExcel_));
      else localStorage.removeItem("bajio_radar_excel");
    } catch (e) {}
  }
  /** Sube el Excel actual a la hoja del equipo. */
  function compartirRadarExcel_(avisar) {
    if (!radarExcel_ || !myRealIdentity || !myPassword) return;
    google.script.run
      .withSuccessHandler(function (res) {
        if (!res || res.ok === false) {
          if (avisar)
            showToast(
              "No se pudo compartir el Excel: " + ((res && res.error) || ""),
              "error",
            );
          return;
        }
        radarExcel_.compartido = true;
        radarExcel_.por = res.por;
        radarExcel_.cargado_en = res.cargado_en;
        guardarRadarExcelLocal_();
        renderRadarFuente_();
        if (avisar)
          showToast(
            "Excel compartido con todo el equipo (" + res.total + " cargas)",
            "good",
          );
      })
      .withFailureHandler(function (err) {
        if (avisar)
          showToast("No se pudo compartir el Excel: " + err.message, "error");
      })
      .guardarRadarExcel(
        { nombre: radarExcel_.nombre, filas: radarExcel_.filas },
        myRealIdentity,
        myPassword,
      );
  }
  /** Trae el Excel del equipo (una vez por sesión, al abrir el Radar). */
  function revisarRadarExcelEquipo_(listo) {
    if (
      Date.now() - radarExcelRevisadoEn_ < 300000 ||
      !myRealIdentity ||
      !myPassword
    ) {
      if (listo) listo();
      return;
    }
    google.script.run
      .withSuccessHandler(function (res) {
        radarExcelRevisadoEn_ = Date.now();
        if (res && res.ok !== false) {
          var x = res.excel;
          if (x) {
            if (!radarExcel_ || radarExcel_.cargado_en !== x.cargado_en) {
              radarExcel_ = {
                nombre: x.nombre,
                cargado_en: x.cargado_en,
                por: x.por,
                filas: x.filas,
                v: 2,
                compartido: true,
              };
              radarResultados_ = null;
              guardarRadarExcelLocal_();
            }
          } else if (radarExcel_ && radarExcel_.compartido) {
            radarExcel_ = null; // alguien lo quitó para el equipo
            radarResultados_ = null;
            guardarRadarExcelLocal_();
          } else if (radarExcel_) {
            compartirRadarExcel_(false); // copia de antes de esta versión: se comparte ahora
          }
        }
        if (listo) listo();
      })
      .withFailureHandler(function () {
        radarExcelRevisadoEn_ = Date.now();
        if (listo) listo();
      })
      .getRadarExcel(myRealIdentity, myPassword);
  }

  function radarLeerExcel_(file) {
    radarEstado_("Leyendo " + file.name + "…");
    window.panelFiles
      .parseLoadFile(file, null, {
        raw: true,
        onProgress: function (message) {
          radarEstado_(message);
        },
      })
      .then(function (rows) {
        try {
          // Se guardan TODAS las filas con destino (también las que no están en Broker, para la
          // vista "No están en Broker"), con lo que diga Regresos.
          var filas = [],
            enBroker = 0;
          for (var i = 2; i < rows.length; i++) {
            var row = rows[i] || [];
            var ciudad = String(row[8] || "").trim(),
              estado = String(row[9] || "").trim();
            if (!ciudad || !estado) continue;
            var regresos = String(row[15] || "").trim();
            if (regresos.toLowerCase().indexOf("broker") !== -1) enBroker++;
            var ent = row[11],
              d =
                Object.prototype.toString.call(ent) === "[object Date]"
                  ? ent
                  : ent
                    ? new Date(ent)
                    : null;
            filas.push({
              load: String(row[0] || "").trim(),
              ciudad: ciudad,
              estado: estado,
              regresos: regresos,
              entrega: d && !isNaN(d.getTime()) ? d.toISOString() : "",
            });
          }
          if (!filas.length) {
            radarEstado_(
              "No encontré ciudades en las columnas I/J a partir de la fila 3. ¿Es el Excel de VanGuard con destinos?",
              true,
            );
            return;
          }
          radarExcel_ = {
            nombre: file.name,
            cargado_en: new Date().toISOString(),
            por: myRealIdentity,
            filas: filas,
            v: 2,
          };
          guardarRadarExcelLocal_();
          compartirRadarExcel_(true);
          radarResultados_ = null;
          radarEstado_(
            "✓ " +
              file.name +
              " — " +
              filas.length +
              " cargas con destino: " +
              enBroker +
              " en Broker y " +
              (filas.length - enBroker) +
              " no.",
          );
          renderRadarFuente_();
          if (document.getElementById("radar-origen").value.trim())
            radarCalcular_();
          else renderRadar_();
        } catch (err) {
          radarEstado_("No se pudo leer el archivo: " + err.message, true);
        }
      })
      .catch(function (err) {
        radarEstado_(err.message, true);
      });
  }

  function renderRadarFuente_() {
    var el = document.getElementById("radar-fuente");
    if (radarExcel_) {
      el.className = "radar-fuente";
      var nB = radarCargas_("broker").length,
        nO = radarCargas_("otras").length;
      el.innerHTML =
        "Usando <b>" +
        esc(radarExcel_.nombre) +
        "</b> (subido " +
        esc(relativeTimeLabel(radarExcel_.cargado_en)) +
        (radarExcel_.por ? " por " + esc(radarExcel_.por) : "") +
        (radarExcel_.compartido
          ? " · compartido con el equipo"
          : " · solo en este navegador") +
        ") · " +
        nB +
        " en Broker · " +
        nO +
        ' no están en Broker · <button type="button" class="link-btn" id="radar-quitar">Quitar</button>';
    } else {
      el.className = "radar-fuente falta";
      el.innerHTML =
        "Sube el Excel de VanGuard con destinos (columnas I/J, entrega en L y Regresos en P) para ver las cargas en Broker.";
    }
  }

  /** Cargas a medir según "Ver" (En Broker / No están en Broker / Todas). Del Excel del Radar;
   * cliente/estatus se completan con la carga del panel si existe con ese número. Sin Excel, usa
   * las cargas del panel que sí traigan destino. */
  function radarCargas_(ver) {
    ver = ver || document.getElementById("radar-ver").value;
    var conEntregadas = document.getElementById("radar-entregadas").checked;
    var esBroker = function (txt) {
      return /broker/i.test(String(txt || ""));
    };
    var vale = function (r) {
      if (ver === "broker" && !esBroker(r.regresos)) return false;
      if (ver === "otras" && esBroker(r.regresos)) return false;
      if (isCancelledStatus(r.status)) return false;
      return (
        conEntregadas ||
        DONE_STATUSES.indexOf(String(r.status || "").trim()) === -1
      );
    };
    if (radarExcel_) {
      return radarExcel_.filas
        .map(function (f) {
          var p = f.load ? recPorLoad_(f.load) : null;
          return {
            load: f.load || "—",
            customer: p ? p.customer : "",
            status: p ? p.status : "",
            origin_city: p ? p.origin_city : "",
            origin_state: p ? p.origin_state : "",
            cruce_usa_fecha: p ? p.cruce_usa_fecha : "",
            dest_city: f.ciudad,
            dest_state: f.estado,
            delivery_appt: f.entrega,
            enPanel: !!p,
            regresos: radarExcel_.v === 2 ? f.regresos : "Broker",
          }; // Excel subido antes de esta versión: solo traía Broker
        })
        .filter(vale);
    }
    return currentData.filter(function (r) {
      return r.dest_city && vale(r);
    });
  }
  /** Solo las de Broker (para el mensaje de disponibilidad de WhatsApp). */
  function radarCargasBroker_() {
    return radarCargas_("broker");
  }

  function radarCalcular_() {
    if (radarOcupado_) return;
    var txt = document.getElementById("radar-origen").value.trim();
    if (!txt) {
      radarEstado_(
        'Escribe tu origen: Ciudad, Estado (por ejemplo "Bellefontaine, OH").',
        true,
      );
      return;
    }
    var coma = txt.lastIndexOf(",");
    var oCiudad = coma === -1 ? txt : txt.slice(0, coma).trim(),
      oEstado = coma === -1 ? "" : txt.slice(coma + 1).trim();
    var oPunto = parseCoords_(txt); // coordenadas de la unidad: se mide desde el punto exacto
    try {
      localStorage.setItem("bajio_radar_origen", txt);
    } catch (e) {}
    radarOcupado_ = true;
    document.getElementById("radar-calcular").disabled = true;
    radarEstado_("Preparando…");
    radarCargarCoords_(function () {
      var cargas = radarCargas_(),
        faltan = {},
        oKey = oPunto ? coordsKey_(oPunto) : radarKey_(oCiudad, oEstado);
      if (oPunto) radarCoords_[oKey] = oPunto;
      if (!cargas.length) {
        radarOcupado_ = false;
        document.getElementById("radar-calcular").disabled = false;
        radarResultados_ = null;
        renderRadar_();
        radarEstado_(
          radarExcel_
            ? "No hay cargas con este filtro en el Excel."
            : "No hay cargas para medir. Sube el Excel de VanGuard con destinos.",
          true,
        );
        return;
      }
      if (!radarCoords_[oKey])
        faltan[oKey] = { key: oKey, ciudad: oCiudad, estado: oEstado };
      cargas.forEach(function (r) {
        var k = radarKey_(r.dest_city, r.dest_state);
        if (r.dest_city && !radarCoords_[k] && !radarFallidas_[k])
          faltan[k] = {
            key: k,
            ciudad: titleCity(r.dest_city),
            estado: String(r.dest_state || ""),
          };
      });
      radarUbicar_(
        Object.keys(faltan).map(function (k) {
          return faltan[k];
        }),
        function (errorRed) {
          radarOcupado_ = false;
          document.getElementById("radar-calcular").disabled = false;
          var o = radarCoords_[oKey];
          if (!o) {
            radarResultados_ = null;
            renderRadar_();
            radarEstado_(
              errorRed
                ? 'No se pudo consultar OpenStreetMap (revisa tu conexión) y "' +
                    txt +
                    '" no está guardada todavía.'
                : 'No encontré "' +
                    txt +
                    '". Revisa el nombre: Ciudad, Estado.',
              true,
            );
            return;
          }
          radarOrigenTxt_ = oPunto
            ? "la unidad (" + coordsTxt_(oPunto) + ")"
            : radarLugar_(oCiudad, oEstado);
          radarOrigenKey_ = oKey;
          radarResultados_ = cargas.map(function (r) {
            var k = radarKey_(r.dest_city, r.dest_state),
              c = radarCoords_[k];
            return { r: r, key: k, dist: c ? radarMillas_(o, c) : null };
          });
          renderRadar_();
          radarEstado_(
            "Listo — " +
              cargas.length +
              " cargas medidas desde " +
              radarOrigenTxt_ +
              "." +
              (errorRed
                ? " Algunas ciudades no se pudieron consultar (revisa tu conexión)."
                : ""),
            errorRed,
          );
          if (oPunto) {
            // ¿Dónde es? + el lugar de nuestra base más cercano; el punto se guarda para el proceso de Google.
            var cercano = puntoCercano_(oPunto);
            radarReversa_(oPunto).then(function (lugar) {
              guardarPunto_(oPunto, lugar);
              if (oKey !== radarOrigenKey_) return;
              radarOrigenTxt_ =
                "la unidad" +
                (lugar
                  ? ", cerca de " + lugar
                  : " (" + coordsTxt_(oPunto) + ")");
              radarNotaPunto_ = cercano
                ? " 📍 Punto más cercano en nuestra base: " +
                  cercano.nombre +
                  " (a " +
                  Math.round(cercano.millas * 10) / 10 +
                  " mi)."
                : "";
              radarEstado_(
                "Listo — medido desde " +
                  radarOrigenTxt_ +
                  "." +
                  radarNotaPunto_,
              );
              radarCarretera_();
            });
          } else {
            radarNotaPunto_ = "";
            radarCarretera_();
          }
        },
      );
    });
  }

  // ---- Millas por carretera (OSRM, ruteo gratuito de OpenStreetMap) ----
  // Solo se piden para las ciudades que en línea recta ya quedan dentro del radio (por carretera
  // nunca es menos que en línea recta, así que las demás seguro quedan fuera). Cada trayecto se
  // guarda en la hoja "Distancias" y no se vuelve a consultar.
  var radarOrigenKey_ = "";
  var radarNotaPunto_ = ""; // "punto más cercano en nuestra base" cuando el origen son coordenadas
  var radarDist_ = {}; // llaveOrigen → { llaveDestino: { millas, horas } } (hoja + nuevas)
  var radarDistCargadas_ = {}; // llaveOrigen → última lectura; refrescar para recoger resultados de Google.
  var radarRutaSinDato_ = {}; // 'o>d' que OSRM no pudo rutear en esta sesión
  var radarRutaOcupado_ = false;
  var radarUltimaRuta_ = 0;

  // Tiempo de NUESTRA unidad: la regla del equipo es millas ÷ 48 = horas que tarda el camión en
  // llegar (incluye paradas). Distinto de las horas "de manejo continuo" de Google/OSM.
  var VELOCIDAD_UNIDAD_MPH = 48;
  function horasUnidad_(millas) {
    return millas / VELOCIDAD_UNIDAD_MPH;
  }
  function fmtHorasUnidad_(h) {
    var min = Math.round(h * 60),
      hh = Math.floor(min / 60),
      mm = min % 60;
    return hh ? hh + " h" + (mm ? " " + mm + " min" : "") : mm + " min";
  }
  function etiquetaFuente_(f) {
    return f === "google"
      ? "Google Maps"
      : f === "estimado"
        ? "estimado"
        : "aprox. OSM";
  }

  function radarEfectiva_(x) {
    return x.carretera != null ? x.carretera : x.dist;
  }
  function radarAplicarCarretera_() {
    var tabla = radarDist_[radarOrigenKey_] || {};
    (radarResultados_ || []).forEach(function (x) {
      var d = tabla[x.key];
      if (x.key === radarOrigenKey_) {
        x.carretera = 0;
        x.horas = 0;
        x.fuente = "google";
      } else if (d) {
        x.carretera = d.millas;
        x.horas = d.horas;
        x.fuente = d.fuente || "osm";
        x.calculadaEn = d.calculadaEn || "";
      }
    });
  }
  function radarPendientesCarretera_() {
    var radio = Number(document.getElementById("radar-radio").value) || 200,
      vistos = {};
    return (radarResultados_ || []).filter(function (x) {
      if (
        x.dist === null ||
        x.dist > radio ||
        x.carretera != null ||
        vistos[x.key] ||
        radarRutaSinDato_[radarOrigenKey_ + ">" + x.key]
      )
        return false;
      vistos[x.key] = true;
      return true;
    });
  }
  function radarPedirRuta_(o, d) {
    var espera = Math.max(0, radarUltimaRuta_ + 1100 - Date.now());
    return new Promise(function (ok) {
      setTimeout(ok, espera);
    })
      .then(function () {
        radarUltimaRuta_ = Date.now();
        return window.panelNetwork.fetchExternal(
          "https://router.project-osrm.org/route/v1/driving/" +
            o[1] +
            "," +
            o[0] +
            ";" +
            d[1] +
            "," +
            d[0] +
            "?overview=false",
          { group: "road-route" },
        );
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j || j.code !== "Ok" || !j.routes || !j.routes.length) return null;
        return {
          millas: j.routes[0].distance / 1609.344,
          horas: j.routes[0].duration / 3600,
        };
      });
  }

  /** Completa las millas por carretera de lo que está dentro del radio: primero de la hoja, luego OSRM. */
  function radarCarretera_() {
    if (!radarResultados_ || radarRutaOcupado_ || !radarOrigenKey_) return;
    var oKey = radarOrigenKey_,
      o = radarCoords_[oKey];
    if (!o) return;
    var seguir = function () {
      radarAplicarCarretera_();
      var pend = radarPendientesCarretera_();
      if (!pend.length) {
        renderRadar_();
        return;
      }
      radarRutaOcupado_ = true;
      var nuevas = [],
        i = 0,
        fallas = 0;
      var siguiente = function () {
        if (oKey !== radarOrigenKey_) {
          radarRutaOcupado_ = false;
          radarProgreso_(null);
          return;
        } // cambiaron el origen
        if (i >= pend.length) {
          radarRutaOcupado_ = false;
          radarProgreso_(null);
          if (nuevas.length)
            google.script.run
              .withSuccessHandler(function () {})
              .withFailureHandler(function () {})
              .guardarDistancias(nuevas, myRealIdentity, myPassword);
          radarAplicarCarretera_();
          renderRadar_();
          radarEstado_(
            "Listo — millas por carretera desde " +
              radarOrigenTxt_ +
              (nuevas.length
                ? " (" + nuevas.length + " trayectos nuevos guardados)"
                : "") +
              (fallas
                ? ". " + fallas + " sin ruta: se muestran en línea recta."
                : ".") +
              radarNotaPunto_,
            false,
          );
          return;
        }
        var x = pend[i++];
        radarEstado_(
          "Calculando millas por carretera… " +
            i +
            " de " +
            pend.length +
            " (" +
            radarLugar_(x.r.dest_city, x.r.dest_state) +
            ")",
        );
        radarProgreso_(Math.round((i * 100) / pend.length));
        radarPedirRuta_(o, radarCoords_[x.key])
          .then(function (res) {
            if (!res) {
              fallas++;
              radarRutaSinDato_[oKey + ">" + x.key] = true;
              return;
            }
            radarDist_[oKey] = radarDist_[oKey] || {};
            radarDist_[oKey][x.key] = {
              millas: res.millas,
              horas: res.horas,
              fuente: "osm",
              calculadaEn: new Date().toISOString(),
            };
            nuevas.push({
              origen: oKey,
              destino: x.key,
              millas: res.millas,
              horas: res.horas,
              recta: x.dist,
            });
          })
          .catch(function () {
            fallas++;
            radarRutaSinDato_[oKey + ">" + x.key] = true;
          })
          .then(function () {
            if (i % 5 === 0) {
              radarAplicarCarretera_();
              renderRadar_();
            } // se va viendo el avance
            siguiente();
          });
      };
      siguiente();
    };
    if (
      radarDistCargadas_[oKey] &&
      Date.now() - radarDistCargadas_[oKey] < 60000
    ) {
      seguir();
      return;
    }
    google.script.run
      .withSuccessHandler(function (res) {
        radarDistCargadas_[oKey] = Date.now();
        radarDist_[oKey] = Object.assign(
          radarDist_[oKey] || {},
          (res && res.items) || {},
        );
        seguir();
      })
      .withFailureHandler(function () {
        radarDistCargadas_[oKey] = 0;
        seguir();
      })
      .getDistancias(oKey, myRealIdentity, myPassword);
  }

  function radarFechaKey_(v) {
    var d = pd(v);
    return d && !isNaN(d.getTime())
      ? d.getFullYear() +
          "-" +
          ("0" + (d.getMonth() + 1)).slice(-2) +
          "-" +
          ("0" + d.getDate()).slice(-2)
      : "";
  }
  function radarCsrDe_(cliente) {
    var c = String(cliente || "")
      .trim()
      .toLowerCase();
    var a = asignaciones.filter(function (x) {
      return (
        String(x.cliente || "")
          .trim()
          .toLowerCase() === c
      );
    })[0];
    return a ? a.csr : "";
  }
  function radarApartadoDe_(load) {
    return apartados.filter(function (a) {
      return String(a.load) === String(load) && !apartadoCerrado_(a);
    })[0];
  }

  function radarDentro_(x, radio) {
    var e = radarEfectiva_(x);
    return e !== null && e !== undefined && e <= radio;
  }
  /** ¿Nuestra unidad, saliendo ahora desde el origen, llega antes de la cita de entrega de esa
   * carga? (regla del equipo: millas ÷ 48). Con línea recta es solo aproximado. null = no se sabe. */
  function radarATiempo_(x) {
    var millas = x.carretera != null ? x.carretera : x.dist;
    var cita = pd(x.r.delivery_appt);
    if (
      millas === null ||
      millas === undefined ||
      !cita ||
      isNaN(cita.getTime())
    )
      return null;
    var llega = Date.now() + horasUnidad_(millas) * 3600000;
    return {
      ok: llega <= cita.getTime(),
      horas: Math.abs(cita.getTime() - llega) / 3600000,
      aprox: x.carretera == null,
    };
  }
  function radarATiempoHtml_(x) {
    var t = radarATiempo_(x);
    if (!t) return '<br><small class="hm-soft">sin cita</small>';
    return (
      '<br><small class="' +
      (t.ok ? "sev-good" : "sev-warn") +
      '" title="Comparado con la cita de entrega' +
      (t.aprox ? " (aprox., en línea recta)" : "") +
      '">' +
      (t.ok
        ? "✓ alcanza, " + fmtHorasUnidad_(t.horas) + " antes"
        : "✗ llega " + fmtHorasUnidad_(t.horas) + " tarde") +
      (t.aprox ? " ~" : "") +
      "</small>"
    );
  }
  function radarVisibles_() {
    var radio = Number(document.getElementById("radar-radio").value) || 200;
    var fecha = document.getElementById("radar-fecha").value,
      fuera = document.getElementById("radar-fuera").checked;
    var soloATiempo = document.getElementById("radar-a-tiempo").checked;
    return (radarResultados_ || [])
      .filter(function (x) {
        if (fecha && radarFechaKey_(x.r.delivery_appt) !== fecha) return false;
        if (soloATiempo) {
          var t = radarATiempo_(x);
          if (!t || !t.ok) return false;
        }
        return fuera || x.dist === null || radarDentro_(x, radio);
      })
      .sort(function (a, b) {
        if (a.dist === null) return 1;
        if (b.dist === null) return -1;
        return radarEfectiva_(a) - radarEfectiva_(b);
      });
  }
  function radarMillasTxt_(x) {
    return x.carretera != null
      ? Math.round(x.carretera) +
          " mi (" +
          etiquetaFuente_(x.fuente) +
          (x.calculadaEn ? " · " + esc(fmtDateTime(x.calculadaEn)) : "") +
          ") · unidad llega en ~" +
          fmtHorasUnidad_(horasUnidad_(x.carretera))
      : Math.round(x.dist) + " mi (línea recta)";
  }

  // ---- Mapa del Radar (Leaflet + mapas de OpenStreetMap; gratis, se carga solo al abrirlo) ----
  var radarMapa_ = null,
    radarCapa_ = null,
    leafletPromesa_ = null;
  function cargarLeaflet_() {
    if (window.L && window.L.map) return Promise.resolve();
    if (leafletPromesa_) return leafletPromesa_;
    var cargar = function (el) {
      return new Promise(function (ok, mal) {
        el.onload = function () {
          ok();
        };
        el.onerror = function () {
          mal(new Error("No se pudo cargar el mapa (revisa tu conexión)."));
        };
        document.head.appendChild(el);
      });
    };
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href =
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    var js = document.createElement("script");
    js.src =
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    // Se espera también la hoja de estilos: sin ella el mapa no sabe su tamaño y se ve el mundo entero.
    leafletPromesa_ = Promise.all([cargar(css), cargar(js)]).catch(
      function (err) {
        leafletPromesa_ = null;
        throw err;
      },
    );
    return leafletPromesa_;
  }
  function renderRadarMapa_() {
    var cont = document.getElementById("radar-mapa");
    if (!cont || cont.hidden || !window.L || !window.L.map) return;
    if (!radarMapa_) {
      radarMapa_ = L.map(cont, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap",
      }).addTo(radarMapa_);
    }
    if (radarCapa_) radarCapa_.remove();
    radarCapa_ = L.layerGroup().addTo(radarMapa_);
    var radio = Number(document.getElementById("radar-radio").value) || 200,
      puntos = [];
    var o =
      radarResultados_ && radarOrigenKey_ && radarCoords_
        ? radarCoords_[radarOrigenKey_]
        : null;
    if (o) {
      L.circle(o, {
        radius: radio * 1609.344,
        color: "#ff8a3d",
        weight: 1,
        fillOpacity: 0.05,
      }).addTo(radarCapa_);
      L.circleMarker(o, {
        radius: 8,
        color: "#ff8a3d",
        fillColor: "#ff8a3d",
        fillOpacity: 1,
      })
        .bindTooltip("Origen: " + esc(radarOrigenTxt_))
        .addTo(radarCapa_);
      puntos.push(o);
    }
    var grupos = {};
    radarVisibles_().forEach(function (x) {
      var c = radarCoords_ && radarCoords_[x.key];
      if (!c) return;
      (grupos[x.key] = grupos[x.key] || { c: c, xs: [] }).xs.push(x);
    });
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k],
        x0 = g.xs[0],
        dentro = g.xs.some(function (x) {
          return radarDentro_(x, radio);
        });
      var color = dentro ? "#2fbf71" : "#8a94a8";
      L.circleMarker(g.c, {
        radius: 6 + Math.min(6, g.xs.length),
        color: color,
        fillColor: color,
        fillOpacity: 0.8,
      })
        .bindPopup(
          "<b>" +
            esc(radarLugar_(x0.r.dest_city, x0.r.dest_state)) +
            "</b><br>" +
            g.xs
              .map(function (x) {
                return (
                  "Carga " + esc(x.r.load) + " · " + esc(radarMillasTxt_(x))
                );
              })
              .join("<br>"),
        )
        .addTo(radarCapa_);
      puntos.push(g.c);
    });
    var ajustar = function () {
      radarMapa_.invalidateSize();
      if (puntos.length)
        radarMapa_.fitBounds(L.latLngBounds(puntos).pad(0.15), { maxZoom: 9 });
      else radarMapa_.setView([32, -97], 4);
    };
    ajustar();
    setTimeout(ajustar, 200); // por si el contenedor apenas se acaba de mostrar
  }

  function renderRadar_() {
    renderRadarMapa_();
    var tabla = document.getElementById("radar-tabla"),
      resumen = document.getElementById("radar-resumen");
    var radio = Number(document.getElementById("radar-radio").value) || 200;
    try {
      localStorage.setItem("bajio_radar_radio", String(radio));
    } catch (e) {}
    if (!radarResultados_) {
      resumen.innerHTML = "";
      var n = radarCargas_().length,
        ver = document.getElementById("radar-ver").value;
      if (!radarExcel_ && !n) {
        tabla.innerHTML =
          "<tbody><tr><td>" +
          guiaHtml_(
            "Primeros pasos con el Radar",
            [
              [
                "Sube el Excel de VanGuard",
                "El que trae destinos (ciudad y estado en I/J, entrega en L, Regresos en P). Se comparte con todo el equipo.",
              ],
              [
                "Escribe dónde estás",
                'Ciudad, Estado (por ejemplo "Laredo, TX") o pega las coordenadas de la unidad.',
              ],
              [
                "Calcula",
                "Verás las cargas en Broker más cercanas con millas por carretera, cuándo llega la unidad y si alcanza a llegar antes de la entrega.",
              ],
            ],
            '<button type="button" class="ws-btn primary" data-guia-accion="radar-subir">Subir Excel VanGuard</button>',
          ) +
          "</td></tr></tbody>";
        document.getElementById("radar-copiar").hidden = true;
        return;
      }
      tabla.innerHTML =
        '<tbody><tr><td class="radar-vacio">' +
        (n
          ? "Escribe tu origen y da <b>Calcular</b>. Se miden las " +
            n +
            " cargas" +
            (ver === "broker"
              ? ' con "Broker" en Regresos'
              : ver === "otras"
                ? " que no están en Broker"
                : "") +
            "."
          : radarExcel_
            ? "No hay cargas con este filtro en el Excel."
            : "Primero sube el Excel de VanGuard con <b>Subir Excel VanGuard</b>.") +
        "</td></tr></tbody>";
      document.getElementById("radar-copiar").hidden = true;
      return;
    }
    var todos = radarResultados_;
    var dentro = todos.filter(function (x) {
      return radarDentro_(x, radio);
    }).length;
    var sinUbicar = todos.filter(function (x) {
      return x.dist === null;
    }).length;
    var faltanRuta = radarPendientesCarretera_().length;
    resumen.innerHTML =
      '<span class="r-in"><b>' +
      dentro +
      "</b>dentro de " +
      radio +
      " mi</span><span><b>" +
      (todos.length - dentro - sinUbicar) +
      "</b>fuera de rango</span>" +
      (sinUbicar
        ? '<span class="r-fail"><b>' + sinUbicar + "</b>no ubicadas</span>"
        : "") +
      (faltanRuta && !radarRutaOcupado_
        ? '<button type="button" class="ws-btn" id="radar-pedir-ruta">Obtener millas por carretera (' +
          faltanRuta +
          ")</button>"
        : "");
    var filas = radarVisibles_();
    var conRegresos = document.getElementById("radar-ver").value !== "broker";
    document.getElementById("radar-copiar").hidden = !dentro;
    if (!filas.length) {
      tabla.innerHTML =
        '<tbody><tr><td class="radar-vacio">Ninguna carga dentro de ' +
        radio +
        " mi de " +
        esc(radarOrigenTxt_) +
        " con estos filtros.</td></tr></tbody>";
      return;
    }
    tabla.innerHTML =
      "<thead><tr><th>Load</th><th>Cliente</th><th>Destino</th><th>Entrega cita</th>" +
      (conRegresos ? "<th>Regresos</th>" : "") +
      '<th>Estatus</th><th class="num">Millas</th><th class="num" title="Millas ÷ ' +
      VELOCIDAD_UNIDAD_MPH +
      '">🚛 Unidad llega en</th><th></th></tr></thead><tbody>' +
      filas
        .map(function (x) {
          var r = x.r,
            dentroR = radarDentro_(x, radio),
            ap = radarApartadoDe_(r.load);
          var millas =
            x.dist === null
              ? '<span class="sev-warn">no ubicada</span><br><input class="radar-alias" data-radar-alias="' +
                esc(x.key) +
                '" placeholder="Buscar como… (Ciudad, Edo)"><button type="button" class="link-btn" data-radar-buscar="' +
                esc(x.key) +
                '">Buscar</button>'
              : x.carretera != null
                ? Math.round(x.carretera) +
                  ' mi<br><small class="' +
                  (x.fuente === "google" ? "sev-good" : "hm-soft") +
                  '" title="Por carretera. Línea recta: ' +
                  Math.round(x.dist) +
                  ' mi">' +
                  etiquetaFuente_(x.fuente) +
                  (x.calculadaEn
                    ? " · " + esc(fmtDateTime(x.calculadaEn))
                    : "") +
                  "</small>"
                : Math.round(x.dist) +
                  ' mi<br><small class="hm-soft">línea recta</small>';
          var unidad =
            (x.carretera != null
              ? "<b>" + fmtHorasUnidad_(horasUnidad_(x.carretera)) + "</b>"
              : x.dist !== null
                ? '<span class="hm-soft">~' +
                  fmtHorasUnidad_(horasUnidad_(x.dist)) +
                  "</span>"
                : '<span class="hm-soft">—</span>') +
            (x.dist !== null ? radarATiempoHtml_(x) : "");
          return (
            '<tr class="' +
            (dentroR ? "dentro" : "fuera") +
            '"><td><b>' +
            esc(r.load) +
            "</b></td><td>" +
            esc(shortCustomerName(r.customer || "")) +
            (radarCsrDe_(r.customer)
              ? '<br><small class="hm-soft">CSR ' +
                esc(radarCsrDe_(r.customer)) +
                "</small>"
              : "") +
            "</td>" +
            "<td>" +
            esc(radarLugar_(r.dest_city, r.dest_state)) +
            "</td><td>" +
            esc(r.delivery_appt ? fmtDateTime(r.delivery_appt) : "—") +
            "</td>" +
            (conRegresos ? "<td>" + esc(r.regresos || "—") + "</td>" : "") +
            "<td>" +
            esc(r.status || "—") +
            '</td><td class="num millas">' +
            millas +
            '</td><td class="num">' +
            unidad +
            "</td>" +
            '<td><div class="radar-acc">' +
            (recPorLoad_(r.load)
              ? '<button type="button" class="ws-btn" data-radar-abrir="' +
                esc(r.load) +
                '">Abrir</button>'
              : "") +
            (ap
              ? '<button type="button" class="ws-btn" data-radar-ver-apartado="' +
                esc(ap.id) +
                '" title="Ya lo tienes apartado">Apartado ✓</button>'
              : '<button type="button" class="ws-btn primary" data-radar-apartar="' +
                esc(r.load) +
                '">Apartar</button>') +
            "</div></td></tr>"
          );
        })
        .join("") +
      "</tbody>";
  }

  function radarApartar_(load) {
    var x = (radarResultados_ || []).filter(function (y) {
      return String(y.r.load) === String(load);
    })[0];
    if (!x) return;
    var r = x.r;
    var abrir = function () {
      abrirApartado_(null);
      var poner = function (id, v) {
        document.getElementById(id).value = v || "";
      };
      var d = pd(r.delivery_appt);
      poner("ap-load", r.load);
      // El CSR externo de VG se captura manualmente; no copiar la asignación del panel.
      poner("ap-origen", radarLugar_(r.origin_city, r.origin_state));
      poner("ap-destino", radarLugar_(r.dest_city, r.dest_state));
      poner(
        "ap-fecha-entrega",
        d && !isNaN(d.getTime()) ? toDatetimeLocalValue(d) : "",
      );
      d = pd(r.cruce_usa_fecha);
      poner(
        "ap-fecha-cruce",
        d && !isNaN(d.getTime()) ? toDatetimeLocalValue(d) : "",
      );
      poner(
        "ap-nota",
        x.dist !== null
          ? "Del Radar: " + radarMillasTxt_(x) + " desde " + radarOrigenTxt_
          : "Del Radar de millas",
      );
    };
    if (!myRealIdentity || !myPassword) {
      ensureLoggedIn(abrir);
      return;
    }
    abrir();
  }

  function radarTextoWhatsApp_() {
    var grupos = {};
    radarCargasBroker_().forEach(function (r) {
      var k = radarFechaKey_(r.delivery_appt) || "9999-99-99";
      var etiqueta =
        k === "9999-99-99" ? "Sin fecha" : k.slice(8, 10) + "/" + k.slice(5, 7);
      grupos[k] = grupos[k] || { etiqueta: etiqueta, lugares: {}, orden: [] };
      var lugar = radarLugar_(r.dest_city, r.dest_state);
      if (!grupos[k].lugares[lugar]) {
        grupos[k].lugares[lugar] = 0;
        grupos[k].orden.push(lugar);
      }
      grupos[k].lugares[lugar]++;
    });
    var lineas = [
      "*Disponibilidad de cargas USA*",
      "les comparto la disponibilidad que aún tenemos team, por si les podemos apoyar con alguna carga.",
    ];
    Object.keys(grupos)
      .sort()
      .forEach(function (k) {
        lineas.push("", "📅 *" + grupos[k].etiqueta + "*");
        grupos[k].orden.forEach(function (l) {
          lineas.push("• " + l + " — " + grupos[k].lugares[l]);
        });
      });
    return lineas.join("\n");
  }

  function radarAlAbrir_() {
    if (
      Date.now() - radarExcelRevisadoEn_ >= 300000 &&
      myRealIdentity &&
      myPassword
    ) {
      revisarRadarExcelEquipo_(function () {
        if (!document.getElementById("page-radar").hidden) radarAlAbrir_();
      });
      return;
    }
    var o = document.getElementById("radar-origen");
    if (!o.value) {
      try {
        o.value = localStorage.getItem("bajio_radar_origen") || "";
      } catch (e) {}
    }
    try {
      var rad = localStorage.getItem("bajio_radar_radio");
      if (rad) document.getElementById("radar-radio").value = rad;
    } catch (e) {}
    renderRadarFuente_();
    var lugares = {};
    currentData.forEach(function (r) {
      if (r.dest_city) lugares[radarLugar_(r.dest_city, r.dest_state)] = true;
      if (r.origin_city)
        lugares[radarLugar_(r.origin_city, r.origin_state)] = true;
    });
    if (radarExcel_)
      radarExcel_.filas.forEach(function (f) {
        lugares[radarLugar_(f.ciudad, f.estado)] = true;
      });
    document.getElementById("radar-ciudades").innerHTML = Object.keys(lugares)
      .sort()
      .map(function (l) {
        return '<option value="' + esc(l) + '">';
      })
      .join("");
    renderRadar_();
    if (o.value && !radarResultados_ && myRealIdentity) radarCalcular_();
  }
  /** Desde un load apartado: ¿qué cargas en Broker quedan cerca de donde entrega? */
  function abrirRadarDesde_(lugar) {
    document.getElementById("radar-origen").value = lugar;
    radarResultados_ = null;
    showMainPage("radar");
    radarCalcular_();
  }

  document.getElementById("radar-subir").addEventListener("click", function () {
    document.getElementById("radar-file").click();
  });
  document
    .getElementById("radar-file")
    .addEventListener("change", function (e) {
      if (e.target.files[0]) radarLeerExcel_(e.target.files[0]);
      e.target.value = ""; // permite volver a subir el mismo archivo
    });
  document
    .getElementById("radar-fuente")
    .addEventListener("click", function (e) {
      if (!e.target.closest("#radar-quitar")) return;
      var quitar = function () {
        var eraCompartido = radarExcel_ && radarExcel_.compartido;
        radarExcel_ = null;
        guardarRadarExcelLocal_();
        radarResultados_ = null;
        renderRadarFuente_();
        renderRadar_();
        radarEstado_("");
        if (eraCompartido && myRealIdentity && myPassword) {
          google.script.run
            .withSuccessHandler(function () {
              showToast("Excel quitado para todo el equipo", "good");
            })
            .withFailureHandler(function (err) {
              showToast(
                "No se pudo quitar del equipo: " + err.message,
                "error",
              );
            })
            .quitarRadarExcel(myRealIdentity, myPassword);
        }
      };
      if (radarExcel_ && radarExcel_.compartido) {
        confirmarModal_(
          "¿Quitar el Excel para todo el equipo?",
          "Nadie va a ver cargas en el Radar hasta que alguien suba otro Excel de VanGuard.",
          "Quitar",
          quitar,
        );
      } else quitar();
    });
  document
    .getElementById("radar-calcular")
    .addEventListener("click", radarCalcular_);
  document
    .getElementById("radar-origen")
    .addEventListener("keydown", function (e) {
      if (e.key === "Enter") radarCalcular_();
    });
  ["radar-radio", "radar-fecha", "radar-fuera"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", renderRadar_);
  });
  document
    .getElementById("radar-fuera")
    .addEventListener("change", renderRadar_);
  document
    .getElementById("radar-a-tiempo")
    .addEventListener("change", renderRadar_);
  document
    .getElementById("radar-mapa-btn")
    .addEventListener("click", function () {
      var cont = document.getElementById("radar-mapa"),
        btn = this;
      cont.hidden = !cont.hidden;
      btn.classList.toggle("activo", !cont.hidden);
      if (cont.hidden) return;
      cargarLeaflet_()
        .then(renderRadarMapa_)
        .catch(function (err) {
          cont.hidden = true;
          btn.classList.remove("activo");
          radarEstado_(err.message, true);
        });
    });
  document
    .getElementById("radar-entregadas")
    .addEventListener("change", function () {
      renderRadarFuente_();
      if (radarResultados_) radarCalcular_();
      else renderRadar_();
    });
  document.getElementById("radar-ver").addEventListener("change", function () {
    if (radarResultados_) radarCalcular_();
    else renderRadar_();
  });
  // Al subir el radio, lo nuevo dentro del rango se muestra en línea recta con este botón para
  // pedir sus millas por carretera (no se consultan solas en cada cambio del radio).
  document
    .getElementById("radar-resumen")
    .addEventListener("click", function (e) {
      if (e.target.closest("#radar-pedir-ruta")) radarCarretera_();
    });
  document.getElementById("radar-wa").addEventListener("click", function () {
    if (!radarCargasBroker_().length) {
      showToast('No hay cargas con "Broker" en Regresos', "error");
      return;
    }
    copyTextGeneric(
      radarTextoWhatsApp_(),
      "Disponibilidad copiada (" + radarCargasBroker_().length + " cargas)",
    );
  });
  document
    .getElementById("radar-copiar")
    .addEventListener("click", function () {
      var radio = Number(document.getElementById("radar-radio").value) || 200;
      var lineas = radarVisibles_()
        .filter(function (x) {
          return radarDentro_(x, radio);
        })
        .map(function (x) {
          return (
            "Carga " +
            x.r.load +
            " — " +
            radarOrigenTxt_ +
            " → " +
            radarLugar_(x.r.dest_city, x.r.dest_state) +
            " — " +
            (x.r.delivery_appt ? fmtDateTime(x.r.delivery_appt) : "sin fecha") +
            " — " +
            radarMillasTxt_(x)
          );
        });
      if (lineas.length)
        copyTextGeneric(
          lineas.join("\n"),
          "Lista copiada (" + lineas.length + ")",
        );
    });
  document
    .getElementById("radar-tabla")
    .addEventListener("click", function (e) {
      var b;
      if ((b = e.target.closest("[data-radar-abrir]"))) {
        openLoadWorkspace(b.getAttribute("data-radar-abrir"), "operacion");
        return;
      }
      if ((b = e.target.closest("[data-radar-apartar]"))) {
        radarApartar_(b.getAttribute("data-radar-apartar"));
        return;
      }
      if ((b = e.target.closest("[data-radar-ver-apartado]"))) {
        verApartado_(b.getAttribute("data-radar-ver-apartado"));
        return;
      }
      if ((b = e.target.closest("[data-radar-buscar]"))) {
        // Ciudad mal escrita en el TMS: se busca con otro nombre y se guarda bajo la llave original.
        var key = b.getAttribute("data-radar-buscar");
        var inp = document.querySelector(
          '[data-radar-alias="' +
            (window.CSS && CSS.escape ? CSS.escape(key) : key) +
            '"]',
        );
        var txt = inp ? inp.value.trim() : "";
        if (!txt) {
          showToast("Escribe cómo buscarla: Ciudad, Estado", "error");
          return;
        }
        var coma = txt.lastIndexOf(",");
        b.disabled = true;
        radarBuscarOSM_(
          coma === -1 ? txt : txt.slice(0, coma).trim(),
          coma === -1 ? "" : txt.slice(coma + 1).trim(),
        )
          .then(function (c) {
            b.disabled = false;
            if (!c) {
              showToast('Tampoco encontré "' + txt + '"', "error");
              return;
            }
            radarCoords_[key] = c;
            delete radarFallidas_[key];
            var partes = key.split("|");
            google.script.run.guardarCoordenadas(
              [
                {
                  key: key,
                  ciudad: partes[0],
                  estado: partes[1],
                  lat: c[0],
                  lon: c[1],
                },
              ],
              myRealIdentity,
              myPassword,
            );
            showToast("Ubicada y guardada para todo el equipo", "good");
            radarCalcular_();
          })
          .catch(function () {
            b.disabled = false;
            showToast("No se pudo consultar OpenStreetMap", "error");
          });
      }
    });

  // ===== Radar · Distancia exacta entre direcciones =====
  // Dirección → coordenadas con OpenStreetMap (Nominatim) y millas por carretera con OSRM; las dos
  // cosas se guardan (hojas "Direcciones" y "Distancias"), así que repetir una búsqueda — o que la
  // haga otro del equipo — sale de la base de datos sin consultar ningún servicio.
  var dirHistorial_ = [];
  function gsr_(fn) {
    // google.script.run como promesa: gsr_('nombre', arg1, …)
    var args = [].slice.call(arguments, 1);
    return new Promise(function (ok, ko) {
      var r = google.script.run.withSuccessHandler(ok).withFailureHandler(ko);
      r[fn].apply(r, args);
    });
  }
  // ---- Coordenadas de la unidad (las que se copian de Samsara / Google Maps: "41.9237, -85.0186") ----
  // Se usan tal cual para la ruta (no hace falta adivinar la dirección). Se guarda el punto en
  // "Direcciones" (redondeado a ~10 m) con el lugar más cercano que diga OpenStreetMap, para que el
  // proceso de Google también pueda certificar esas millas.
  function parseCoords_(txt) {
    var m = String(txt || "")
      .trim()
      .match(
        /^\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/,
      );
    if (!m) return null;
    var lat = Number(m[1]),
      lon = Number(m[2]);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
  }
  function coordsKey_(c) {
    return "dir:" + c[0].toFixed(4) + ", " + c[1].toFixed(4);
  }
  function coordsTxt_(c) {
    return c[0].toFixed(5) + ", " + c[1].toFixed(5);
  }
  function nombreDeLlave_(k) {
    var p = String(k).split("|");
    return radarLugar_(p[0], p[1] || "");
  }

  /** ¿Qué lugar es este punto? (OpenStreetMap, gratis). Regresa "Coldwater, Michigan" o ''. */
  function radarReversa_(c) {
    var espera = Math.max(0, radarUltimaConsulta_ + 1100 - Date.now());
    return new Promise(function (ok) {
      setTimeout(ok, espera);
    })
      .then(function () {
        radarUltimaConsulta_ = Date.now();
        return window.panelNetwork.fetchExternal(
          "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=es&lat=" +
            c[0] +
            "&lon=" +
            c[1],
          { headers: { Accept: "application/json" }, group: "geocode" },
        );
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var a = (d && d.address) || {};
        var lugar =
          a.city ||
          a.town ||
          a.village ||
          a.hamlet ||
          a.municipality ||
          a.county ||
          "";
        return lugar
          ? lugar + (a.state ? ", " + a.state : "")
          : String((d && d.display_name) || "");
      })
      .catch(function () {
        return "";
      });
  }

  /** El lugar guardado en nuestra base (hoja Coordenadas + conocidas) más cercano a un punto. */
  function puntoCercano_(c) {
    var mejor = null;
    Object.keys(radarCoords_ || {}).forEach(function (k) {
      if (k.indexOf("|") === -1) return;
      var m = radarMillas_(c, radarCoords_[k]);
      if (!mejor || m < mejor.millas)
        mejor = { key: k, nombre: nombreDeLlave_(k), millas: m };
    });
    return mejor;
  }
  function cargarCoordsP_() {
    return new Promise(function (ok) {
      radarCargarCoords_(ok);
    });
  }

  /** Guarda el punto de la unidad en "Direcciones" (en segundo plano). */
  function guardarPunto_(c, lugar) {
    gsr_(
      "guardarDireccion",
      {
        key: coordsKey_(c),
        texto: coordsTxt_(c),
        direccion: lugar ? "Cerca de " + lugar : "",
        lat: c[0],
        lon: c[1],
      },
      myRealIdentity,
      myPassword,
    ).catch(function () {});
  }

  function dirKey_(txt) {
    var c = parseCoords_(txt);
    return c
      ? coordsKey_(c)
      : "dir:" + radarNorm_(txt).replace(/\s*,\s*/g, ", ");
  }
  function dirEstado_(txt, err) {
    var e = document.getElementById("dir-estado");
    e.textContent = txt || "";
    e.className = "radar-estado" + (err ? " err" : "");
  }

  function dirBuscarOSM_(texto) {
    var espera = Math.max(0, radarUltimaConsulta_ + 1100 - Date.now());
    return new Promise(function (ok) {
      setTimeout(ok, espera);
    })
      .then(function () {
        radarUltimaConsulta_ = Date.now();
        return window.panelNetwork.fetchExternal(
          "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&countrycodes=us,mx,ca&q=" +
            encodeURIComponent(texto),
          { headers: { Accept: "application/json" }, group: "geocode" },
        );
      })
      .then(function (r) {
        if (!r.ok) throw new Error("OpenStreetMap respondió " + r.status);
        return r.json();
      })
      .then(function (d) {
        return d && d.length
          ? {
              lat: Number(d[0].lat),
              lon: Number(d[0].lon),
              direccion: String(d[0].display_name || ""),
            }
          : null;
      });
  }

  /** Ubica una dirección: primero en la base ("Direcciones"), si no, en OpenStreetMap (y la guarda). */
  function dirUbicar_(texto, guardadas, etiqueta) {
    var key = dirKey_(texto),
      punto = parseCoords_(texto);
    if (guardadas[key])
      return Promise.resolve(
        Object.assign(
          { key: key, deBase: true, esPunto: !!punto },
          guardadas[key],
          punto ? { lat: punto[0], lon: punto[1] } : {},
        ),
      );
    if (punto) {
      // Coordenadas: se usan exactas; solo se pregunta qué lugar es (para mostrarlo) y se guarda.
      dirEstado_("Ubicando " + etiqueta + " (" + coordsTxt_(punto) + ")…");
      return radarReversa_(punto).then(function (lugar) {
        guardarPunto_(punto, lugar);
        return {
          key: key,
          texto: texto,
          lat: punto[0],
          lon: punto[1],
          direccion:
            (lugar ? "Cerca de " + lugar + " · " : "") + coordsTxt_(punto),
          deBase: false,
          esPunto: true,
        };
      });
    }
    dirEstado_("Buscando " + etiqueta + " en OpenStreetMap…");
    return dirBuscarOSM_(texto).then(function (c) {
      if (!c) return null;
      gsr_(
        "guardarDireccion",
        {
          key: key,
          texto: texto,
          direccion: c.direccion,
          lat: c.lat,
          lon: c.lon,
        },
        myRealIdentity,
        myPassword,
      ).catch(function () {});
      return Object.assign({ key: key, texto: texto, deBase: false }, c);
    });
  }

  function dirCalcular_() {
    window.panelNetwork.cancel("geocode");
    window.panelNetwork.cancel("road-route");
    var oTxt = document.getElementById("dir-origen").value.trim(),
      dTxt = document.getElementById("dir-destino").value.trim();
    if (!oTxt || !dTxt) {
      dirEstado_("Escribe origen y destino.", true);
      return;
    }
    if (!myRealIdentity || !myPassword) {
      ensureLoggedIn(dirCalcular_);
      return;
    }
    var btn = document.getElementById("dir-calcular");
    btn.disabled = true;
    var res = document.getElementById("dir-resultado");
    var o, d;
    dirEstado_("Buscando en la base de datos…");
    gsr_(
      "getDirecciones",
      [dirKey_(oTxt), dirKey_(dTxt)],
      myRealIdentity,
      myPassword,
    )
      .then(function (r) {
        var guardadas = (r && r.items) || {};
        return dirUbicar_(oTxt, guardadas, "el origen").then(function (x) {
          if (!x)
            throw new Error(
              'No encontré el origen "' +
                oTxt +
                '". Prueba con menos detalle (calle y ciudad, o solo Ciudad, Estado).',
            );
          o = x;
          return dirUbicar_(dTxt, guardadas, "el destino");
        });
      })
      .then(function (x) {
        if (!x)
          throw new Error(
            'No encontré el destino "' +
              dTxt +
              '". Prueba con menos detalle (calle y ciudad, o solo Ciudad, Estado).',
          );
        d = x;
        return gsr_("getDistancias", o.key, myRealIdentity, myPassword);
      })
      .then(function (r) {
        var recta = radarMillas_([o.lat, o.lon], [d.lat, d.lon]);
        var guardada = r && r.items && r.items[d.key];
        if (guardada)
          return {
            millas: guardada.millas,
            horas: guardada.horas,
            fuente: guardada.fuente || "osm",
            googleEstado: guardada.googleEstado || "pending",
            calculadaEn: guardada.calculadaEn || "",
            key: guardada.key,
            recta: recta,
            deBase: true,
          };
        dirEstado_("Calculando millas por carretera…");
        return radarPedirRuta_([o.lat, o.lon], [d.lat, d.lon])
          .catch(function () {
            return null;
          })
          .then(function (ruta) {
            if (!ruta) return dirEstimar_(o, d, recta);
            gsr_(
              "guardarDistancias",
              [
                {
                  origen: o.key,
                  destino: d.key,
                  millas: ruta.millas,
                  horas: ruta.horas,
                  recta: recta,
                },
              ],
              myRealIdentity,
              myPassword,
            )
              .then(dirCargarHistorial_)
              .catch(function () {});
            return {
              millas: ruta.millas,
              horas: ruta.horas,
              fuente: "osm",
              calculadaEn: new Date().toISOString(),
              key: o.key + ">" + d.key,
              recta: recta,
              deBase: false,
            };
          });
      })
      .then(function (m) {
        // Si el origen son coordenadas de la unidad: el lugar de nuestra base más cercano.
        return (
          o.esPunto
            ? cargarCoordsP_().then(function () {
                return puntoCercano_([o.lat, o.lon]);
              })
            : Promise.resolve(null)
        ).then(function (cercano) {
          btn.disabled = false;
          if (
            document.getElementById("dir-origen").value.trim() !== oTxt ||
            document.getElementById("dir-destino").value.trim() !== dTxt
          ) {
            dirEstado_("Las direcciones cambiaron. Vuelve a calcular.");
            return;
          }
          dirUltima_ = {
            m: m,
            o: o,
            d: d,
            oTxt: oTxt,
            dTxt: dTxt,
            cercano: cercano,
          };
          dirEstado_("");
          renderDirResultado_();
        });
      })
      .catch(function (err) {
        btn.disabled = false;
        res.hidden = true;
        dirEstado_(
          err && err.message ? err.message : "No se pudo calcular",
          true,
        );
      });
  }

  /** Sin ruta por carretera (servicio caído o punto fuera de camino): estimado con el lugar de
   * nuestra base más cercano al origen. Si ya tenemos guardada la distancia de ese lugar al destino,
   * se usa esa + el tramo de la unidad a ese lugar; si no, línea recta × 1.2 (factor típico de
   * carretera). No se guarda en la base porque es aproximado. */
  function dirEstimar_(o, d, recta) {
    return cargarCoordsP_()
      .then(function () {
        var c = puntoCercano_([o.lat, o.lon]);
        if (!c || c.millas > 40) return null;
        return gsr_("getDistancias", c.key, myRealIdentity, myPassword)
          .then(function (r) {
            var g = r && r.items && r.items[d.key];
            return g
              ? {
                  millas: g.millas + c.millas * 1.2,
                  horas: 0,
                  fuente: "estimado",
                  recta: recta,
                  deBase: false,
                  via: c,
                }
              : null;
          })
          .catch(function () {
            return null;
          });
      })
      .then(function (est) {
        return (
          est || {
            millas: recta * 1.2,
            horas: 0,
            fuente: "estimado",
            recta: recta,
            deBase: false,
          }
        );
      });
  }

  var dirUltima_ = null; // último resultado mostrado (para recalcular / cambiar hora de salida)
  function renderDirResultado_() {
    var res = document.getElementById("dir-resultado"),
      u = dirUltima_;
    if (!u) {
      res.hidden = true;
      return;
    }
    var m = u.m,
      o = u.o,
      d = u.d,
      todoBase = m.deBase && o.deBase && d.deBase;
    var salidaTxt = document.getElementById("dir-salida").value;
    var salida = salidaTxt ? new Date(salidaTxt) : new Date();
    if (isNaN(salida.getTime())) salida = new Date();
    var hU = horasUnidad_(m.millas),
      llega = new Date(salida.getTime() + hU * 3600000);
    var llegaTxt =
      llega.toLocaleDateString("es-MX", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }) +
      ", " +
      ("0" + llega.getHours()).slice(-2) +
      ":" +
      ("0" + llega.getMinutes()).slice(-2);
    res.hidden = false;
    res.innerHTML =
      '<div class="dir-millas">' +
      Math.round(m.millas) +
      " mi<small>por carretera · " +
      etiquetaFuente_(m.fuente) +
      (m.calculadaEn
        ? " · calculada " + esc(fmtDateTime(m.calculadaEn))
        : " · fecha no disponible") +
      (m.horas
        ? " · ~" + fmtHorasUnidad_(m.horas) + " de manejo continuo"
        : "") +
      " · línea recta " +
      Math.round(m.recta) +
      " mi</small></div>" +
      '<div class="dir-unidad">🚛 Nuestra unidad llega en <b>~' +
      fmtHorasUnidad_(hU) +
      "</b>" +
      " <small>(" +
      Math.round(m.millas) +
      " mi ÷ " +
      VELOCIDAD_UNIDAD_MPH +
      ")</small> · saliendo " +
      (salidaTxt ? "el " + esc(fmtDateTime(salida)) : "ahora") +
      ", llega el <b>" +
      esc(llegaTxt) +
      "</b></div>" +
      '<div class="dir-lugar"><b>' +
      (o.esPunto ? "📍 Unidad:" : "Origen:") +
      "</b> " +
      esc(o.direccion || o.texto) +
      "</div>" +
      (u.cercano
        ? '<div class="dir-lugar"><b>Punto más cercano en nuestra base:</b> ' +
          esc(u.cercano.nombre) +
          " (a " +
          Math.round(u.cercano.millas * 10) / 10 +
          " mi en línea recta)</div>"
        : "") +
      '<div class="dir-lugar"><b>Destino:</b> ' +
      esc(d.direccion || d.texto) +
      "</div>" +
      (m.fuente === "estimado"
        ? '<span class="dir-fuente pendiente" title="El servicio de rutas no respondió">⚠ Estimado: ' +
          (m.via
            ? "tramo hasta " +
              esc(m.via.nombre) +
              " + distancia guardada de ahí al destino"
            : "línea recta × 1.2") +
          " — no se guarda; vuelve a calcular más tarde</span> "
        : '<span class="dir-fuente ' +
          (todoBase ? "base" : "nueva") +
          '">' +
          (todoBase
            ? "De la base de datos (sin consultar servicios)"
            : "Búsqueda nueva — guardada en la base de datos") +
          "</span> " +
          (m.fuente !== "google"
            ? m.googleEstado === "no_route"
              ? '<span class="dir-fuente pendiente">Google no encontró ruta; se conserva OSM</span> '
              : '<span class="dir-fuente pendiente" title="El proceso por hora completa los trayectos cuando está activado y hay cuota. Un administrador también puede recalcularlos.">Millas de Google: pendientes</span> '
            : '<span class="dir-fuente base">✓ Millas de Google guardadas</span> ')) +
      '<a class="link-btn" target="_blank" rel="noopener" href="https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=' +
      esc(o.lat) +
      "%2C" +
      esc(o.lon) +
      "%3B" +
      esc(d.lat) +
      "%2C" +
      esc(d.lon) +
      '">Ver ruta en el mapa</a> ' +
      '<button type="button" class="link-btn" id="dir-copiar">Copiar</button>' +
      (myRole() === "Supervisor" && m.key && m.fuente !== "estimado"
        ? ' <button type="button" class="link-btn" id="dir-recalcular" title="Vuelve a pedir las millas a Google Maps (por si cambió la ruta)">Recalcular con Google</button>'
        : "");
    res.setAttribute(
      "data-copiar",
      u.oTxt +
        " → " +
        u.dTxt +
        ": " +
        Math.round(m.millas) +
        " mi por carretera — nuestra unidad llega en ~" +
        fmtHorasUnidad_(hU) +
        " (llega el " +
        llegaTxt +
        ")",
    );
  }

  function dirCargarHistorial_() {
    if (!myRealIdentity) return;
    gsr_("getBusquedasDirecciones", myRealIdentity, myPassword)
      .then(function (r) {
        dirHistorial_ = (r && r.items) || [];
        renderDirHistorial_();
      })
      .catch(function () {});
  }
  function renderDirHistorial_() {
    var q = radarNorm_(document.getElementById("dir-filtro").value);
    var lista = dirHistorial_.filter(function (x) {
      return (
        !q || radarNorm_(x.origenTxt + " " + x.destinoTxt).indexOf(q) !== -1
      );
    });
    document.getElementById("dir-historial").innerHTML = lista.length
      ? '<thead><tr><th>Origen</th><th>Destino</th><th class="num">Millas</th><th class="num">🚛 Unidad llega en</th><th>Quién</th><th>Cuándo</th></tr></thead><tbody>' +
        lista
          .map(function (x) {
            return (
              '<tr data-dir-hist="' +
              dirHistorial_.indexOf(x) +
              '"><td>' +
              esc(x.origenTxt) +
              "</td><td>" +
              esc(x.destinoTxt) +
              '</td><td class="num"><b>' +
              Math.round(x.millas) +
              "</b>" +
              '<br><small class="' +
              (x.fuente === "google" ? "sev-good" : "hm-soft") +
              '">' +
              etiquetaFuente_(x.fuente) +
              (x.calculadaEn ? " · " + esc(fmtDateTime(x.calculadaEn)) : "") +
              "</small></td>" +
              '<td class="num">' +
              fmtHorasUnidad_(horasUnidad_(x.millas)) +
              "</td><td>" +
              esc(x.por) +
              "</td><td>" +
              esc(x.en ? relativeTimeLabel(x.en) : "") +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody>"
      : '<tbody><tr><td class="radar-vacio">' +
        (dirHistorial_.length
          ? "Nada con ese filtro."
          : "Todavía no hay búsquedas guardadas.") +
        "</td></tr></tbody>";
  }

  function radarTab_(tab) {
    document.querySelectorAll(".radar-tab-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-radar-tab") === tab);
    });
    document.getElementById("radar-exacta").hidden = tab !== "exacta";
    document.getElementById("radar-cargas").hidden = tab !== "cargas";
    if (tab === "exacta") dirCargarHistorial_();
  }
  document.querySelectorAll(".radar-tab-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      radarTab_(b.getAttribute("data-radar-tab"));
    });
  });
  document
    .getElementById("dir-calcular")
    .addEventListener("click", dirCalcular_);
  ["dir-origen", "dir-destino"].forEach(function (id) {
    document.getElementById(id).addEventListener("keydown", function (e) {
      if (e.key === "Enter") dirCalcular_();
    });
  });
  document
    .getElementById("dir-invertir")
    .addEventListener("click", function () {
      var a = document.getElementById("dir-origen"),
        b = document.getElementById("dir-destino"),
        t = a.value;
      a.value = b.value;
      b.value = t;
    });
  document
    .getElementById("dir-filtro")
    .addEventListener("input", renderDirHistorial_);
  document
    .getElementById("dir-historial")
    .addEventListener("click", function (e) {
      var tr = e.target.closest("[data-dir-hist]");
      if (!tr) return;
      var x = dirHistorial_[Number(tr.getAttribute("data-dir-hist"))];
      if (!x) return;
      document.getElementById("dir-origen").value = x.origenTxt;
      document.getElementById("dir-destino").value = x.destinoTxt;
      dirCalcular_();
    });
  document
    .getElementById("dir-resultado")
    .addEventListener("click", function (e) {
      if (e.target.closest("#dir-copiar")) {
        copyTextGeneric(this.getAttribute("data-copiar"), "Copiado");
        return;
      }
      var b = e.target.closest("#dir-recalcular");
      if (!b || !dirUltima_) return;
      b.disabled = true;
      b.textContent = "Consultando Google…";
      gsr_(
        "recalcularMillasGoogle",
        dirUltima_.m.key,
        myRealIdentity,
        myPassword,
      )
        .then(function (r) {
          if (!r || r.ok === false)
            throw new Error((r && r.error) || "No se pudo recalcular");
          dirUltima_.m.millas = r.dato.millas;
          dirUltima_.m.horas = r.dato.horas;
          dirUltima_.m.fuente = "google";
          dirUltima_.m.googleEstado = "ok";
          dirUltima_.m.calculadaEn = r.dato.calculadaEn;
          renderDirResultado_();
          dirCargarHistorial_();
          showToast(
            "Millas de Google guardadas: " + Math.round(r.dato.millas) + " mi",
            "good",
          );
        })
        .catch(function (err) {
          b.disabled = false;
          b.textContent = "Recalcular con Google";
          showToast(err.message, "error");
        });
    });
  document
    .getElementById("dir-salida")
    .addEventListener("change", renderDirResultado_);

  // ===== Indicadores =====
  var A_TIEMPO_MIN_ = 20; // mismo umbral que deltaClass: hasta 20 min tarde cuenta como a tiempo
  function pct_(n, d) {
    return d ? Math.round((n * 100) / d) + "%" : "—";
  }
  function sevPct_(n, d) {
    if (!d) return "";
    var p = n / d;
    return p >= 0.9 ? "sev-good" : p >= 0.75 ? "sev-warn" : "sev-critical";
  }
  function horasEntre_(a, b) {
    var x = pd(a),
      y = pd(b);
    if (!x || !y || isNaN(x) || isNaN(y)) return null;
    var h = (y - x) / 3600000;
    return h >= 0 ? h : null;
  }
  function fmtHoras_(h) {
    return h === null || h === undefined
      ? "—"
      : h < 1
        ? Math.round(h * 60) + " min"
        : h.toFixed(1) + " h";
  }
  function aTiempo_(delta) {
    if (
      delta === null ||
      delta === undefined ||
      delta === "" ||
      isNaN(Number(delta))
    )
      return null;
    return Number(delta) <= A_TIEMPO_MIN_;
  }

  function renderIndicadores_() {
    var scope = actionCenterScope(currentData);
    document.getElementById("ind-frontera").closest("section").hidden =
      !window.panelPersonal.preferences.show_crossings;
    var j = computeActiveJourney(currentData),
      activas = j.active,
      b = homeBuckets_(currentData);
    var sinAvisar = activas.filter(function (r) {
      return r.client_notify_pending;
    });
    var recVenc = activas.filter(isRecordatorioVencido);
    var entHoy = activas.filter(function (r) {
      return isSameLocalDay(r.delivery_appt, new Date());
    });
    var conInc = activas.filter(function (r) {
      return Number(r.incidenciasCount) > 0;
    });
    var kpi = function (n, t, sev) {
      return (
        '<div class="ind-kpi ' +
        (n ? sev : "good") +
        '"><b>' +
        n +
        "</b><span>" +
        t +
        "</span></div>"
      );
    };
    document.getElementById("ind-resumen").innerHTML =
      kpi(activas.length, "Cargas activas", "") +
      kpi(b.now.length, "Atender ahora", "critical") +
      kpi(
        scope.filter(function (r) {
          return isDoneStatus(r.status) && !r.pod_sent;
        }).length,
        "POD por registrar",
        "warn",
      ) +
      kpi(recVenc.length, "Recordatorios vencidos", "warn") +
      kpi(entHoy.length, "Entregas hoy", "") +
      kpi(conInc.length, "Con incidencias", "warn");
    var urg = j.items
      .filter(function (x) {
        return x.bucket === "now";
      })
      .slice(0, 5);
    document.getElementById("ind-urgentes").innerHTML = urg.length
      ? '<h2 style="font-size:.8rem;margin:.2rem 0 .3rem">Lo más urgente</h2>' +
        urg
          .map(function (x) {
            return (
              '<div class="ind-urgente"><b>Carga ' +
              esc(x.rec.load) +
              '</b><span class="hm-soft">' +
              esc(x.rec.customer || "") +
              " · " +
              esc(x.reasons[0] ? x.reasons[0].text : "") +
              '</span><button class="ws-btn" data-home-open="' +
              esc(x.rec.load) +
              '">Abrir</button></div>'
            );
          })
          .join("")
      : "";

    // Por CSR (solo Supervisor / Seguimiento)
    var secCsr = document.getElementById("ind-csr-section");
    secCsr.hidden = PANEL_CONFIG.INTERNAL_ONLY || !puedeVerTodo_();
    if (!PANEL_CONFIG.INTERNAL_ONLY && puedeVerTodo_()) {
      var slaPorCsr = {};
      (lastSlaPairs || []).forEach(function (p) {
        var rec = recPorLoad_(p.load);
        var csr = rec ? csrDeLoad(rec) : "";
        if (!csr) return;
        (slaPorCsr[csr] = slaPorCsr[csr] || []).push(p.minutes);
      });
      var filas = (personas || [])
        .filter(function (p) {
          return esCsrOperativo_(p);
        })
        .map(function (p) {
          var cargas = loadsOfCsr(p.nombre);
          var ahora = cargas.filter(function (r) {
            return journeyBucket(journeyReasons(r)) === "now";
          }).length;
          var sla = slaPorCsr[p.nombre] || [];
          var prom = sla.length
            ? sla.reduce(function (s, m) {
                return s + m;
              }, 0) / sla.length
            : null;
          return {
            n: p.nombre,
            activas: cargas.length,
            ahora: ahora,
            sinAvisar: cargas.filter(function (r) {
              return r.client_notify_pending;
            }).length,
            rec: cargas.filter(isRecordatorioVencido).length,
            prom: prom,
            avisos: sla.length,
          };
        })
        .sort(function (a, b2) {
          return b2.ahora - a.ahora || b2.activas - a.activas;
        });
      document.getElementById("ind-csr").innerHTML =
        '<thead><tr><th>CSR</th><th class="num">Activas</th><th class="num">Atender ahora</th><th class="num">Sin avisar</th><th class="num">Recordatorios vencidos</th><th class="num">Tiempo de respuesta (30 días)</th></tr></thead><tbody>' +
        (filas
          .map(function (f) {
            return (
              "<tr><td>" +
              esc(f.n) +
              '</td><td class="num">' +
              esc(f.activas) +
              '</td><td class="num ' +
              (f.ahora ? "sev-critical" : "") +
              '">' +
              esc(f.ahora) +
              '</td><td class="num ' +
              (f.sinAvisar ? "sev-warn" : "") +
              '">' +
              esc(f.sinAvisar) +
              '</td><td class="num ' +
              (f.rec ? "sev-warn" : "") +
              '">' +
              esc(f.rec) +
              '</td><td class="num">' +
              (f.prom === null
                ? "—"
                : fmtMinutesSla(f.prom) +
                  " <small>(" +
                  esc(f.avisos) +
                  ")</small>") +
              "</td></tr>"
            );
          })
          .join("") ||
          '<tr><td colspan="6">No hay CSR configurados.</td></tr>') +
        "</tbody>";
    }

    // Puntualidad por cliente — últimos 30 días
    var corte = Date.now() - 30 * 864e5,
      pc = {};
    scope.forEach(function (r) {
      var c = r.customer || "Sin cliente";
      var x = (pc[c] = pc[c] || { pu: 0, puOk: 0, en: 0, enOk: 0 });
      var fp = pd(r.pickup_appt),
        fe = pd(r.delivery_appt);
      var p = aTiempo_(r.pickup_delta_min),
        e = aTiempo_(r.delivery_delta_min);
      if (p !== null && fp && fp.getTime() >= corte) {
        x.pu++;
        if (p) x.puOk++;
      }
      if (e !== null && fe && fe.getTime() >= corte) {
        x.en++;
        if (e) x.enOk++;
      }
    });
    var clientesP = Object.keys(pc)
      .filter(function (c) {
        return pc[c].pu || pc[c].en;
      })
      .sort(function (a, b2) {
        var ra = (pc[a].enOk + pc[a].puOk) / (pc[a].en + pc[a].pu || 1),
          rb = (pc[b2].enOk + pc[b2].puOk) / (pc[b2].en + pc[b2].pu || 1);
        return ra - rb;
      });
    document.getElementById("ind-puntualidad").innerHTML =
      '<thead><tr><th>Cliente</th><th class="num">Pickups medidos</th><th class="num">Pickup a tiempo</th><th class="num">Entregas medidas</th><th class="num">Entrega a tiempo</th></tr></thead><tbody>' +
      (clientesP
        .map(function (c) {
          var x = pc[c];
          return (
            "<tr><td>" +
            esc(c) +
            '</td><td class="num">' +
            esc(x.pu) +
            '</td><td class="num ' +
            sevPct_(x.puOk, x.pu) +
            '">' +
            pct_(x.puOk, x.pu) +
            '</td><td class="num">' +
            esc(x.en) +
            '</td><td class="num ' +
            sevPct_(x.enOk, x.en) +
            '">' +
            pct_(x.enOk, x.en) +
            "</td></tr>"
          );
        })
        .join("") ||
        '<tr><td colspan="5">Todavía no hay cargas con hora real de pickup o entrega en los últimos 30 días.</td></tr>') +
      "</tbody>";

    // Tiempo en frontera — últimas 4 semanas
    var corteF = Date.now() - 28 * 864e5,
      fr = {},
      todas = [];
    scope.forEach(function (r) {
      var h = horasEntre_(r.salida_mexico_fecha, r.cruce_usa_fecha),
        fc = pd(r.cruce_usa_fecha);
      if (h === null || !fc || fc.getTime() < corteF) return;
      var c = r.customer || "Sin cliente";
      (fr[c] = fr[c] || []).push(h);
      todas.push(h);
    });
    var prom = function (a) {
      return (
        a.reduce(function (s, v) {
          return s + v;
        }, 0) / a.length
      );
    };
    var filasF = Object.keys(fr)
      .sort(function (a, b2) {
        return prom(fr[b2]) - prom(fr[a]);
      })
      .map(function (c) {
        return (
          "<tr><td>" +
          esc(c) +
          '</td><td class="num">' +
          esc(fr[c].length) +
          '</td><td class="num">' +
          fmtHoras_(prom(fr[c])) +
          '</td><td class="num">' +
          fmtHoras_(Math.max.apply(null, fr[c])) +
          "</td></tr>"
        );
      });
    document.getElementById("ind-frontera").innerHTML =
      '<thead><tr><th>Cliente</th><th class="num">Cruces</th><th class="num">Promedio</th><th class="num">Máximo</th></tr></thead><tbody>' +
      (filasF.length
        ? filasF.join("") +
          '<tr><td><b>Todos</b></td><td class="num"><b>' +
          esc(todas.length) +
          '</b></td><td class="num"><b>' +
          fmtHoras_(prom(todas)) +
          '</b></td><td class="num"><b>' +
          fmtHoras_(Math.max.apply(null, todas)) +
          "</b></td></tr>"
        : '<tr><td colspan="4">Todavía no hay cargas con "Salida planta" y "Cruce" capturados en las últimas 4 semanas.</td></tr>') +
      "</tbody>";

    // Reporte semanal: clientes del alcance y semana pasada por default
    var selC = document.getElementById("rep-cliente"),
      actual = selC.value,
      cl = {};
    scope.forEach(function (r) {
      if (r.customer) cl[r.customer] = true;
    });
    selC.innerHTML = Object.keys(cl)
      .sort()
      .map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + "</option>";
      })
      .join("");
    if (actual && cl[actual]) selC.value = actual;
    var desde = document.getElementById("rep-desde");
    if (!desde.value) {
      var l = lunesDe_(new Date());
      l.setDate(l.getDate() - 7);
      desde.value =
        l.getFullYear() +
        "-" +
        ("0" + (l.getMonth() + 1)).slice(-2) +
        "-" +
        ("0" + l.getDate()).slice(-2);
    }
  }

  document
    .getElementById("rep-descargar")
    .addEventListener("click", function () {
      var cliente = document.getElementById("rep-cliente").value,
        d = document.getElementById("rep-desde").value;
      if (!cliente || !d) {
        showToast("Elige cliente y semana", "error");
        return;
      }
      var p = d.split("-"),
        ini = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])),
        fin = new Date(ini);
      fin.setDate(ini.getDate() + 7);
      var enSemana = function (v) {
        var f = pd(v);
        return f && !isNaN(f) && f >= ini && f < fin;
      };
      var cargas = actionCenterScope(currentData).filter(function (r) {
        return (
          r.customer === cliente &&
          (enSemana(r.pickup_appt) || enSemana(r.delivery_appt))
        );
      });
      var siNo = function (v) {
        return v === null ? "" : v ? "Sí" : "No";
      };
      var pu = cargas
        .map(function (r) {
          return aTiempo_(r.pickup_delta_min);
        })
        .filter(function (v) {
          return v !== null;
        });
      var en = cargas
        .map(function (r) {
          return aTiempo_(r.delivery_delta_min);
        })
        .filter(function (v) {
          return v !== null;
        });
      var hs = cargas
        .map(function (r) {
          return horasEntre_(r.salida_mexico_fecha, r.cruce_usa_fecha);
        })
        .filter(function (v) {
          return v !== null;
        });
      var cuenta = function (a) {
        return a.filter(Boolean).length;
      };
      var filas = [
        ["Reporte semanal", cliente],
        [
          "Semana",
          fmtDateOnly(ini.toISOString()) +
            " al " +
            fmtDateOnly(new Date(fin - 1).toISOString()),
        ],
        ["Cargas", cargas.length],
        [
          "Pickup a tiempo",
          pct_(cuenta(pu), pu.length) +
            " (" +
            cuenta(pu) +
            " de " +
            pu.length +
            ")",
        ],
        [
          "Entrega a tiempo",
          pct_(cuenta(en), en.length) +
            " (" +
            cuenta(en) +
            " de " +
            en.length +
            ")",
        ],
        [
          "Tiempo promedio en frontera",
          hs.length
            ? fmtHoras_(
                hs.reduce(function (s, v) {
                  return s + v;
                }, 0) / hs.length,
              )
            : "—",
        ],
        [],
        [
          "Load",
          "WO",
          "Estatus",
          "Origen",
          "Destino",
          "Cita pickup",
          "Pickup real",
          "Retraso pickup (min)",
          "Pickup a tiempo",
          "Cita entrega",
          "Entrega real",
          "Retraso entrega (min)",
          "Entrega a tiempo",
          "Horas en frontera",
          "Incidencias",
        ],
      ].concat(
        cargas.map(function (r) {
          return [
            r.load,
            r.work_order,
            r.status,
            titleCity(r.origin_city) +
              (r.origin_state ? ", " + r.origin_state : ""),
            titleCity(r.dest_city) + (r.dest_state ? ", " + r.dest_state : ""),
            r.pickup_appt ? fmtDateTime(r.pickup_appt) : "",
            r.pickup_actual ? fmtDateTime(r.pickup_actual) : "",
            r.pickup_delta_min,
            siNo(aTiempo_(r.pickup_delta_min)),
            r.delivery_appt ? fmtDateTime(r.delivery_appt) : "",
            r.delivery_actual ? fmtDateTime(r.delivery_actual) : "",
            r.delivery_delta_min,
            siNo(aTiempo_(r.delivery_delta_min)),
            (function () {
              var h = horasEntre_(r.salida_mexico_fecha, r.cruce_usa_fecha);
              return h === null ? "" : h.toFixed(1);
            })(),
            Number(r.incidenciasCount) || 0,
          ];
        }),
      );
      if (!window.panelPersonal.preferences.show_crossings) {
        filas = filas.filter(function (row) {
          return row[0] !== "Tiempo promedio en frontera";
        });
        var headerIndex = filas.findIndex(function (row) {
          return row[0] === "Load";
        });
        filas.slice(headerIndex).forEach(function (row) {
          row.splice(13, 1);
        });
      }
      var csv =
        "﻿" +
        filas
          .map(function (f) {
            return f.map(csvEscape_).join(",");
          })
          .join("\r\n");
      downloadTextFile_(
        "reporte_" +
          cliente.replace(/[^a-z0-9áéíóúñ]+/gi, "_") +
          "_" +
          d +
          ".csv",
        csv,
        "text/csv",
      );
      showToast(
        "Reporte descargado: " +
          cargas.length +
          (cargas.length === 1 ? " carga" : " cargas"),
        "good",
      );
    });

  // ===== Inicio de turno =====
  // Una vez al día por persona, al entrar: lo que le dejaron (pendientes de turno asignados, el
  // último cierre de turno recibido) y cuántos avisos tiene, antes de ponerse a trabajar.
  function mostrarInicioTurno_() {
    if (!myRealIdentity || !bitacoraCargada_ || !lastLoadsFetchTs) return;
    var clave = "bajio_inicio_turno_" + myRealIdentity,
      hoy = new Date().toDateString();
    try {
      if (localStorage.getItem(clave) === hoy) return;
    } catch (e) {}
    var asignados = (bitacora || []).filter(function (x) {
      return !x.resuelto && x.creado_por && x.creado_por !== myRealIdentity;
    });
    var cierre =
      currentWhoPuedeVerCierres_() && lastCierresRecibidos.length
        ? lastCierresRecibidos[0]
        : null;
    var sinVer = avisosEstado_
      ? avisosEstado_.lista.filter(function (a) {
          return a.nuevo;
        }).length
      : 0;
    if (!asignados.length && !cierre && !sinVer) return;
    try {
      localStorage.setItem(clave, hoy);
    } catch (e) {}
    var html =
      "<p>" +
      briefGreeting() +
      ", " +
      esc(myRealIdentity) +
      ". Antes de empezar:</p>";
    if (asignados.length) {
      html +=
        "<p><b>Te dejaron " +
        esc(asignados.length) +
        (asignados.length === 1
          ? " pendiente de turno"
          : " pendientes de turno") +
        ":</b></p><ul>" +
        asignados
          .slice(0, 6)
          .map(function (x) {
            return (
              "<li>" +
              esc(x.nota) +
              ' <span style="color:var(--ink-faint)">— ' +
              esc(x.creado_por) +
              (x.load ? " · Carga " + esc(x.load) : "") +
              "</span></li>"
            );
          })
          .join("") +
        (asignados.length > 6
          ? "<li>… y " + (asignados.length - 6) + " más</li>"
          : "") +
        "</ul>";
    }
    if (cierre)
      html +=
        "<p><b>Último cierre de turno recibido</b> (" +
        esc(cierre.csr || "") +
        ", " +
        esc(fmtDateTime(cierre.creado_en)) +
        '):</p><pre class="cierre-detail" style="max-height:180px;overflow:auto">' +
        esc(String(cierre.texto || "").slice(0, 1500)) +
        "</pre>";
    if (sinVer)
      html +=
        "<p>Tienes <b>" + sinVer + "</b> avisos sin ver en la campana 🔔.</p>";
    confirmarModal_(
      "Inicio de turno",
      html,
      asignados.length ? "Ver mis pendientes" : "Ver avisos",
      function () {
        if (asignados.length) showMainPage("home", "group-bitacora");
        else abrirAvisos_(true);
      },
    );
    document.getElementById("confirmar-cancelar").textContent = "Cerrar";
  }

  // ===== Ventana de confirmación reutilizable =====
  var confirmarOk_ = null;
  function confirmarModal_(titulo, html, textoOk, onOk) {
    document.getElementById("confirmar-titulo").textContent = titulo;
    document.getElementById("confirmar-cuerpo").innerHTML = html;
    var ok = document.getElementById("confirmar-ok");
    ok.textContent = textoOk || "Confirmar";
    ok.hidden = !onOk;
    document.getElementById("confirmar-cancelar").textContent = onOk
      ? "Cancelar"
      : "Cerrar";
    confirmarOk_ = onOk || null;
    document.getElementById("confirmar-backdrop").classList.add("show");
  }
  function cerrarConfirmar_() {
    document.getElementById("confirmar-backdrop").classList.remove("show");
    confirmarOk_ = null;
  }
  document
    .getElementById("confirmar-ok")
    .addEventListener("click", function () {
      var fn = confirmarOk_;
      cerrarConfirmar_();
      if (fn) fn();
    });
  ["confirmar-cerrar", "confirmar-cancelar"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", cerrarConfirmar_);
  });
  document
    .getElementById("confirmar-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "confirmar-backdrop") cerrarConfirmar_();
    });

  // ===== Administración extra en "Gestionar CSR" =====
  // Cuentas del Portal Cliente, contraseña de la Vista Gerencia, cuentas bloqueadas y deshacer la
  // última importación. Se cargan cada vez que se abre "Gestionar CSR" (ver submitCsrPassword).
  var portalClientes_ = [];
  function cargarAdminExtras_() {
    var sel = document.getElementById("pc-cliente");
    var clientes = {};
    currentData.forEach(function (r) {
      if (r.customer) clientes[String(r.customer).trim()] = true;
    });
    asignaciones.forEach(function (a) {
      if (a.cliente) clientes[String(a.cliente).trim()] = true;
    });
    sel.innerHTML =
      '<option value="">Elige el cliente…</option>' +
      Object.keys(clientes)
        .sort()
        .map(function (c) {
          return '<option value="' + esc(c) + '">' + esc(c) + "</option>";
        })
        .join("");
    if (!PANEL_CONFIG.INTERNAL_ONLY) {
      google.script.run
        .withSuccessHandler(function (res) {
          portalClientes_ = res && res.ok ? res.items : [];
          renderPortalClientes_();
        })
        .getPortalClientes(csrAdminPw);
    }
    google.script.run
      .withSuccessHandler(renderBloqueos_)
      .getBloqueos(csrAdminPw);
    google.script.run.withSuccessHandler(renderDeshacerImport_).getImportInfo();
    cargarBitacoraAdmin_();
  }

  function cargarBitacoraAdmin_() {
    google.script.run
      .withSuccessHandler(function (res) {
        var el = document.getElementById("admin-bitacora-lista");
        var items = res && res.ok ? res.items : [];
        el.innerHTML = items.length
          ? items
              .map(function (x) {
                return (
                  '<div class="admin-item"><span class="admin-sub">' +
                  esc(fmtDateTime(x.fecha)) +
                  '</span><span class="admin-nombre">' +
                  esc(x.quien) +
                  "</span>" +
                  "<span>" +
                  esc(x.accion) +
                  (x.detalle
                    ? ' · <span class="admin-sub">' + esc(x.detalle) + "</span>"
                    : "") +
                  "</span></div>"
                );
              })
              .join("")
          : '<div class="comments-empty">Todavía no hay acciones registradas.</div>';
      })
      .getBitacoraAdmin(csrAdminPw);
  }

  function renderPortalClientes_() {
    var el = document.getElementById("pc-lista");
    if (!portalClientes_.length) {
      el.innerHTML =
        '<div class="comments-empty">Todavía no hay cuentas del portal.</div>';
      return;
    }
    el.innerHTML = portalClientes_
      .map(function (c) {
        return (
          '<div class="admin-item"><span class="admin-nombre">' +
          esc(c.usuario) +
          "</span>" +
          '<span class="admin-sub">' +
          esc(c.nombre) +
          " · " +
          esc(c.cliente) +
          "</span>" +
          (c.bloqueado ? '<span class="admin-tag lock">Bloqueada</span>' : "") +
          '<span class="admin-tag ' +
          (c.activo ? "on" : "off") +
          '">' +
          (c.activo ? "Activa" : "Desactivada") +
          "</span>" +
          '<button type="button" class="ws-btn" data-pc-editar="' +
          esc(c.usuario) +
          '">Editar</button>' +
          '<button type="button" class="ws-btn" data-pc-activo="' +
          esc(c.usuario) +
          '" data-valor="' +
          (c.activo ? "0" : "1") +
          '">' +
          (c.activo ? "Desactivar" : "Activar") +
          "</button>" +
          '<button type="button" class="csr-remove" data-pc-borrar="' +
          esc(c.usuario) +
          '" title="Eliminar cuenta">&times;</button></div>'
        );
      })
      .join("");
  }

  document
    .getElementById("pc-guardar-btn")
    .addEventListener("click", function () {
      var nombre = document.getElementById("pc-nombre").value.trim();
      var cliente = document.getElementById("pc-cliente").value;
      var usuario = document.getElementById("pc-usuario").value.trim();
      var password = document.getElementById("pc-password").value.trim();
      if (!nombre || !cliente || !usuario) {
        showToast("Falta nombre, cliente o usuario", "error");
        return;
      }
      guardarConVerificacion_(
        function (res) {
          ["pc-nombre", "pc-usuario", "pc-password"].forEach(function (id) {
            document.getElementById(id).value = "";
          });
          document.getElementById("pc-cliente").value = "";
          showToast(
            res && res.updated
              ? "Cuenta actualizada: " + usuario
              : "Cuenta creada: " + usuario,
            "good",
          );
          cargarAdminExtras_();
        },
        function (err) {
          showToast("No se pudo guardar la cuenta: " + err.message, "error");
        },
      ).addPortalCliente(nombre, cliente, usuario, password, adminCred_());
    });

  document.getElementById("pc-lista").addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-pc-editar]"))) {
      var c = portalClientes_.filter(function (x) {
        return x.usuario === b.getAttribute("data-pc-editar");
      })[0];
      if (!c) return;
      document.getElementById("pc-nombre").value = c.nombre;
      document.getElementById("pc-cliente").value = c.cliente;
      document.getElementById("pc-usuario").value = c.usuario;
      document.getElementById("pc-password").value = "";
      document.getElementById("pc-password").focus();
      return;
    }
    if ((b = e.target.closest("[data-pc-activo]"))) {
      var usuario = b.getAttribute("data-pc-activo"),
        activo = b.getAttribute("data-valor") === "1";
      guardarConVerificacion_(
        function () {
          showToast(
            (activo ? "Cuenta activada: " : "Cuenta desactivada: ") + usuario,
            "good",
          );
          cargarAdminExtras_();
        },
        function (err) {
          showToast("No se pudo cambiar: " + err.message, "error");
        },
      ).setPortalClienteActivo(usuario, activo, adminCred_());
      return;
    }
    if ((b = e.target.closest("[data-pc-borrar]"))) {
      var u = b.getAttribute("data-pc-borrar");
      portalClientes_ = portalClientes_.filter(function (x) {
        return x.usuario !== u;
      });
      renderPortalClientes_();
      accionConDeshacer_(
        "Cuenta del portal eliminada: " + u,
        function () {
          guardarConVerificacion_(
            function () {
              cargarAdminExtras_();
            },
            function (err) {
              cargarAdminExtras_();
              showToast("No se pudo eliminar: " + err.message, "error");
            },
          ).removePortalCliente(u, adminCred_());
        },
        function () {
          cargarAdminExtras_();
        },
      );
    }
  });

  document
    .getElementById("vista-pw-btn")
    .addEventListener("click", function () {
      var input = document.getElementById("vista-pw-nueva");
      var pw = input.value.trim();
      if (pw.length < 8) {
        showToast("La contraseña debe tener al menos 8 caracteres", "error");
        return;
      }
      guardarConVerificacion_(
        function () {
          input.value = "";
          showToast("Contraseña de la Vista Gerencia actualizada", "good");
        },
        function (err) {
          showToast("No se pudo cambiar: " + err.message, "error");
        },
      ).setVistaLecturaPassword(pw, adminCred_());
    });

  function renderBloqueos_(res) {
    var el = document.getElementById("bloqueos-lista");
    var items = res && res.ok ? res.items : [];
    el.innerHTML = items.length
      ? items
          .map(function (b) {
            return (
              '<div class="admin-item"><span class="admin-nombre">' +
              esc(b.etiqueta) +
              '</span><span class="admin-tag lock">Bloqueada</span>' +
              '<button type="button" class="ws-btn" data-desbloquear="' +
              esc(b.clave) +
              '">Desbloquear</button></div>'
            );
          })
          .join("")
      : '<div class="comments-empty">✓ No hay cuentas bloqueadas.</div>';
  }
  document
    .getElementById("bloqueos-lista")
    .addEventListener("click", function (e) {
      var b = e.target.closest("[data-desbloquear]");
      if (!b) return;
      guardarConVerificacion_(
        function () {
          showToast("Cuenta desbloqueada", "good");
          cargarAdminExtras_();
        },
        function (err) {
          showToast("No se pudo desbloquear: " + err.message, "error");
        },
      ).desbloquearCuenta(b.getAttribute("data-desbloquear"), adminCred_());
    });

  function renderDeshacerImport_(info) {
    var box = document.getElementById("deshacer-import-box");
    var desde = info && info.deshacerDisponibleDesde;
    if (!desde) {
      box.innerHTML = "No hay una importación reciente que se pueda deshacer.";
      return;
    }
    box.innerHTML =
      "Archivo: <b>" +
      esc(info.fileName || "Importación anterior") +
      "</b> · " +
      esc(info.author || "") +
      "<br>Última importación: <b>" +
      esc(fmtDateTime(desde)) +
      "</b> (" +
      esc(relativeTimeLabel(desde)) +
      "). " +
      '<button type="button" class="ws-btn" id="deshacer-import-btn" style="margin-left:.4rem">Deshacer esa importación</button>';
    document
      .getElementById("deshacer-import-btn")
      .addEventListener("click", function () {
        confirmarModal_(
          "Deshacer la última importación",
          "<p>Se restaurarán los cambios del archivo <b>" +
            esc(info.fileName || "Importación anterior") +
            "</b>, por " +
            esc(info.author || "usuario registrado") +
            ", importado el <b>" +
            esc(fmtDateTime(desde)) +
            "</b>.</p>" +
            '<p class="aviso-fuerte">Supabase comprobará que las cargas no hayan cambiado después de importar. Si alguien las editó, se cancelará la restauración para conservar ese trabajo.</p>' +
            "<p>Los comentarios, comunicaciones e incidencias no se tocan.</p>",
          "Sí, deshacer",
          function () {
            guardarConVerificacion_(
              function (res) {
                showToast(
                  "Importación deshecha: " +
                    res.restauradas +
                    " cargas restauradas",
                  "good",
                );
                lastImportAt = "";
                renderOperationMeta();
                lastLoadsFetchTs = 0;
                loadData();
                cargarAdminExtras_();
              },
              function (err) {
                showToast("No se pudo deshacer: " + err.message, "error");
              },
            ).deshacerUltimaImportacion(adminCred_());
          },
        );
      });
  }

  // ===== Centro de avisos =====
  // Para que a ningún CSR se le olvide nada. Dos tipos de aviso, siempre dentro del alcance de
  // quien inició sesión (mismas cargas que su Action Center):
  //  - EVENTOS (algo nuevo): carga que entra a "Atender ahora", cliente que queda pendiente de
  //    avisar, pendiente de turno que te asignan. No avisa lo que tú mismo provocaste, y la primera
  //    vez que alguien abre el panel con esta versión, lo que ya existía se toma como "visto".
  //  - RECORDATORIOS (se vence algo): próxima revisión, recordatorio de estatus, cliente sin
  //    avisar +1h, entrega en <2h sin llegar a planta, pendiente de turno en su fecha. Se revisan
  //    cada minuto aunque no cambie ningún dato.
  // Lo que ya se avisó se recuerda por usuario en este navegador (localStorage), así que recargar
  // la página no repite avisos. Un aviso sale de la lista solo cuando su motivo se resuelve.
  // No se usan título/ícono de la pestaña: Apps Script sirve el panel dentro de un iframe de otro
  // dominio y desde ahí no se pueden cambiar. Los avisos de escritorio (casilla "Escritorio") se
  // intentan con la API de notificaciones; si el navegador no los permite dentro de ese iframe,
  // la casilla se apaga sola y lo explica (el sonido sí funciona con la pestaña en segundo plano).
  var AVISO_EVENTO_ = { now: true, com: true, bit: true, sincsr: true };
