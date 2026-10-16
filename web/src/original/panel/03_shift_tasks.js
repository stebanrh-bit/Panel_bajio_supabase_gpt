// ---- Bitácora de turno ----
  // Notas libres que un turno le deja al siguiente (07:00–16:00 / 16:00–00:00 / 00:00–07:00,
  // aplica igual en fin de semana), o que alguien deja para quien vaya a cubrirlo un sábado o
  // domingo. Es independiente de "Pendientes de load" (esa es solo para cargas que el cliente
  // todavía no confirma). El turno se calcula solo, en el servidor, según la hora en que se
  // registra (ver turnoActual_ en Code.gs) — aquí no hay que elegirlo a mano.
  var bitacora = [];

  // Una vez marcada como atendida, una nota se deja de mostrar después de este tiempo, para que
  // la bitácora no se llene de cosas ya resueltas — el registro completo se queda en la hoja
  // "BitacoraTurno" de todas formas, esto solo controla qué se ve en el panel.
  var BITACORA_HIDE_RESUELTOS_AFTER_DAYS = 2;

  function bitacoraCardHtml(b) {
    var paraTexto = b.asignado_a
      ? esc(b.asignado_a)
      : b.asignado_csr
        ? "quien siga a " + esc(b.asignado_csr)
        : "—";
    var meta =
      "De " +
      (b.creado_por ? esc(b.creado_por) : "—") +
      " · Para " +
      paraTexto +
      (b.creado_en ? " · " + fmtDateTime(b.creado_en) : "");
    // FIX: chip de "fecha de seguimiento" — cuándo hay que darle seguimiento a este pendiente
    // (p. ej. al asignar varios loads al cierre de turno). Se muestra aparte de los recordatorios
    // normales del load, y se pone en rojo si ya se venció y sigue sin resolverse.
    var followupHtml = "";
    if (b.fecha_seguimiento) {
      var fsDate = new Date(b.fecha_seguimiento);
      if (!isNaN(fsDate.getTime())) {
        var vencido =
          !b.resuelto && fsDate.getTime() < new Date().setHours(0, 0, 0, 0);
        followupHtml =
          '<span class="bitacora-followup' +
          (vencido ? " overdue" : "") +
          '">' +
          (vencido ? "⚠ " : "") +
          "Seguimiento: " +
          esc(
            fsDate.toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
            }),
          ) +
          "</span>";
      }
    }
    return (
      '<article class="card s-' +
      (b.color || "neutral") +
      (b.color ? " manual-color" : "") +
      (b.resuelto ? " bitacora-resuelto" : "") +
      '" data-bitacora-id="' +
      esc(b.id) +
      '">' +
      '<div class="card-top">' +
      "<div>" +
      '<span class="customer">Turno ' +
      esc(b.turno) +
      "</span>" +
      '<div class="route">' +
      meta +
      "</div>" +
      (b.load
        ? '<button type="button" class="pod-pending-tag bitacora-load-link" style="background:var(--surface-2); color:var(--ink-faint);" data-open-bitacora-load="' +
          esc(b.load) +
          '" title="Abrir esta carga para editarla o comentar">Carga ' +
          esc(b.load) +
          "</button>"
        : "") +
      followupHtml +
      "</div>" +
      '<div class="bitacora-card-actions">' +
      '<button type="button" class="icon-btn" data-edit-bitacora="' +
      esc(b.id) +
      '" title="Editar">' +
      ICON_EDIT +
      "</button>" +
      '<button type="button" class="csr-remove" data-remove-bitacora="' +
      esc(b.id) +
      '" title="Eliminar">&times;</button>' +
      "</div>" +
      "</div>" +
      '<div class="notes has-content">' +
      escHtml(b.nota) +
      "</div>" +
      '<label class="pod-check" style="margin-top:0.6rem;">' +
      '<input type="checkbox" data-resolver-bitacora="' +
      esc(b.id) +
      '"' +
      (b.resuelto ? " checked" : "") +
      ">" +
      "<span>Ya se le dio seguimiento</span>" +
      "</label>" +
      "</article>"
    );
  }

  function renderBitacora() {
    var abiertos = bitacora.filter(function (b) {
      return !b.resuelto;
    }).length;
    var badgeB = document.getElementById("sidebar-badge-bitacora");
    if (badgeB) {
      badgeB.textContent = abiertos > 99 ? "99+" : String(abiertos);
      badgeB.classList.toggle("show", abiertos > 0);
    }
    var cutoff =
      Date.now() - BITACORA_HIDE_RESUELTOS_AFTER_DAYS * 24 * 60 * 60 * 1000;
    var visibles = bitacora.filter(function (b) {
      if (!b.resuelto) return true;
      var ts = b.resuelto_en
        ? new Date(b.resuelto_en).getTime()
        : new Date(b.creado_en).getTime();
      return ts >= cutoff;
    });
    visibles.sort(function (a, b) {
      if (!!a.resuelto !== !!b.resuelto) return a.resuelto ? 1 : -1;
      if (!a.resuelto) {
        var fa = a.fecha_seguimiento
          ? new Date(a.fecha_seguimiento).getTime()
          : Infinity;
        var fb = b.fecha_seguimiento
          ? new Date(b.fecha_seguimiento).getTime()
          : Infinity;
        if (fa !== fb) return fa - fb;
      }
      return new Date(b.creado_en) - new Date(a.creado_en);
    });
    var asignados = visibles.filter(function (b) {
      return b.creado_por && b.creado_por !== myRealIdentity;
    });
    var propios = visibles.filter(function (b) {
      return !b.creado_por || b.creado_por === myRealIdentity;
    });

    // El contador del encabezado corresponde a las tareas propias; el lateral reúne todas.
    document.getElementById("count-bitacora").textContent = propios.filter(
      function (b) {
        return !b.resuelto;
      },
    ).length;

    var elAsig = document.getElementById("bitacora-asignados-list");
    var countAsig = document.getElementById("count-bitacora-asignados");
    var abiertosAsig = asignados.filter(function (b) {
      return !b.resuelto;
    }).length;
    if (countAsig) countAsig.textContent = abiertosAsig;
    if (!asignados.length) {
      elAsig.innerHTML =
        '<div class="comments-empty">No tienes tareas asignadas.</div>';
      resetRenderState("bitacora-asignados-list");
    } else {
      diffRenderContainer(
        "bitacora-asignados-list",
        asignados,
        function (b) {
          return String(b.id);
        },
        bitacoraCardHtml,
      );
    }

    var el = document.getElementById("bitacora-list");
    if (!propios.length) {
      el.innerHTML =
        '<div class="comments-empty">' +
        (myRealIdentity
          ? "Todavía no has registrado tareas."
          : "Inicia sesión para ver tus tareas.") +
        "</div>";
      resetRenderState("bitacora-list");
    } else {
      // Los botones (eliminar/marcar atendido) están delegados en document (ver
      // wireDelegatedEventsOnce) — no hace falta reconectar nada aquí.
      diffRenderContainer(
        "bitacora-list",
        propios,
        function (b) {
          return String(b.id);
        },
        bitacoraCardHtml,
      );
    }
    if (typeof currentData !== "undefined") renderShiftBrief(currentData);
  }

  var bitacoraRequestSeq = 0;
  function loadBitacora() {
    // Solo trae los pendientes asignados a quien tiene la identidad verificada en este
    // navegador — a nadie le aparecen los de los demás, para no saturar de información que no
    // le toca (ver getBitacoraTurno en Code.gs). Si todavía nadie ha verificado su identidad,
    // el servidor regresa vacío.
    var seq = ++bitacoraRequestSeq;
    google.script.run
      .withSuccessHandler(function (json) {
        if (seq !== bitacoraRequestSeq) return; // respuesta de una petición vieja — ya no aplica
        aplicarBitacora_(json);
      })
      .getBitacoraTurno(myRealIdentity, myPassword);
  }
  function aplicarBitacora_(json) {
    bitacoraRequestSeq++; // lo que venga de una petición anterior ya no aplica
    bitacora = sinBorrandose_(JSON.parse(json));
    bitacoraCargada_ = true;
    renderBitacora();
    programarAvisos_();
  }

  var historico = [];
  var historicoRequestSeq = 0;
  function loadHistoricoPendientes(offset) {
    var seq = ++historicoRequestSeq;
    var body = document.getElementById("historico-body");
    var empty = document.getElementById("historico-empty");
    if (empty) empty.style.display = "none";
    document.getElementById("historico-count").textContent = "—";
    if (
      !window.panelValidation.validateDateRange(
        document.getElementById("historico-desde"),
        document.getElementById("historico-hasta"),
      )
    ) {
      if (body)
        body.innerHTML =
          '<tr><td colspan="7">Corrige las fechas para consultar el histórico.</td></tr>';
      var more = document.getElementById("task-history-more");
      if (more) more.hidden = true;
      return;
    }
    offset = typeof offset === "number" ? offset : 0;
    if (body)
      body.innerHTML =
        '<tr><td colspan="7" style="color:var(--ink-soft);">Cargando…</td></tr>';
    google.script.run
      .withSuccessHandler(function (res) {
        if (seq !== historicoRequestSeq) return;
        if (!res || !res.ok) {
          showToast(
            (res && res.error) || "No se pudo cargar el histórico",
            "error",
          );
          if (body)
            body.innerHTML =
              '<tr><td colspan="7">No se pudo cargar el histórico. Usa Actualizar para reintentar.</td></tr>';
          var more = document.getElementById("task-history-more");
          if (more) more.disabled = false;
          return;
        }
        historico = offset
          ? historico.concat(res.items || [])
          : res.items || [];
        var more = document.getElementById("task-history-more");
        if (!more) {
          more = document.createElement("button");
          more.type = "button";
          more.className = "ws-btn";
          more.id = "task-history-more";
          body.closest(".table-wrap").after(more);
        }
        more.textContent = "Ver tareas anteriores";
        more.hidden = res.nextOffset == null;
        more.onclick = function () {
          this.disabled = true;
          loadHistoricoPendientes(res.nextOffset);
        };
        more.disabled = false;
        renderHistoricoFiltros();
        renderHistorico();
      })
      .withFailureHandler(function (err) {
        if (seq !== historicoRequestSeq) return;
        var more = document.getElementById("task-history-more");
        if (more) more.disabled = false;
        showToast(
          "Error al cargar el histórico: " +
            (err && err.message ? err.message : err),
          "error",
        );
        if (body)
          body.innerHTML =
            '<tr><td colspan="7">No se pudo cargar el histórico. Usa Actualizar para reintentar.</td></tr>';
      })
      .getBitacoraHistorico(
        myRealIdentity,
        myPassword,
        document.getElementById("historico-desde").value || null,
        document.getElementById("historico-hasta").value
          ? document.getElementById("historico-hasta").value + "T23:59:59"
          : null,
        offset,
        document.getElementById("historico-estado").value || null,
      );
  }

  // Llena los selects de "persona" y "CSR" con los nombres conocidos (de Personas) más cualquier
  // nombre que aparezca en el histórico y ya no esté en Personas (por si a alguien lo dieron de
  // baja) — así ningún registro viejo queda imposible de filtrar. Conserva la selección actual.
  function renderHistoricoFiltros() {
    var selPersona = document.getElementById("historico-persona");
    var selCsr = document.getElementById("historico-csr");
    if (!selPersona || !selCsr) return;
    var nombres = personas
      .map(function (p) {
        return p.nombre;
      })
      .slice();
    var csrNombres = personas
      .filter(function (p) {
        return esCsrOperativo_(p);
      })
      .map(function (p) {
        return p.nombre;
      })
      .slice();
    historico.forEach(function (h) {
      if (h.creado_por && nombres.indexOf(h.creado_por) === -1)
        nombres.push(h.creado_por);
      if (h.asignado_a && nombres.indexOf(h.asignado_a) === -1)
        nombres.push(h.asignado_a);
      if (h.asignado_csr && csrNombres.indexOf(h.asignado_csr) === -1)
        csrNombres.push(h.asignado_csr);
    });
    nombres.sort(function (a, b) {
      return a.localeCompare(b, "es");
    });
    csrNombres.sort(function (a, b) {
      return a.localeCompare(b, "es");
    });
    var curP = selPersona.value,
      curC = selCsr.value;
    selPersona.innerHTML =
      '<option value="">Todas las personas</option>' +
      nombres
        .map(function (n) {
          return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
        })
        .join("");
    selCsr.innerHTML =
      '<option value="">Todos los CSR</option>' +
      csrNombres
        .map(function (n) {
          return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
        })
        .join("");
    selPersona.value = curP;
    selCsr.value = curC;
  }

  function historicoRowHtml(b) {
    // Mismo criterio que bitacoraCardHtml: si no tiene asignado_a fijo pero sí asignado_csr, es un
    // tarea por cobertura (ruteo automático a quien siga a ese CSR ahorita).
    var paraTexto = b.asignado_a
      ? esc(b.asignado_a)
      : b.asignado_csr
        ? "Quien siga a " + esc(b.asignado_csr)
        : "—";
    var tipoTexto = b.asignado_a
      ? "Asignado directo"
      : b.asignado_csr
        ? "Ruteo por CSR"
        : "";
    var estadoHtml = b.cancelado
      ? '<span class="historico-estado">Cancelada · ' +
        esc(b.motivo_cancelacion) +
        "</span>"
      : b.resuelto
        ? '<span class="historico-badge good">Atendido' +
          (b.resuelto_en ? " · " + fmtDateTime(b.resuelto_en) : "") +
          "</span>"
        : '<span class="historico-badge warn">Pendiente</span>';
    return (
      '<tr class="historico-row' +
      (b.resuelto ? " historico-row-resuelto" : "") +
      '">' +
      "<td>" +
      esc(b.turno) +
      "</td>" +
      '<td class="historico-nota">' +
      escHtml(b.nota) +
      "</td>" +
      "<td>" +
      (b.load
        ? '<button type="button" class="pod-pending-tag bitacora-load-link" style="background:var(--surface-2); color:var(--ink-faint);" data-open-bitacora-load="' +
          esc(b.load) +
          '" title="Abrir esta carga">' +
          esc(b.load) +
          "</button>"
        : "—") +
      "</td>" +
      "<td>" +
      esc(b.creado_por || "—") +
      "</td>" +
      "<td>" +
      paraTexto +
      (tipoTexto ? '<div class="historico-tipo">' + tipoTexto + "</div>" : "") +
      "</td>" +
      "<td>" +
      (b.creado_en ? fmtDateTime(b.creado_en) : "—") +
      "</td>" +
      "<td>" +
      estadoHtml +
      "</td>" +
      "</tr>"
    );
  }

  function renderHistorico() {
    var persona =
      (document.getElementById("historico-persona") || {}).value || "";
    var csr = (document.getElementById("historico-csr") || {}).value || "";
    var estado =
      (document.getElementById("historico-estado") || {}).value || "";
    var desde = (document.getElementById("historico-desde") || {}).value || "";
    var hasta = (document.getElementById("historico-hasta") || {}).value || "";
    var desdeTs = desde ? new Date(desde + "T00:00:00").getTime() : null;
    var hastaTs = hasta ? new Date(hasta + "T23:59:59").getTime() : null;
    var filtrados = historico.filter(function (b) {
      if (persona && b.creado_por !== persona && b.asignado_a !== persona)
        return false;
      if (csr && b.asignado_csr !== csr) return false;
      if (estado === "abiertos" && (b.resuelto || b.cancelado)) return false;
      if (estado === "resueltos" && !b.resuelto) return false;
      if (estado === "cancelados" && !b.cancelado) return false;
      if (desdeTs !== null || hastaTs !== null) {
        var t = b.creado_en ? new Date(b.creado_en).getTime() : NaN;
        if (isNaN(t)) return false;
        if (desdeTs !== null && t < desdeTs) return false;
        if (hastaTs !== null && t > hastaTs) return false;
      }
      return true;
    });
    var body = document.getElementById("historico-body");
    var empty = document.getElementById("historico-empty");
    var count = document.getElementById("historico-count");
    if (count) count.textContent = filtrados.length;
    if (!body) return;
    if (!filtrados.length) {
      body.innerHTML = "";
      if (empty) empty.style.display = "";
      return;
    }
    if (empty) empty.style.display = "none";
    body.innerHTML = filtrados.map(historicoRowHtml).join("");
  }

  document
    .getElementById("historico-actualizar-btn")
    .addEventListener("click", function () {
      loadHistoricoPendientes();
    });

  function resetHistoricoFiltros() {
    [
      "historico-persona",
      "historico-csr",
      "historico-estado",
      "historico-desde",
      "historico-hasta",
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    loadHistoricoPendientes();
  }

  [
    "historico-persona",
    "historico-csr",
    "historico-estado",
    "historico-desde",
    "historico-hasta",
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (el)
      el.addEventListener(
        "change",
        id === "historico-desde" ||
          id === "historico-hasta" ||
          id === "historico-estado"
          ? function () {
              loadHistoricoPendientes();
            }
          : renderHistorico,
      );
  });
  var historicoLimpiarBtn = document.getElementById("historico-limpiar-btn");
  if (historicoLimpiarBtn)
    historicoLimpiarBtn.addEventListener("click", resetHistoricoFiltros);

  // Lista completa de loads candidatos para el buscador de "Load" del pendiente de turno (se
  // filtra en el navegador, sin volver a pedirle nada al servidor — mismo mecanismo que el
  // buscador de "Vincular a load").
  var bitacoraLoadOpciones = [];
  var bitacoraColorSeleccionado = "";

  var bitacoraLoadsSeleccionados = [];

  function renderBitacoraLoadOpciones(filtro) {
    var box = document.getElementById("bitacora-load-select");
    filtro = (filtro || "").trim().toLowerCase();
    var filtradas = !filtro
      ? bitacoraLoadOpciones
      : bitacoraLoadOpciones.filter(function (r) {
          return (
            String(r.load).toLowerCase().indexOf(filtro) !== -1 ||
            (r.customer || "").toLowerCase().indexOf(filtro) !== -1
          );
        });
    if (!filtradas.length) {
      box.innerHTML = '<div class="bitacora-load-empty">Sin resultados…</div>';
      return;
    }
    box.innerHTML = filtradas
      .slice(0, 60)
      .map(function (r) {
        var checked = bitacoraLoadsSeleccionados.indexOf(String(r.load)) !== -1;
        return (
          '<label class="bitacora-load-option' +
          (checked ? " checked" : "") +
          '" data-bitacora-load-option="' +
          esc(r.load) +
          '">' +
          '<input type="checkbox"' +
          (checked ? " checked" : "") +
          ">" +
          "<span>" +
          esc(r.load) +
          " — " +
          esc(shortCustomerName(r.customer)) +
          (r.trailer ? " — " + esc(r.trailer) : "") +
          "</span>" +
          "</label>"
        );
      })
      .join("");
  }

  function renderBitacoraLoadSelected() {
    actualizarAsignacionBitacora_();
    var wrap = document.getElementById("bitacora-load-selected");
    if (!bitacoraLoadsSeleccionados.length) {
      wrap.innerHTML =
        '<span class="bitacora-load-selected-empty">Sin cargas seleccionadas. Se guardará como tarea general.</span>';
      return;
    }
    wrap.innerHTML = bitacoraLoadsSeleccionados
      .map(function (l) {
        return (
          '<span class="bitacora-load-chip">Carga ' +
          esc(l) +
          '<button type="button" data-bitacora-load-remove="' +
          esc(l) +
          '" title="Quitar">&times;</button></span>'
        );
      })
      .join("");
  }

  function toggleBitacoraLoadSeleccionado(load) {
    load = String(load);
    var idx = bitacoraLoadsSeleccionados.indexOf(load);
    if (bitacoraEditingId) {
      // Al editar, el pendiente sigue ligado a un solo load — elegir otro reemplaza al anterior.
      bitacoraLoadsSeleccionados = idx === -1 ? [load] : [];
    } else if (idx === -1) {
      bitacoraLoadsSeleccionados.push(load);
    } else {
      bitacoraLoadsSeleccionados.splice(idx, 1);
    }
    renderBitacoraLoadSelected();
    renderBitacoraLoadOpciones(
      document.getElementById("bitacora-load-search").value,
    );
  }

  document
    .getElementById("bitacora-load-select")
    .addEventListener("click", function (e) {
      var opt = e.target.closest("[data-bitacora-load-option]");
      if (!opt) return;
      toggleBitacoraLoadSeleccionado(
        opt.getAttribute("data-bitacora-load-option"),
      );
    });
  document
    .getElementById("bitacora-load-selected")
    .addEventListener("click", function (e) {
      var rm = e.target.closest("[data-bitacora-load-remove]");
      if (!rm) return;
      var idx = bitacoraLoadsSeleccionados.indexOf(
        rm.getAttribute("data-bitacora-load-remove"),
      );
      if (idx !== -1) bitacoraLoadsSeleccionados.splice(idx, 1);
      renderBitacoraLoadSelected();
      renderBitacoraLoadOpciones(
        document.getElementById("bitacora-load-search").value,
      );
    });

  function setBitacoraColor(color) {
    bitacoraColorSeleccionado = color || "";
    document
      .querySelectorAll("#bitacora-color-swatches .color-swatch")
      .forEach(function (sw) {
        var selected =
          sw.getAttribute("data-color") === bitacoraColorSeleccionado;
        sw.classList.toggle("selected", selected);
        sw.setAttribute("aria-pressed", String(selected));
      });
  }

  document
    .querySelectorAll("#bitacora-color-swatches .color-swatch")
    .forEach(function (sw) {
      sw.addEventListener("click", function () {
        setBitacoraColor(sw.getAttribute("data-color"));
      });
    });

  document
    .getElementById("bitacora-load-search")
    .addEventListener("input", function (e) {
      renderBitacoraLoadOpciones(e.target.value);
    });

  // Si "existing" viene con datos, el modal entra en modo edición: la nota, el load y el color
  // parten de lo que ya tenía guardado ese pendiente, y a quién está asignado ya no se puede
  // tocar (queda fijo, mostrado como texto) — así lo puede editar quien lo creó o la persona a
  // la que se lo asignaron, sin que se pueda "robar" reasignándoselo a otra persona a media edición.
  var bitacoraEditingId = null;

  var bitacoraAutoAssignCsr = "";
  var bitacoraRoutingCsr = "";

  /** Una sola tarea, con dos destinos distintos: persona fija o cobertura del CSR. */
  function actualizarAsignacionBitacora_() {
    // La cobertura solo es válida si todas las cargas seleccionadas tienen el mismo CSR.
    var owners = bitacoraLoadsSeleccionados.map(function (load) {
      return csrDeLoad(recPorLoad_(load));
    });
    bitacoraRoutingCsr =
      !bitacoraEditingId &&
      owners.length &&
      owners[0] &&
      owners.every(function (owner) {
        return owner === owners[0];
      })
        ? owners[0]
        : "";
    document.getElementById("bitacora-assignment-mode-wrap").hidden =
      !bitacoraRoutingCsr;
    if (!bitacoraRoutingCsr)
      document.getElementById("bitacora-assignment-mode").value = "person";
    var automatico =
      !bitacoraEditingId &&
      bitacoraRoutingCsr &&
      document.getElementById("bitacora-assignment-mode").value === "coverage";
    bitacoraAutoAssignCsr = automatico ? bitacoraRoutingCsr : "";
    document.getElementById("bitacora-asignado-wrap").style.display =
      bitacoraEditingId || automatico ? "none" : "";
    document.getElementById("bitacora-asignado-auto-label").style.display =
      automatico ? "" : "none";
    document.getElementById("bitacora-asignado-auto-csr").textContent =
      bitacoraRoutingCsr;
  }
  document
    .getElementById("bitacora-assignment-mode")
    .addEventListener("change", actualizarAsignacionBitacora_);

  function openBitacoraModal(existing, preselectLoad) {
    bitacoraEditingId = existing ? String(existing.id) : null;
    document.getElementById("bitacora-assignment-mode").value = "person";
    document.getElementById("bitacora-modal-title").textContent = existing
      ? "Editar tarea de turno"
      : "Nueva tarea de turno";
    document.getElementById("bitacora-nota").value = existing
      ? existing.nota
      : "";
    document.getElementById("bitacora-load-help").textContent = existing
      ? "Elige una carga para esta tarea o deja la selección vacía para una tarea general."
      : "Sin selección, se guarda como tarea general. Si eliges varias cargas, se crea una tarea por cada una.";
    // No ofrecer viajes terminados para una relación nueva. Al editar se conserva la relación
    // anterior aunque esa carga ya haya terminado; no se pierde el contexto de la tarea.
    bitacoraLoadOpciones = currentData.filter(cargaActivaParaVincular_);
    var cargaPreseleccionada = preselectLoad && recPorLoad_(preselectLoad);
    bitacoraLoadsSeleccionados =
      existing && existing.load
        ? [String(existing.load)]
        : cargaPreseleccionada && cargaActivaParaVincular_(cargaPreseleccionada)
          ? [String(preselectLoad)]
          : [];
    var loadBuscado = existing
      ? String(existing.load || "")
      : preselectLoad
        ? String(preselectLoad)
        : "";
    document.getElementById("bitacora-load-search").value = loadBuscado;
    renderBitacoraLoadSelected();
    renderBitacoraLoadOpciones(loadBuscado);
    document.getElementById("bitacora-fecha-seguimiento").value =
      existing && existing.fecha_seguimiento
        ? String(existing.fecha_seguimiento).slice(0, 10)
        : "";
    setBitacoraColor(existing ? existing.color || "" : "");
    document.getElementById("bitacora-asignado-wrap").style.display =
      existing || bitacoraAutoAssignCsr ? "none" : "";
    document.getElementById("bitacora-asignado-fixed-label").style.display =
      existing ? "" : "none";
    document.getElementById("bitacora-asignado-auto-label").style.display =
      bitacoraAutoAssignCsr ? "" : "none";
    if (existing) {
      document.getElementById("bitacora-asignado-fixed").textContent =
        existing.asignado_a ||
        (existing.asignado_csr
          ? "Quien cubra a " + existing.asignado_csr
          : "—");
    } else {
      var sel = document.getElementById("bitacora-asignado");
      sel.innerHTML = personas
        .map(function (p) {
          return (
            '<option value="' +
            esc(p.nombre) +
            '">' +
            esc(p.nombre) +
            (p.nombre === myRealIdentity ? " (tú)" : "") +
            "</option>"
          );
        })
        .join("");
      if (myRealIdentity) sel.value = myRealIdentity;
    }
    document.getElementById("bitacora-turno-note").textContent = existing
      ? "Actualiza la descripción, la carga, la fecha o el color. El turno y la persona asignada se conservan."
      : "Describe el trabajo pendiente y elige quién lo atenderá. La tarea queda abierta hasta que se marque como completada. El turno se registra automáticamente al guardar.";
    document.getElementById("bitacora-error").style.display = "none";
    document.getElementById("bitacora-backdrop").classList.add("show");
    document.getElementById("bitacora-nota").focus();
    recordarFotoModal_("bitacora-backdrop");
  }

  function closeBitacoraModal() {
    document.getElementById("bitacora-backdrop").classList.remove("show");
    bitacoraEditingId = null;
    bitacoraLoadsSeleccionados = [];
    bitacoraAutoAssignCsr = "";
    bitacoraRoutingCsr = "";
  }

  // ---- Aviso de cambios sin guardar (modales de bitácora y de load apartado) ----
  // Al abrir se toma una "foto" de los campos; si al cerrar con ×, Esc o clic afuera algo cambió,
  // se pregunta antes de perderlo. Guardar cierra directo, sin preguntar. La foto se toma un
  // instante después de abrir para incluir lo que se llena solo (por ejemplo, desde el Radar).
  var fotosModal_ = {};
  function fotoModal_(id) {
    var campos = Array.prototype.map.call(
      document
        .getElementById(id)
        .querySelectorAll(
          'input:not([type=hidden]):not([id$="-search"]), textarea, select',
        ),
      function (x) {
        return x.type === "checkbox" ? String(x.checked) : x.value;
      },
    );
    if (id === "bitacora-backdrop")
      campos.push(
        (bitacoraLoadsSeleccionados || []).join(","),
        bitacoraColorSeleccionado || "",
      );
    return campos.join("\u0001");
  }
  function recordarFotoModal_(id) {
    setTimeout(function () {
      fotosModal_[id] = fotoModal_(id);
    }, 0);
  }
  function cerrarSiNoHayCambios_(id, cerrar) {
    var antes = fotosModal_[id];
    if (antes === undefined || fotoModal_(id) === antes) {
      delete fotosModal_[id];
      cerrar();
      return;
    }
    confirmarModal_(
      "¿Descartar los cambios?",
      "Escribiste algo que todavía no se guarda. Si cierras ahora, se pierde.",
      "Descartar",
      function () {
        delete fotosModal_[id];
        cerrar();
      },
    );
  }
  function cerrarBitacoraConAviso_() {
    cerrarSiNoHayCambios_("bitacora-backdrop", closeBitacoraModal);
  }

  document
    .getElementById("bitacora-add-btn")
    .addEventListener("click", function () {
      ensureLoggedIn(function () {
        openBitacoraModal();
      });
    });
  document
    .getElementById("bitacora-close")
    .addEventListener("click", cerrarBitacoraConAviso_);
  document
    .getElementById("bitacora-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "bitacora-backdrop") cerrarBitacoraConAviso_();
    });
  document
    .getElementById("bitacora-submit")
    .addEventListener("click", function () {
      var nota = document.getElementById("bitacora-nota").value.trim();
      if (!nota) {
        document.getElementById("bitacora-error").textContent =
          "Describe la tarea.";
        document.getElementById("bitacora-error").style.display = "";
        document.getElementById("bitacora-nota").focus();
        return;
      }
      if (!myRealIdentity || !myPassword) {
        showToast("Verifica tu identidad antes de registrar.", "error");
        return;
      }
      // El load es opcional: sin load, queda como pendiente general del turno.
      var editingId = bitacoraEditingId;
      var asignadoA =
        editingId || bitacoraAutoAssignCsr
          ? null
          : document.getElementById("bitacora-asignado").value;
      if (!editingId && !bitacoraAutoAssignCsr && !asignadoA) {
        document.getElementById("bitacora-error").textContent =
          "Elige a quién se le asigna.";
        document.getElementById("bitacora-error").style.display = "";
        return;
      }
      var fechaSeguimiento =
        document.getElementById("bitacora-fecha-seguimiento").value || "";
      var loadsParaGuardar = bitacoraLoadsSeleccionados.slice();
      var btn = document.getElementById("bitacora-submit");
      btn.disabled = true;
      var runner = google.script.run
        .withSuccessHandler(function (res) {
          btn.disabled = false;
          if (res && res.ok) {
            closeBitacoraModal();
            loadBitacora();
            var msg = editingId
              ? "Pendiente de turno actualizado"
              : loadsParaGuardar.length > 1
                ? loadsParaGuardar.length +
                  " pendientes de turno guardados (" +
                  res.turno +
                  ")"
                : "Pendiente de turno guardado" +
                  (res.turno ? " (" + res.turno + ")" : "");
            showToast(msg, "good");
          } else {
            showToast(
              (res && res.error) || "No se pudo guardar el pendiente de turno",
              "error",
            );
          }
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          showToast("Error: " + err.message, "error");
        });
      if (editingId) {
        runner.editarBitacoraTurno(
          editingId,
          nota,
          loadsParaGuardar[0] || "",
          bitacoraColorSeleccionado,
          fechaSeguimiento,
          myRealIdentity,
          myPassword,
        );
      } else {
        runner.addBitacoraTurno(
          nota,
          loadsParaGuardar,
          asignadoA,
          bitacoraColorSeleccionado,
          fechaSeguimiento,
          myRealIdentity,
          myPassword,
          bitacoraAutoAssignCsr,
        );
      }
    });

  // ---- Colapsar/expandir la sección "Bitácora de turno" ----
  function setBitacoraCollapsed(collapsed) {
    var section = document.getElementById("group-bitacora");
    var toggle = document.getElementById("bitacora-toggle");
    section.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    try {
      localStorage.setItem("bajio_bitacora_collapsed", collapsed ? "1" : "0");
    } catch (e) {}
  }
  document
    .getElementById("bitacora-toggle")
    .addEventListener("click", function () {
      setBitacoraCollapsed(
        !document
          .getElementById("group-bitacora")
          .classList.contains("collapsed"),
      );
    });
  (function () {
    var stored = "0";
    try {
      stored = localStorage.getItem("bajio_bitacora_collapsed") || "0";
    } catch (e) {}
    setBitacoraCollapsed(stored === "1");
  })();

  function setBitacoraAsignadosCollapsed(collapsed) {
    var section = document.getElementById("group-bitacora-asignados");
    var toggle = document.getElementById("bitacora-asignados-toggle");
    section.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    try {
      localStorage.setItem(
        "bajio_bitacora_asignados_collapsed",
        collapsed ? "1" : "0",
      );
    } catch (e) {}
  }
  document
    .getElementById("bitacora-asignados-toggle")
    .addEventListener("click", function () {
      setBitacoraAsignadosCollapsed(
        !document
          .getElementById("group-bitacora-asignados")
          .classList.contains("collapsed"),
      );
    });
  (function () {
    var stored = "0";
    try {
      stored =
        localStorage.getItem("bajio_bitacora_asignados_collapsed") || "0";
    } catch (e) {}
    setBitacoraAsignadosCollapsed(stored === "1");
  })();

  function openPendienteModal() {
    document.getElementById("pendiente-cliente").value = "";
    document.getElementById("pendiente-origen").value = "";
    document.getElementById("pendiente-destino").value = "";
    document.getElementById("pendiente-fecha").value = "";
    document.getElementById("pendiente-nota").value = "";
    document.getElementById("pendiente-backdrop").classList.add("show");
  }

  function closePendienteModal() {
    document.getElementById("pendiente-backdrop").classList.remove("show");
  }

  document
    .getElementById("pendiente-add-btn")
    .addEventListener("click", function () {
      ensureLoggedIn(openPendienteModal);
    });
  document
    .getElementById("pendiente-close")
    .addEventListener("click", closePendienteModal);
  document
    .getElementById("pendiente-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "pendiente-backdrop") closePendienteModal();
    });
  document
    .getElementById("pendiente-submit")
    .addEventListener("click", function () {
      var cliente = document.getElementById("pendiente-cliente").value.trim();
      if (!cliente) {
        document.getElementById("pendiente-cliente").focus();
        return;
      }
      if (!myRealIdentity || !myPassword) {
        showToast("Verifica tu identidad antes de registrar.", "error");
        return;
      }
      var origen = document.getElementById("pendiente-origen").value.trim();
      var destino = document.getElementById("pendiente-destino").value.trim();
      var fecha = document.getElementById("pendiente-fecha").value;
      var nota = document.getElementById("pendiente-nota").value.trim();
      var btn = document.getElementById("pendiente-submit");
      btn.disabled = true;
      google.script.run
        .withSuccessHandler(function (res) {
          btn.disabled = false;
          if (res && res.ok) {
            closePendienteModal();
            loadPendientes();
            showToast("Registro guardado: " + cliente, "good");
          } else {
            showToast(
              (res && res.error) || "No se pudo guardar el registro",
              "error",
            );
          }
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          showToast("Error: " + err.message, "error");
        })
        .addPendiente(
          cliente,
          origen,
          destino,
          fecha,
          nota,
          myRealIdentity,
          myPassword,
        );
    });

  // ---- Vincular un "Pendiente de load" con el load real, una vez importado ----
  // Cuando el cliente confirma y el load ya se capturó por Excel, esto combina en uno solo el
  // historial: la nota libre (si tenía) y todos sus comentarios se pasan al load real (ver
  // vincularPendiente en Code.gs), y el registro pendiente se borra.
  var vincularCtx = null; // { pendienteId }
  var vincularOpciones = []; // lista completa de loads candidatos, para filtrar sin volver a pedirle nada al servidor

  /** Vincular requiere una carga en curso. Una entrega con POD pendiente ya no es candidata. */
  function cargaActivaParaVincular_(rec) {
    return (
      !rec.archived &&
      !isDoneStatus(rec.status) &&
      !isCancelledStatus(rec.status) &&
      !isCanceladaFinalizada(rec)
    );
  }

  /** Redibuja las <option> del selector según lo que se haya escrito en el buscador (por load
   * o por cliente). Conserva la selección actual si sigue apareciendo en el resultado filtrado. */
  function renderVincularOpciones(filtro) {
    var sel = document.getElementById("vincular-load-select");
    var previaSeleccion = sel.value;
    filtro = (filtro || "").trim().toLowerCase();
    var filtradas = !filtro
      ? vincularOpciones
      : vincularOpciones.filter(function (r) {
          return (
            String(r.load).toLowerCase().indexOf(filtro) !== -1 ||
            (r.customer || "").toLowerCase().indexOf(filtro) !== -1
          );
        });
    if (!filtradas.length) {
      sel.innerHTML =
        '<option value="">No hay cargas activas que coincidan</option>';
      document.getElementById("vincular-submit").disabled = true;
      return;
    }
    document.getElementById("vincular-submit").disabled = false;
    sel.innerHTML = filtradas
      .map(function (r) {
        return (
          '<option value="' +
          esc(r.load) +
          '">' +
          esc(r.load) +
          " — " +
          esc(shortCustomerName(r.customer)) +
          "</option>"
        );
      })
      .join("");
    if (
      filtradas.some(function (r) {
        return String(r.load) === previaSeleccion;
      })
    )
      sel.value = previaSeleccion;
  }

  function openVincularModal(pendienteId) {
    var p = pendientes.filter(function (x) {
      return String(x.id) === String(pendienteId);
    })[0];
    if (!p) return;
    vincularCtx = { pendienteId: pendienteId };
    document.getElementById("vincular-note").textContent =
      "Busca y elige el load real de " +
      (p.cliente || "este cliente") +
      ". Solo se muestran cargas activas. Su nota y sus comentarios se van a combinar con el historial de esa carga, y esta solicitud se va a eliminar.";
    var clienteLower = (p.cliente || "").toLowerCase();
    var activas = currentData.filter(cargaActivaParaVincular_);
    var mismoCliente = activas.filter(function (r) {
      return (r.customer || "").toLowerCase() === clienteLower;
    });
    var resto = activas.filter(function (r) {
      return (r.customer || "").toLowerCase() !== clienteLower;
    });
    vincularOpciones = mismoCliente.concat(resto);
    var search = document.getElementById("vincular-load-search");
    search.value = "";
    renderVincularOpciones("");
    document.getElementById("vincular-error").style.display = "none";
    document.getElementById("vincular-backdrop").classList.add("show");
    search.focus();
  }

  function closeVincularModal() {
    document.getElementById("vincular-backdrop").classList.remove("show");
    vincularCtx = null;
  }

  document
    .getElementById("vincular-load-search")
    .addEventListener("input", function (e) {
      renderVincularOpciones(e.target.value);
    });
  document
    .getElementById("vincular-close")
    .addEventListener("click", closeVincularModal);
  document
    .getElementById("vincular-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "vincular-backdrop") closeVincularModal();
    });
  document
    .getElementById("vincular-submit")
    .addEventListener("click", function () {
      if (!vincularCtx) return;
      var sel = document.getElementById("vincular-load-select");
      var load = sel.value;
      if (!load) {
        document.getElementById("vincular-error").style.display = "";
        return;
      }
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          document.getElementById("vincular-submit").click();
        });
        return;
      }
      // Confirmación final: esto combina comentarios y borra el registro pendiente, así que no
      // hay que dejarlo pasar sin que la persona confirme a propósito qué load está eligiendo.
      var opcionTexto = sel.options[sel.selectedIndex]
        ? sel.options[sel.selectedIndex].textContent
        : load;
      confirmarModal_(
        "¿Combinar con el Carga " + opcionTexto + "?",
        "Se van a pasar su nota y todos sus comentarios al historial de ese load, y este registro pendiente se va a eliminar. <b>No se puede deshacer.</b>",
        "Sí, combinar",
        function () {
          vincularPendienteConfirmado_(load);
        },
      );
    });

  function vincularPendienteConfirmado_(load) {
    var ctx = vincularCtx;
    // Un refresco puede haber actualizado el estatus mientras la confirmación estaba abierta.
    var rec = recPorLoad_(load);
    if (!ctx || !rec || !cargaActivaParaVincular_(rec)) {
      document.getElementById("vincular-error").style.display = "";
      return;
    }
    var btn = document.getElementById("vincular-submit");
    btn.disabled = true;
    google.script.run
      .withSuccessHandler(function (res) {
        btn.disabled = false;
        if (res && res.ok) {
          closeVincularModal();
          loadPendientes();
          loadUltimosComentarios();
          showToast(
            "Vinculado a Carga " + load + " — comentarios combinados",
            "good",
          );
        } else {
          showToast((res && res.error) || "No se pudo vincular", "error");
        }
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        showToast("Error: " + err.message, "error");
      })
      .vincularPendiente(ctx.pendienteId, load, myRealIdentity, myPassword);
  }

  // ---- Colapsar/expandir la sección "Pendientes de load" ----
  function setPendientesCollapsed(collapsed) {
    var section = document.getElementById("group-pendientes");
    var toggle = document.getElementById("pendientes-toggle");
    section.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    try {
      localStorage.setItem("bajio_pendientes_collapsed", collapsed ? "1" : "0");
    } catch (e) {}
  }
  document
    .getElementById("pendientes-toggle")
    .addEventListener("click", function () {
      setPendientesCollapsed(
        !document
          .getElementById("group-pendientes")
          .classList.contains("collapsed"),
      );
    });
  (function () {
    var stored = "0";
    try {
      stored = localStorage.getItem("bajio_pendientes_collapsed") || "0";
    } catch (e) {}
    setPendientesCollapsed(stored === "1");
  })();

  function shortCustomerName(name) {
    name = String(name || "").trim();
    if (!name) return "—";
    var first = name.split(/\s+/)[0].replace(/[.,]+$/, "");
    return first || name;
  }

  function loadUltimosComentarios() {
    google.script.run
      .withSuccessHandler(aplicarComentarios_)
      .getUltimosComentarios(myRealIdentity, myPassword);
  }
  function aplicarComentarios_(json) {
    // Mismo mapa para loads y para pendientes: los comentarios de un pendiente se guardan en
    // la misma hoja "Comentarios", solo que bajo su id en vez de un número de load, así que
    // getUltimosComentarios() ya regresa ambos juntos sin nada especial.
    ultimosComentarios = JSON.parse(json);
    // "Necesita atención" ahora depende también de si hay comentarios recientes, así que hay
    // que reconstruir la vista actual completa (no solo la tabla) para que el resaltado se
    // actualice en tarjetas también, no solo en la tabla.
    viewDirty.cards = true;
    viewDirty.table = true;
    if (currentView === "table") {
      buildTableView();
    } else {
      buildCardsView();
    }
    wireCardEvents();
    applyFilters();
    renderPendientes();
  }

  function sortValue(rec, col) {
    switch (col) {
      case "load":
        return Number(rec.load) || 0;
      case "customer":
        return (rec.customer || "").toLowerCase();
      case "trailer":
        return (rec.trailer || "").toLowerCase();
      case "status":
        return (rec.status || "").toLowerCase();
      case "origin_city":
        return (rec.origin_city || "").toLowerCase();
      case "dest_city":
        return (rec.dest_city || "").toLowerCase();
      case "pickup_appt":
        return rec.pickup_appt ? new Date(rec.pickup_appt).getTime() : 0;
      case "delivery_appt":
        return rec.delivery_appt ? new Date(rec.delivery_appt).getTime() : 0;
      default:
        return "";
    }
  }
