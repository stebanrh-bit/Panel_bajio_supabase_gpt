var tablaOrdenMostrado_ = [];
  function usuarioOrdenCargas_() {
    return (
      (window.panelApi.profile && window.panelApi.profile.id) ||
      myRealIdentity ||
      ""
    );
  }
  function almacenOrdenCargas_() {
    try {
      return localStorage;
    } catch (e) {
      return null;
    }
  }
  function leerOrdenCargas_() {
    return window.panelLoadOrder.readOrder(
      almacenOrdenCargas_(),
      usuarioOrdenCargas_(),
    );
  }
  function anunciarOrdenCargas_(message) {
    document.getElementById("table-order-status").textContent = message;
  }
  function moverCargaEnTabla_(source, target, after) {
    var visible = Array.from(document.querySelectorAll("#table-body tr.t-row"))
      .filter(function (row) {
        return row.style.display !== "none";
      })
      .map(function (row) {
        return row.getAttribute("data-load");
      });
    var moved = window.panelLoadOrder.moveVisible(
      tablaOrdenMostrado_,
      visible,
      source,
      target,
      after,
    );
    if (
      moved.every(function (id, index) {
        return id === tablaOrdenMostrado_[index];
      })
    )
      return;
    var saved = window.panelLoadOrder.saveOrder(
      almacenOrdenCargas_(),
      usuarioOrdenCargas_(),
      moved.concat(leerOrdenCargas_()),
    );
    tableSort.col = null;
    tableSort.dir = 1;
    buildTableView();
    applyFilters();
    var row = Array.from(
      document.querySelectorAll("#table-body tr.t-row"),
    ).find(function (node) {
      return node.getAttribute("data-load") === source;
    });
    var handle = row && row.querySelector("[data-load-order]");
    if (handle) handle.focus({ preventScroll: true });
    anunciarOrdenCargas_(
      "Carga " +
        source +
        ", posición " +
        (handle ? handle.dataset.position : "") +
        (saved
          ? ". Orden guardado en este navegador."
          : ". Orden aplicado durante esta sesión."),
    );
  }
  function tableRowHtml(rec) {
    var lc = ultimosComentarios[String(rec.load)];
    var commentCell = lc
      ? '<div class="t-comment-text" title="' +
        esc(lc.text) +
        '">' +
        escHtml(lc.text) +
        '</div><div class="t-comment-ts">' +
        fmtDateTime(lc.ts) +
        (lc.usuario ? " · " + escHtml(lc.usuario) : "") +
        "</div>"
      : '<span class="t-comment-empty">Sin comentarios</span>';
    return (
      '<tr role="row" class="t-row' +
      (rec.color ? " t-color-" + esc(rec.color) : "") +
      (String(rec.load) === String(selectedTableLoad) ? " selected" : "") +
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
      '" data-plant="' +
      esEstatusPlanta_(rec.status) +
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
      '<td role="cell" data-label="N.º" class="t-position"><button type="button" class="load-order-handle" data-load-order="' +
      esc(rec.load) +
      '" aria-describedby="table-order-help"><span class="load-order-grip" aria-hidden="true">⠿</span><span class="load-position-number"></span></button></td>' +
      '<td role="cell" data-label="Load" class="t-load">' +
      (needsAttention(rec) ||
      podPending(rec) ||
      recargosPending(rec) ||
      isRecordatorioVencido(rec)
        ? '<span class="sheet-attention-dot" role="img" aria-label="Requiere atención" title="' +
          esc(
            needsAttentionReasons(rec)
              .concat(
                podPending(rec) ? ["Falta enviar POD"] : [],
                recargosPending(rec) ? ["Faltan recargos VG"] : [],
                isRecordatorioVencido(rec) ? ["Recordatorio vencido"] : [],
              )
              .join(" · "),
          ) +
          '"></span>'
        : "") +
      '<button type="button" class="sheet-load-link" data-table-select="' +
      esc(rec.load) +
      '" aria-label="Abrir carga ' +
      esc(rec.load) +
      '">' +
      esc(rec.load) +
      "</button></td>" +
      '<td role="cell" data-label="Cliente" class="t-customer" title="' +
      esc(rec.customer) +
      '">' +
      esc(rec.customer || "—") +
      "</td>" +
      '<td role="cell" data-label="Origen" class="t-city t-origin" title="' +
      esc([rec.origin_city, rec.origin_state].filter(Boolean).join(", ")) +
      '">' +
      esc(
        [rec.origin_city, rec.origin_state].filter(Boolean).join(", ") || "—",
      ) +
      "</td>" +
      '<td role="cell" data-label="Destino" class="t-city t-destination" title="' +
      esc([rec.dest_city, rec.dest_state].filter(Boolean).join(", ")) +
      '">' +
      esc([rec.dest_city, rec.dest_state].filter(Boolean).join(", ") || "—") +
      "</td>" +
      '<td role="cell" data-label="Pickup" class="t-date t-date-pickup">' +
      fmtDate(rec.pickup_appt) +
      "</td>" +
      '<td role="cell" data-label="Entrega" class="t-date t-date-delivery">' +
      fmtDate(rec.delivery_appt) +
      "</td>" +
      '<td role="cell" data-label="Truck" class="t-truck t-truck-number" title="' +
      esc(rec.truck) +
      '">' +
      esc(rec.truck || "—") +
      "</td>" +
      '<td role="cell" data-label="Trailer" class="t-truck t-trailer"><span class="trailer-full-value" data-trailer-value>' +
      esc(rec.trailer || "Sin asignar") +
      "</span></td>" +
      '<td role="cell" data-label="Estatus" class="t-status"><select class="status-select t-status-select" aria-label="Estatus de la carga ' +
      esc(rec.load) +
      '" data-status-load="' +
      esc(rec.load) +
      '" style="' +
      statusStyle(rec.status) +
      '">' +
      statusOptionsHtml(rec.status) +
      "</select></td>" +
      '<td role="cell" data-label="Comentarios" class="t-comment"><button type="button" class="sheet-comment-link" data-comments-load="' +
      esc(rec.load) +
      '" aria-label="Ver comentarios de la carga ' +
      esc(rec.load) +
      '">' +
      commentCell +
      "</button></td>" +
      "</tr>"
    );
  }

  /** Campos y acciones del detalle rápido. Se muestran en un solo diálogo al abrir una
   * carga; la hoja conserva su ancho y evita repetir controles dentro de cada fila. */
  function detailPanelHtml(rec) {
    return (
      alertBannerHtml(rec) +
      '<div class="field"><div class="k">Cliente</div><div class="v small">' +
      esc(rec.customer) +
      "</div></div>" +
      '<div class="field"><div class="k">Ruta</div><div class="v small">' +
      esc(rec.origin_city) +
      ", " +
      esc(rec.origin_state) +
      ' <span class="arrow">&rarr;</span> ' +
      esc(rec.dest_city) +
      ", " +
      esc(rec.dest_state) +
      "</div></div>" +
      '<div class="field f-truck"><div class="k">Truck</div><input class="v field-input" type="text" placeholder="—" value="' +
      esc(rec.truck) +
      '" data-truck-load="' +
      esc(rec.load) +
      '"></div>' +
      '<div class="field"><div class="k">Trailer</div><input class="v field-input t-trailer-input" type="text" placeholder="—" value="' +
      esc(rec.trailer) +
      '" data-trailer-load="' +
      esc(rec.load) +
      '" aria-label="Editar trailer"></div>' +
      '<div class="field"><div class="k">Cita de recolección</div><input class="v field-input" type="datetime-local" value="' +
      apptDatetimeLocalValue(rec.pickup_appt) +
      '" data-pickup-appt-load="' +
      esc(rec.load) +
      '"></div>' +
      '<div class="field"><div class="k">Entrega cita</div><input class="v field-input" type="datetime-local" value="' +
      apptDatetimeLocalValue(rec.delivery_appt) +
      '" data-delivery-appt-load="' +
      esc(rec.load) +
      '"></div>' +
      '<div class="field"><div class="k">Salida planta</div><input class="v field-input" type="datetime-local" value="' +
      apptDatetimeLocalValue(rec.salida_mexico_fecha) +
      '" data-salida-mexico-load="' +
      esc(rec.load) +
      '"></div>' +
      '<div class="field"><div class="k">Cruce</div><input class="v field-input" type="datetime-local" value="' +
      apptDatetimeLocalValue(rec.cruce_usa_fecha) +
      '" data-cruce-usa-load="' +
      esc(rec.load) +
      '"></div>' +
      '<div class="field"><div class="k">Documentación</div><div class="docs">' +
      docDots(rec) +
      "</div></div>" +
      '<div class="pod-row">' +
      '<label class="pod-check">' +
      '<input type="checkbox" data-pod-load="' +
      esc(rec.load) +
      '"' +
      (rec.pod_sent ? " checked" : "") +
      ">" +
      "<span>POD enviado a cliente</span>" +
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
      (tieneRecordatorio(rec.status) ? recordatorioTagHtml(rec) : "") +
      notesHtml(rec) +
      updatedLineHtml(rec) +
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
      '<button type="button" class="incidencias-btn" data-create-task-load="' +
      esc(rec.load) +
      '">Crear tarea</button>' +
      colorSwatchesHtml(rec) +
      "</div>"
    );
  }

  /** Refleja la edición del detalle en su fila, sin reconstruir el campo que tiene el foco. */
  function actualizarUnidadEnTabla_(load, field, value) {
    document.querySelectorAll("#table-body tr.t-row").forEach(function (row) {
      if (row.getAttribute("data-load") !== String(load)) return;
      row.setAttribute("data-" + field, String(value || "").toLowerCase());
      var record = recPorLoad_(load);
      if (record)
        row.setAttribute("data-extra", textoBusqueda_(record).toLowerCase());
      var cell = row.querySelector(
        field === "trailer" ? "[data-trailer-value]" : ".t-truck-number",
      );
      if (cell) {
        cell.textContent = value || (field === "trailer" ? "Sin asignar" : "—");
        cell.title = value || "";
      }
    });
    viewDirty.cards = true;
  }

  /** Actualiza solo el encabezado: editar el trailer no debe reconstruir otros campos abiertos. */
  function actualizarTituloDetalleTabla_(rec) {
    if (String(selectedTableLoad) !== String(rec.load)) return;
    document.getElementById("table-detail-load-label").textContent =
      "Carga " +
      rec.load +
      (rec.trailer ? " — " + rec.trailer : "") +
      " — " +
      rec.customer;
  }

  /** Sincroniza el detalle con la carga seleccionada. Una actualización de fondo conserva
   * el diálogo; si el contenido no cambió, también conserva sus campos y su foco. */
  function renderTableDetailPanel() {
    var panel = document.getElementById("table-detail-panel");
    if (!panel) return;
    var rec = selectedTableLoad ? recPorLoad_(selectedTableLoad) : null;
    var dialog = document.getElementById("table-detail-dialog");
    if (!rec) {
      selectedTableLoad = null;
      panel.hidden = true;
      if (dialog.open) dialog.close();
      document
        .querySelectorAll("#table-body tr.t-row.selected")
        .forEach(function (r) {
          r.classList.remove("selected");
        });
      return;
    }
    actualizarTituloDetalleTabla_(rec);
    var body = document.getElementById("table-detail-body"),
      html = detailPanelHtml(rec);
    if (body.dataset.rendered !== html) {
      body.innerHTML = html;
      body.dataset.rendered = html;
    }
    panel.hidden = false;
    if (!dialog.open) dialog.showModal();
    document.querySelectorAll("#table-body tr.t-row").forEach(function (r) {
      r.classList.toggle(
        "selected",
        r.getAttribute("data-load") === String(selectedTableLoad),
      );
    });
  }

  function renderTable(data) {
    data = data || [];
    var sorted = window.panelLoadOrder.orderedRecords(data, leerOrdenCargas_());
    if (tableSort.col) {
      sorted.sort(function (a, b) {
        var va = sortValue(a, tableSort.col),
          vb = sortValue(b, tableSort.col);
        if (va < vb) return -1 * tableSort.dir;
        if (va > vb) return 1 * tableSort.dir;
        return 0;
      });
    }
    tablaOrdenMostrado_ = sorted.map(function (record) {
      return String(record.load);
    });
    document
      .getElementById("table-manual-order")
      .setAttribute("aria-pressed", String(!tableSort.col));
    diffRenderContainer("table-body", sorted, loadKeyFn, tableRowHtml, {
      nodesPerItem: 1,
      wrapperTag: "tbody",
    });
    document.getElementById("table-empty").style.display = sorted.length
      ? "none"
      : "";
    document
      .querySelectorAll(".loads-table th[data-sort]")
      .forEach(function (th) {
        var col = th.getAttribute("data-sort");
        th.classList.toggle("sorted", tableSort.col === col);
        th.setAttribute(
          "data-arrow",
          tableSort.col === col && tableSort.dir === -1 ? "▲" : "▼",
        );
      });
    renderTableDetailPanel();
  }

  document
    .querySelectorAll(".loads-table th[data-sort]")
    .forEach(function (th) {
      th.addEventListener("click", function () {
        var col = th.getAttribute("data-sort");
        if (tableSort.col === col) {
          tableSort.dir *= -1;
        } else {
          tableSort.col = col;
          tableSort.dir = 1;
        }
        buildTableView();
        wireCardEvents();
        applyFilters();
      });
    });

  window.panelLoadOrder.mountRowReordering(
    document.getElementById("table-body"),
    {
      onMove: moverCargaEnTabla_,
      announce: anunciarOrdenCargas_,
    },
  );
  document
    .getElementById("table-manual-order")
    .addEventListener("click", function () {
      tableSort.col = null;
      buildTableView();
      applyFilters();
      anunciarOrdenCargas_("Se muestra tu orden personal de cargas.");
    });

  function applyView() {
    var cardsView = document.getElementById("cards-view");
    var tableView = document.getElementById("table-view");
    var btn = document.getElementById("view-toggle-btn");
    document.getElementById("table-manual-order").hidden =
      currentView !== "table";
    // El espaciado solo corresponde al listado; no cambia la vista elegida.
    document.getElementById("densidad-control").hidden =
      currentView !== "table";
    if (currentView === "table") {
      cardsView.style.display = "none";
      tableView.style.display = "";
      btn.textContent = "Vista tarjetas";
      if (viewDirty.table) {
        buildTableView();
        wireCardEvents();
        applyFilters();
      }
    } else {
      cardsView.style.display = "";
      tableView.style.display = "none";
      btn.textContent = "Vista tabla";
      if (viewDirty.cards) {
        buildCardsView();
        wireCardEvents();
        applyFilters();
      }
    }
  }

  document
    .getElementById("view-toggle-btn")
    .addEventListener("click", function () {
      currentView = currentView === "table" ? "cards" : "table";
      try {
        localStorage.setItem("bajio_view", currentView);
      } catch (e) {}
      applyView();
    });

  applyView();

  function clientesDeCsr(csr) {
    return asignaciones
      .filter(function (a) {
        return a.csr === csr;
      })
      .map(function (a) {
        return a.cliente.toLowerCase();
      });
  }

  function loadSeguidoPorCsr(loadNum, csr) {
    if (!csr) return false;
    var key = String(loadNum || "").trim();
    return loadSeguimientos.some(function (s) {
      return String(s.load).trim() === key && s.csr === csr;
    });
  }

  function loadsSeguidosScope() {
    if (!currentWho) return [];
    var persona = personas.filter(function (p) {
      return p.nombre === currentWho;
    })[0];
    if (
      persona &&
      ((persona.rol === "CSR" &&
        (currentWho !== myRealIdentity || ownClientsOnly_)) ||
        (persona.rol === "Supervisor" &&
          (currentOperationalScope || ownClientsOnly_)))
    ) {
      return loadSeguimientos
        .filter(function (s) {
          return s.csr === persona.nombre;
        })
        .map(function (s) {
          return String(s.load).trim();
        });
    }
    if (persona && persona.rol === "Seguimiento" && currentFollowCsrs.length) {
      return loadSeguimientos
        .filter(function (s) {
          return currentFollowCsrs.indexOf(s.csr) !== -1;
        })
        .map(function (s) {
          return String(s.load).trim();
        });
    }
    return [];
  }

  function csrDeLoad(rec) {
    if (!rec) return "";
    var cust = String(rec.customer || "")
      .trim()
      .toLowerCase();
    if (!cust) return "";
    var a = asignaciones.filter(function (x) {
      return (
        String(x.cliente || "")
          .trim()
          .toLowerCase() === cust
      );
    })[0];
    return a ? a.csr : "";
  }

  function workspaceFollowHtml(r) {
    if (!r || !myRealIdentity) return "";
    var dueño = csrDeLoad(r);
    if (dueño === myRealIdentity) return "";
    var siguiendo = loadSeguidoPorCsr(r.load, myRealIdentity);
    return (
      '<button type="button" class="ws-btn' +
      (siguiendo ? " primary" : "") +
      '" data-toggle-seguir-load="' +
      esc(r.load) +
      '">' +
      (siguiendo ? "★ Siguiendo este load" : "☆ Seguir este load") +
      "</button>"
    );
  }

  /** Lista de clientes (en minúsculas) a los que currentWho tiene acceso, o null si no hay filtro (nadie seleccionado, o General viendo "Todos"). */
  var ownClientsOnly_ = false;
  document
    .getElementById("own-clients-toggle")
    .addEventListener("click", function () {
      ownClientsOnly_ = !ownClientsOnly_;
      if (myRealIdentity) {
        currentWho = myRealIdentity;
        currentOperationalScope = false;
        updateWhoToggleLabel();
      }
      this.setAttribute("aria-pressed", String(ownClientsOnly_));
      applyFilters();
    });
  function currentCsrClienteFiltro() {
    if (!currentWho) return null;
    var persona = personas.filter(function (p) {
      return p.nombre === currentWho;
    })[0];
    if (
      persona &&
      ((persona.rol === "CSR" &&
        (currentWho !== myRealIdentity || ownClientsOnly_)) ||
        (persona.rol === "Supervisor" &&
          (currentOperationalScope || ownClientsOnly_)))
    ) {
      return clientesDeCsr(persona.nombre);
    }
    if (persona && persona.rol === "Seguimiento" && currentFollowCsrs.length) {
      return currentFollowCsrs.reduce(function (acc, csr) {
        return acc.concat(clientesDeCsr(csr));
      }, []);
    }
    return null;
  }

  /** Llena el selector de "filtrar por cliente" con el nombre completo de cada cliente visible
   * en el alcance actual (si hay un CSR/usuario seleccionado, solo sus clientes asignados; si es
   * "Todos", cualquier cliente que aparezca en las cargas cargadas). Conserva la selección actual
   * si sigue siendo válida; si ya no aplica (cambiaste de CSR), regresa a "Todos los clientes". */
  function renderClienteFilterOptions() {
    var sel = document.getElementById("cliente-filter");
    if (!sel) return;
    var csrClienteFiltro = currentCsrClienteFiltro();
    var loadsSeguidos = loadsSeguidosScope();
    var seen = Object.create(null);
    var nombres = [];
    currentData.forEach(function (r) {
      var cust = String(r.customer || "").trim();
      if (!cust) return;
      var custLc = cust.toLowerCase();
      var esSeguido = loadsSeguidos.indexOf(String(r.load || "").trim()) !== -1;
      if (
        csrClienteFiltro &&
        csrClienteFiltro.indexOf(custLc) === -1 &&
        !esSeguido
      )
        return;
      if (!seen[custLc]) {
        seen[custLc] = true;
        nombres.push(cust);
      }
    });
    nombres.sort(function (a, b) {
      return a.localeCompare(b, "es");
    });

    if (currentClienteFiltro && seen[currentClienteFiltro] === undefined) {
      currentClienteFiltro = "";
    }

    sel.innerHTML =
      '<option value="">Todos los clientes</option>' +
      nombres
        .map(function (n) {
          var v = n.toLowerCase();
          return (
            '<option value="' +
            esc(v) +
            '"' +
            (v === currentClienteFiltro ? " selected" : "") +
            ">" +
            esc(n) +
            "</option>"
          );
        })
        .join("");
  }

  document
    .getElementById("cliente-filter")
    .addEventListener("change", function () {
      currentClienteFiltro = this.value;
      applyFilters();
    });

  /** Actualiza los contadores "En curso"/"Entregadas" respetando el filtro de CSR/usuario actual.
   * Se calcula directo sobre currentData (no sobre el DOM) para que sea correcto aunque la vista
   * de tarjetas o de tabla todavía no se haya vuelto a dibujar. */
  function updateCounts(csrClienteFiltro) {
    var loadsSeguidos = loadsSeguidosScope();
    var matches = function (rec) {
      return (
        !csrClienteFiltro ||
        csrClienteFiltro.indexOf((rec.customer || "").toLowerCase()) !== -1 ||
        loadsSeguidos.indexOf(String(rec.load || "").trim()) !== -1
      );
    };
    var activeCount = currentData.filter(function (r) {
      return !isArchived(r) && !isCanceladaFinalizada(r) && matches(r);
    }).length;
    var doneCount = currentData.filter(function (r) {
      return isArchived(r) && matches(r);
    }).length;
    var canceladaCount = currentData.filter(function (r) {
      return isCanceladaFinalizada(r) && matches(r);
    }).length;
    document.getElementById("count-active").textContent = activeCount;
    document.getElementById("count-done").textContent = doneCount;
    document.getElementById("count-cancelada").textContent = canceladaCount;
  }

  /** Actualiza las tarjetas de resumen (Cargas totales / En curso / Necesitan atención /
   * Docs completos / Recordatorios vencidos) respetando el filtro de CSR/usuario activo: un CSR
   * ve solo lo suyo, y un usuario de Seguimiento ve solo lo de los CSR que tiene marcados (o
   * todo si no marcó ninguno). */
  function updateStats(csrClienteFiltro) {
    var loadsSeguidos = loadsSeguidosScope();
    var scoped = csrClienteFiltro
      ? currentData.filter(function (r) {
          return (
            csrClienteFiltro.indexOf(String(r.customer || "").toLowerCase()) !==
              -1 || loadsSeguidos.indexOf(String(r.load || "").trim()) !== -1
          );
        })
      : currentData;
    var active = scoped.filter(function (r) {
      return !isArchived(r) && !isCanceladaFinalizada(r);
    });
    var attentionCount = active.filter(needsAttention).length;
    // "Docs completos" solo cuenta cargas en curso (activas) — una vez entregada o
    // cancelada/finalizada ya no importa si le faltaba algún documento, así que no tiene caso
    // seguir contándola aquí.
    var docsReadyCount = active.filter(function (r) {
      return r.bol && r.doda && r.entry && r.sobre_listo;
    }).length;
    var recordatorioVencidoCount = scoped.filter(isRecordatorioVencido).length;
    var stats = [
      ["n", scoped.length, "Cargas totales", ICON_TRUCK],
      ["n accent", active.length, "En curso", ICON_CLOCK],
      ["n warn", attentionCount, "Necesitan atención", ICON_ALERT, "attention"],
      ["n", docsReadyCount + "/" + active.length, "Docs completos", ICON_DOCS],
      [
        "n critical",
        recordatorioVencidoCount,
        "Recordatorios vencidos",
        ICON_ALERT,
      ],
    ];
    document.getElementById("stats").innerHTML = stats
      .map(function (s) {
        var kind = s[4];
        var hint = kind
          ? '<span class="stat-hint">Ver detalle <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3l5 5-5 5"/></svg></span>'
          : "";
        return (
          '<div class="stat' +
          (kind ? " stat-clickable" : "") +
          '"' +
          (kind ? ' data-kpi-detail="' + kind + '"' : "") +
          '><span class="stat-icon">' +
          s[3] +
          '</span><span class="' +
          esc(s[0]) +
          '">' +
          esc(s[1]) +
          '</span><span class="l">' +
          esc(s[2]) +
          "</span>" +
          hint +
          "</div>"
        );
      })
      .join("");
  }

  /** "Activa" (para el chip "Activas") = el pickup ya llegó (hoy o antes) Y el viaje todavía
   * no termina (no es Delivered/Completed + POD confirmado). Si el pickup todavía es una
   * fecha futura, o si el viaje ya se completó y tiene su POD, no cuenta como activa. */
  function pickupIsFuture(dateStr) {
    if (!dateStr) return false;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var pickupDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return pickupDay > today;
  }

  function cruceWithinDays(dateStr, daysAhead) {
    if (!dateStr) return false;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var limit = new Date(today);
    limit.setDate(limit.getDate() + daysAhead);
    var cruceDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return cruceDay >= today && cruceDay <= limit;
  }

  function applyFilters() {
    renderActionCenter(currentData);
    renderHomeCommand(currentData);
    renderSinCsr_();
    var csrClienteFiltro = currentCsrClienteFiltro();
    var loadsSeguidos = loadsSeguidosScope();
    renderClienteFilterOptions();
    document.getElementById("operation-state-filter").value = currentFilter;
    var pills = document.getElementById("active-filter-pills");
    if (pills) {
      pills.innerHTML = "";
      [
        currentFilter !== "all"
          ? "Estado: " +
            document.getElementById("operation-state-filter").selectedOptions[0]
              .textContent
          : "",
        currentClienteFiltro ? "Cliente: " + currentClienteFiltro : "",
        currentSearch ? "Búsqueda: " + currentSearch : "",
        ownClientsOnly_ ? "Mis clientes" : "",
      ]
        .filter(Boolean)
        .forEach(function (label) {
          var chip = document.createElement("span");
          chip.className = "organize-chip";
          chip.textContent = label;
          pills.append(chip);
        });
      if (pills.children.length) {
        var clear = document.createElement("button");
        clear.type = "button";
        clear.textContent = "Limpiar filtros";
        clear.onclick = function () {
          currentFilter = "all";
          currentClienteFiltro = "";
          currentSearch = "";
          ownClientsOnly_ = false;
          document.getElementById("search").value = "";
          document.getElementById("cliente-filter").value = "";
          document
            .getElementById("own-clients-toggle")
            .setAttribute("aria-pressed", "false");
          applyFilters();
        };
        pills.append(clear);
      }
    }
    // :not([data-pendiente-id]):not([data-bitacora-id]) excluye las tarjetas de "Pendientes de
    // load" y de "Bitácora de turno": tienen clase .card (para heredar el mismo estilo visual)
    // pero no son loads — no tienen data-status, data-customer, etc., así que si no se excluyen
    // aquí, el filtro de CSR/cliente las trataba como si no coincidieran con ningún cliente y
    // las escondía (aparecían al agregarlas y desaparecían en cuanto corría cualquier
    // applyFilters() posterior — el mismo bug ya visto con "Pendientes de load").
    document
      .querySelectorAll(
        ".card:not([data-pendiente-id]):not([data-bitacora-id]), #table-body tr.t-row",
      )
      .forEach(function (card) {
        var status = card.getAttribute("data-status");
        var isDone =
          isDoneStatus(status) && card.getAttribute("data-pod") === "true";
        var isCancelada =
          statusNorm(status) === "tonu" &&
          card.getAttribute("data-recargos") === "true";
        var isAttention = card.getAttribute("data-attention") === "true";
        var isFuturePickup = pickupIsFuture(card.getAttribute("data-pickup"));
        var matchesFilter =
          currentFilter === "all" ||
          (currentFilter === "active" &&
            !isFuturePickup &&
            !isDone &&
            !isCancelada) ||
          (currentFilter === "done" && isDone) ||
          (currentFilter === "cancelada" && isCancelada) ||
          (currentFilter === "attention" && isAttention) ||
          (currentFilter === "cruce-hoy" &&
            cruceWithinDays(card.getAttribute("data-cruce"), 0)) ||
          (currentFilter === "cruce-semana" &&
            cruceWithinDays(card.getAttribute("data-cruce"), 6));
        var cardCustomer = card.getAttribute("data-customer");
        var haystack =
          card.getAttribute("data-load") +
          " " +
          cardCustomer +
          " " +
          card.getAttribute("data-city") +
          " " +
          (card.getAttribute("data-truck") || "") +
          " " +
          (card.getAttribute("data-trailer") || "") +
          " " +
          (card.getAttribute("data-extra") || "");
        var matchesSearch =
          !currentSearch || haystack.indexOf(currentSearch) !== -1;
        var matchesCsr =
          !csrClienteFiltro ||
          csrClienteFiltro.indexOf(cardCustomer) !== -1 ||
          loadsSeguidos.indexOf(
            String(card.getAttribute("data-load")).trim(),
          ) !== -1;
        var matchesCliente =
          !currentClienteFiltro || cardCustomer === currentClienteFiltro;
        // El load forzado (ver abrirLoadDesdeBitacora) siempre se muestra, sin importar de quién
        // sea el cliente ni si coincide con la búsqueda/pestaña activa — es una carga puntual a la
        // que alguien te mandó a propósito desde un pendiente de turno.
        var isForced =
          forcedVisibleLoad &&
          String(card.getAttribute("data-load")) === forcedVisibleLoad;
        var visible =
          isForced ||
          (matchesFilter && matchesSearch && matchesCsr && matchesCliente);
        card.style.display = visible ? "" : "none";
        // Si el load que estaba seleccionado en el panel de detalle (ver renderTableDetailPanel)
        // queda escondido por el filtro/búsqueda actual, cerramos el panel — ya no tiene sentido
        // mostrar el detalle de una fila que ni siquiera se ve en la lista de arriba.
        if (
          card.classList.contains("t-row") &&
          !visible &&
          String(card.getAttribute("data-load")) === String(selectedTableLoad)
        ) {
          selectedTableLoad = null;
          renderTableDetailPanel();
        }
      });
    var soloActivos =
      currentFilter === "active" ||
      currentFilter === "attention" ||
      currentFilter === "cruce-hoy" ||
      currentFilter === "cruce-semana";
    document.getElementById("group-active").style.display =
      currentFilter === "done" || currentFilter === "cancelada" ? "none" : "";
    document.getElementById("group-done").style.display =
      soloActivos || currentFilter === "cancelada" ? "none" : "";
    document.getElementById("group-cancelada").style.display =
      soloActivos || currentFilter === "done" ? "none" : "";
    aplicarLimiteTabla_();
    marcarFilasMasivo_();
    updateCounts(csrClienteFiltro);
    updateStats(csrClienteFiltro);
  }

  // La tabla de Operación completa muestra de 200 en 200 (botón "Mostrar más"): con muchas
  // cargas, pintar todos los renglones a la vez hacía lenta la pantalla. Al cambiar de filtro,
  // búsqueda o persona se regresa a las primeras 200. La carga abierta en el detalle o a la que
  // te mandaron desde la bitácora siempre se ve.
  var TABLA_PASO_ = 200;
  var tablaLimite_ = TABLA_PASO_;
  var tablaFirmaFiltro_ = "";
  function aplicarLimiteTabla_() {
    var firma = [
      currentFilter,
      currentSearch,
      currentClienteFiltro,
      currentWho,
      currentFollowCsrs.join(","),
    ].join("|");
    // (|| 200: applyFilters puede correr al arrancar, antes de que se asignen estas variables)
    if (firma !== tablaFirmaFiltro_ || !tablaLimite_) {
      tablaFirmaFiltro_ = firma;
      tablaLimite_ = TABLA_PASO_ || 200;
    }
    var visibles = 0,
      ocultas = 0;
    document.querySelectorAll("#table-body tr.t-row").forEach(function (tr) {
      if (tr.style.display === "none") return;
      visibles++;
      var handle = tr.querySelector("[data-load-order]");
      if (handle && handle.dataset.position !== String(visibles)) {
        handle.querySelector(".load-position-number").textContent = visibles;
        handle.dataset.position = visibles;
        handle.setAttribute(
          "aria-label",
          "Mover carga " +
            tr.getAttribute("data-load") +
            ", posición " +
            visibles,
        );
        handle.title =
          "Arrastra para mover. Con el teclado: ↑ subir, ↓ bajar, Inicio o Fin.";
      }
      var load = String(tr.getAttribute("data-load"));
      if (
        visibles > tablaLimite_ &&
        load !== String(selectedTableLoad) &&
        load !== String(forcedVisibleLoad)
      ) {
        tr.style.display = "none";
        ocultas++;
      }
    });
    var total = document.getElementById("operation-visible-count");
    if (total)
      total.textContent = visibles + (visibles === 1 ? " carga" : " cargas");
    var btn = document.getElementById("tabla-mas");
    btn.hidden = !ocultas;
    if (ocultas)
      btn.textContent =
        "Mostrar " +
        Math.min(TABLA_PASO_ || 200, ocultas) +
        " más · faltan " +
        ocultas +
        " de " +
        visibles;
  }
  document.getElementById("tabla-mas").addEventListener("click", function () {
    tablaLimite_ += TABLA_PASO_ || 200;
    applyFilters();
  });

  /** Prende un destello breve en una tarjeta/fila para que sea obvio cuál es la que se acaba de
   * abrir (usado por abrirLoadDesdeBitacora). */
  function flashHighlight(el) {
    if (!el) return;
    el.classList.remove("flash-highlight");
    // Forzar reflow para poder reiniciar la animación aunque ya se haya usado en este elemento.
    void el.offsetWidth;
    el.classList.add("flash-highlight");
    setTimeout(function () {
      el.classList.remove("flash-highlight");
    }, 2200);
  }

  /** Al hacer clic en el "Carga XXXX" de una tarjeta de la Bitácora de turno, te lleva directo a
   * esa carga en el listado (tabla o tarjetas, según la vista activa) para poder editarla o
   * comentarla — aunque el load sea de un cliente/CSR fuera de tu filtro normal, no coincida con
   * tu búsqueda, o esté en una pestaña distinta a la activa (ver forcedVisibleLoad). No toca tu
   * selección de "¿quién eres?". */
  function abrirLoadDesdeBitacora(loadNum) {
    var histPage = document.getElementById("page-historico");
    if (histPage && !histPage.hidden) showMainPage("operation");
    var rec = recPorLoad_(loadNum);
    if (!rec) {
      showToast(
        "No se encontró el load " +
          loadNum +
          " (puede que ya no esté en el sistema).",
        "error",
      );
      return;
    }
    forcedVisibleLoad = String(loadNum);
    currentSearch = "";
    var searchInput = document.getElementById("search");
    if (searchInput) searchInput.value = "";
    currentClienteFiltro = "";
    currentFilter = "all";
    applyFilters();

    if (currentView === "table") {
      selectedTableLoad = loadNum;
      renderTableDetailPanel();
      var row = null;
      document.querySelectorAll("#table-body tr.t-row").forEach(function (r) {
        if (String(r.getAttribute("data-load")) === String(loadNum)) row = r;
      });
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        flashHighlight(row);
      }
      var panel = document.getElementById("table-detail-panel");
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      var card = null;
      document.querySelectorAll(".card[data-load]").forEach(function (c) {
        if (String(c.getAttribute("data-load")) === String(loadNum)) card = c;
      });
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        flashHighlight(card);
      }
    }
  }

  var whoDrawerOpenSeg = null;

  function whoToggleLabel() {
    if (!currentWho) return "Usuario";
    var persona = personas.filter(function (p) {
      return p.nombre === currentWho;
    })[0];
    if (persona && persona.rol === "Seguimiento") {
      if (!currentFollowCsrs.length) return currentWho + " → Todos";
      if (currentFollowCsrs.length <= 2)
        return currentWho + " → " + currentFollowCsrs.join(", ");
      return currentWho + " → " + currentFollowCsrs.length + " CSR";
    }
    return (
      currentWho +
      (currentOperationalScope && persona?.rol === "Supervisor" ? " · CSR" : "")
    );
  }

  function updateWhoToggleLabel() {
    document.getElementById("who-toggle-label").textContent = whoToggleLabel();
    updatePanelOwnerCaption();
    schedulePanelAutoReturn();
  }

  /** Refleja en la leyenda de abajo de "Panel de control" a quién se tiene seleccionado en
   * "¿quién eres?" (currentWho) — el panel que se está viendo, no necesariamente quien verificó
   * su identidad con contraseña (myRealIdentity, usado solo para comentarios/pendientes). */
  function updatePanelOwnerCaption() {
    var ownerCaption = document.getElementById("panel-owner-caption");
    var ownerName = document.getElementById("panel-owner-name");
    if (!ownerCaption || !ownerName) return;
    if (currentWho) {
      var selectedPerson = personas.find(function (person) {
        return person.nombre === currentWho;
      });
      ownerName.textContent = ownClientsOnly_
        ? "Mis clientes · " + currentWho
        : selectedPerson?.rol === "Supervisor" && !currentOperationalScope
          ? "Toda la operación"
          : currentWho + (currentOperationalScope ? " · CSR" : "");
      ownerCaption.hidden = false;
    } else {
      ownerName.textContent = "Toda la operación";
      ownerCaption.hidden = !myRealIdentity;
    }
  }

  function selectWho(nombre, followCsr, operationalScope) {
    currentWho = nombre;
    var selected = personas.find(function (p) {
      return p.nombre === nombre;
    });
    currentOperationalScope =
      operationalScope === true && selected?.rol === "Supervisor";
    currentFollowCsrs = followCsr ? [followCsr] : [];
    updateWhoToggleLabel();
    closeWhoDrawer();
    applyFilters();
    refreshOperationalAttention();
  }

  function renderWhoDrawer() {
    var body = document.getElementById("who-drawer-body");
    var csrList = personas.filter(function (p) {
      return esCsrOperativo_(p);
    });
    var segList = personas.filter(function (p) {
      return p.rol === "Seguimiento";
    });

    var html =
      '<button type="button" class="who-row' +
      (!currentWho ? " active" : "") +
      '" data-who-all>Todos (sin filtro)</button>';

    html += '<div><div class="who-group-title">Usuario</div>';
    if (!csrList.length && !segList.length) {
      html += '<div class="comments-empty">Sin personas registradas</div>';
    } else {
      html += csrList
        .map(function (p) {
          return (
            '<button type="button" class="who-row' +
            (currentWho === p.nombre &&
            (p.rol !== "Supervisor" || currentOperationalScope)
              ? " active"
              : "") +
            '" data-who-csr="' +
            esc(p.nombre) +
            '">' +
            esc(p.nombre) +
            (p.rol === "Supervisor" ? " · CSR" : "") +
            "</button>"
          );
        })
        .join("");
      html += segList
        .map(function (p) {
          var isOpen = whoDrawerOpenSeg === p.nombre;
          var isSelected = currentWho === p.nombre;
          var sigueTexto =
            p.sigueA && p.sigueA.length
              ? p.sigueA.join(", ")
              : "Todos (sin filtro)";
          return (
            '<button type="button" class="who-row' +
            (isSelected ? " active" : "") +
            '" data-who-seg-toggle="' +
            esc(p.nombre) +
            '">' +
            esc(p.nombre) +
            "</button>" +
            '<div class="who-sub' +
            (isOpen ? " open" : "") +
            '">' +
            '<div class="who-sub-readonly">Sigue a: <b>' +
            esc(sigueTexto) +
            "</b></div>" +
            "</div>"
          );
        })
        .join("");
    }
    html += "</div>";

    body.innerHTML = html;

    body.querySelectorAll("[data-who-all]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectWho("", "");
      });
    });
    body.querySelectorAll("[data-who-csr]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectWho(btn.getAttribute("data-who-csr"), "", true);
      });
    });
    body.querySelectorAll("[data-who-seg-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nombre = btn.getAttribute("data-who-seg-toggle");
        currentOperationalScope = false;
        if (currentWho !== nombre) {
          currentWho = nombre;
          var persona = personas.filter(function (pp) {
            return pp.nombre === nombre;
          })[0];
          currentFollowCsrs =
            persona && persona.sigueA ? persona.sigueA.slice() : [];
        }
        whoDrawerOpenSeg = whoDrawerOpenSeg === nombre ? null : nombre;
        updateWhoToggleLabel();
        renderWhoDrawer();
        applyFilters();
        refreshOperationalAttention();
      });
    });
  }

  function renderFollowDrawer() {
    var body = document.getElementById("who-drawer-body");
    var csrList = personas.filter(function (p) {
      return esCsrOperativo_(p);
    });
    var html = '<div><div class="who-group-title">A quién sigues</div>';
    html +=
      '<button type="button" class="who-row' +
      (!currentFollowCsrs.length ? " active" : "") +
      '" data-follow-all>Todos</button>';
    if (!csrList.length) {
      html += '<div class="comments-empty">Sin CSR registrados</div>';
    } else {
      html += csrList
        .map(function (c) {
          var isChecked = currentFollowCsrs.indexOf(c.nombre) !== -1;
          return (
            '<button type="button" class="who-row' +
            (isChecked ? " active" : "") +
            '" data-follow-csr="' +
            esc(c.nombre) +
            '">' +
            (isChecked ? "✓ " : "") +
            esc(c.nombre) +
            "</button>"
          );
        })
        .join("");
    }
    html += "</div>";
    body.innerHTML = html;

    body.querySelectorAll("[data-follow-all]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentFollowCsrs = [];
        updateWhoToggleLabel();
        renderFollowDrawer();
        applyFilters();
        saveMiSeguimiento();
      });
    });
    body.querySelectorAll("[data-follow-csr]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var csr = btn.getAttribute("data-follow-csr");
        var idx = currentFollowCsrs.indexOf(csr);
        if (idx === -1) {
          currentFollowCsrs.push(csr);
        } else {
          currentFollowCsrs.splice(idx, 1);
        }
        updateWhoToggleLabel();
        renderFollowDrawer();
        applyFilters();
        saveMiSeguimiento();
      });
    });
  }

  function saveMiSeguimiento() {
    if (!myRealIdentity || !myPassword) return;
    google.script.run
      .withFailureHandler(function (err) {
        showToast(
          'No se pudo guardar "a quién sigues": ' + err.message,
          "error",
        );
      })
      .setMiSeguimiento(myRealIdentity, myPassword, currentFollowCsrs);
  }

  function openWhoDrawer() {
    var titleEl = document.getElementById("who-drawer-title");
    if (myRole() === "Seguimiento") {
      if (titleEl) titleEl.textContent = "A quién sigues";
      renderFollowDrawer();
    } else {
      if (titleEl) titleEl.textContent = "¿Quién eres?";
      var persona = personas.filter(function (p) {
        return p.nombre === currentWho;
      })[0];
      whoDrawerOpenSeg =
        persona && persona.rol === "Seguimiento" ? persona.nombre : null;
      renderWhoDrawer();
    }
    document.getElementById("who-drawer-backdrop").classList.add("show");
  }

  function closeWhoDrawer() {
    document.getElementById("who-drawer-backdrop").classList.remove("show");
  }

  document
    .getElementById("who-toggle-btn")
    .addEventListener("click", openWhoDrawer);
  document
    .getElementById("who-drawer-close")
    .addEventListener("click", closeWhoDrawer);
  document
    .getElementById("who-drawer-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "who-drawer-backdrop") closeWhoDrawer();
    });

  function rolLabel(rol, nombre) {
    // El puesto visible puede variar entre personas con los mismos permisos.
    // "Supervisor" sigue siendo el identificador heredado de admin en los datos.
    var etiquetas = PANEL_CONFIG.PROFILE_ROLE_LABELS || {};
    var etiquetaPersonal = etiquetas[nombre] && etiquetas[nombre][rol];
    if (etiquetaPersonal) return etiquetaPersonal;
    if (rol === "Supervisor") return "Admin";
    return rol === "Seguimiento" ? "General" : rol;
  }

  function renderPersonasList() {
    var el = document.getElementById("csr-personas-list");
    if (!personas.length) {
      el.innerHTML =
        '<div class="comments-empty">Sin personas registradas</div>';
      return;
    }
    el.innerHTML = personas
      .map(function (p) {
        var rolOpts = ["CSR", "Seguimiento", "Supervisor"]
          .map(function (r) {
            return (
              '<option value="' +
              r +
              '"' +
              (p.rol === r ? " selected" : "") +
              ">" +
              esc(rolLabel(r, p.nombre)) +
              "</option>"
            );
          })
          .join("");
        return (
          '<div class="csr-list-item csr-list-item-persona"><span>' +
          esc(p.nombre) +
          "</span>" +
          '<select class="csr-correo-input" aria-label="Rol de ' +
          esc(p.nombre) +
          '" data-rol-nombre="' +
          esc(p.nombre) +
          '">' +
          rolOpts +
          "</select>" +
          '<input type="email" class="csr-correo-input" placeholder="correo@..." value="' +
          esc(p.correo || "") +
          '" data-correo-nombre="' +
          esc(p.nombre) +
          '">' +
          '<input type="text" class="csr-correo-input" placeholder="' +
          (p.passwordSet
            ? "Contraseña ya asignada"
            : "Asignar contraseña (mínimo 8 caracteres)") +
          '" data-password-nombre="' +
          esc(p.nombre) +
          '">' +
          '<button type="button" class="csr-remove" data-remove-persona="' +
          esc(p.nombre) +
          '">&times;</button></div>'
        );
      })
      .join("");
    el.querySelectorAll("[data-rol-nombre]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var nombre = sel.getAttribute("data-rol-nombre");
        var rol = sel.value;
        google.script.run
          .withSuccessHandler(function (res) {
            if (res.ok) {
              var p = personas.filter(function (x) {
                return x.nombre === nombre;
              })[0];
              if (p) p.rol = rol;
              if (currentWho === nombre || myRealIdentity === nombre) {
                applyFilters();
                refreshOperationalAttention();
              }
              showToast(
                "Rol actualizado: " + nombre + " → " + rolLabel(rol, nombre),
                "good",
              );
            } else {
              showToast(res.error || "No se pudo actualizar el rol", "error");
            }
          })
          .withFailureHandler(function (err) {
            showToast("Error: " + err.message, "error");
          })
          .setPersonaRol(nombre, rol, adminCred_());
      });
    });
    el.querySelectorAll("[data-remove-persona]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nombre = btn.getAttribute("data-remove-persona");
        personas = personas.filter(function (p) {
          return p.nombre !== nombre;
        });
        renderPersonasList();
        accionConDeshacer_(
          "Persona eliminada: " + nombre,
          function () {
            guardarConVerificacion_(
              function () {
                loadPersonasYAsignaciones();
              },
              function (err) {
                loadPersonasYAsignaciones();
                showToast(
                  "No se pudo eliminar a " + nombre + ": " + err.message,
                  "error",
                );
              },
            ).removePersona(nombre, adminCred_());
          },
          function () {
            loadPersonasYAsignaciones();
          },
        );
      });
    });
    el.querySelectorAll("[data-correo-nombre]").forEach(function (input) {
      input.addEventListener("change", function () {
        var nombre = input.getAttribute("data-correo-nombre");
        var correo = input.value.trim();
        google.script.run
          .withSuccessHandler(function (res) {
            if (res.ok) {
              var p = personas.filter(function (x) {
                return x.nombre === nombre;
              })[0];
              if (p) p.correo = correo;
              showToast("Correo actualizado: " + nombre, "good");
            } else {
              showToast(
                res.error || "No se pudo actualizar el correo",
                "error",
              );
            }
          })
          .setPersonaCorreo(nombre, correo, adminCred_());
      });
    });
    el.querySelectorAll("[data-password-nombre]").forEach(function (input) {
      input.addEventListener("change", function () {
        var nombre = input.getAttribute("data-password-nombre");
        var password = input.value.trim();
        if (!password) return;
        google.script.run
          .withSuccessHandler(function (res) {
            if (res.ok) {
              input.value = "";
              loadPersonasYAsignaciones();
              showToast("Contraseña actualizada: " + nombre, "good");
            } else {
              showToast(
                res.error || "No se pudo actualizar la contraseña",
                "error",
              );
            }
          })
          .withFailureHandler(function (err) {
            showToast("Error: " + err.message, "error");
          })
          .setPersonaPassword(nombre, password, adminCred_());
      });
    });
  }

  function renderAsigCsrSelect() {
    var sel = document.getElementById("csr-asig-csr");
    var current = sel.value;
    var csrNames = personas
      .filter(function (p) {
        return window.panelPeople.canOperate(p);
      })
      .map(function (p) {
        return p.nombre;
      });
    sel.innerHTML = csrNames
      .map(function (n) {
        return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
      })
      .join("");
    sel.value = current;
  }

  function renderAsigClienteSelect() {
    var sel = document.getElementById("csr-asig-cliente");
    var clientes = {};
    currentData.forEach(function (r) {
      if (r.customer) clientes[r.customer] = true;
    });
    asignaciones.forEach(function (a) {
      if (a.cliente) clientes[a.cliente] = true;
    });
    var list = Object.keys(clientes).sort();
    sel.innerHTML = list
      .map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + "</option>";
      })
      .join("");
  }

  function renderAsignacionesList() {
    var el = document.getElementById("csr-asignaciones-list");
    if (!asignaciones.length) {
      el.innerHTML =
        '<div class="comments-empty">Sin asignaciones todavía</div>';
      return;
    }
    el.innerHTML = asignaciones
      .map(function (a) {
        return (
          '<div class="csr-list-item"><span>' +
          esc(a.cliente) +
          '<span class="tag">' +
          esc(a.csr) +
          "</span></span>" +
          '<button type="button" class="csr-remove" data-remove-asig="' +
          esc(a.cliente) +
          '">&times;</button></div>'
        );
      })
      .join("");
    el.querySelectorAll("[data-remove-asig]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cliente = btn.getAttribute("data-remove-asig");
        asignaciones = asignaciones.filter(function (a) {
          return a.cliente !== cliente;
        });
        renderAsignacionesList();
        accionConDeshacer_(
          "Asignación eliminada: " + cliente,
          function () {
            guardarConVerificacion_(
              function () {
                loadPersonasYAsignaciones();
              },
              function (err) {
                loadPersonasYAsignaciones();
                showToast(
                  "No se pudo eliminar la asignación: " + err.message,
                  "error",
                );
              },
            ).removeAsignacion(cliente, adminCred_());
          },
          function () {
            loadPersonasYAsignaciones();
          },
        );
      });
    });
  }

  // Identidad real de quien está usando el panel ahorita, verificada con su contraseña personal (nunca
  // por el selector de "usuario", que solo cambia qué se está VIENDO/filtrando). Los comentarios
  // siempre se firman con esto, para que nadie pueda "volverse" otro CSR al cambiar el filtro y
  // que sus comentarios salgan como si los hubiera puesto alguien más.
  //
  // Antes esto se detectaba automático con la cuenta de Google (Session.getActiveUser()), pero
  // eso requería compartir el Google Sheet directo con cada persona para que Google expusiera su
  // identidad al script — lo cual les hubiera dado acceso a ver todas las cargas de todos los CSR
  // en crudo, sin el filtrado del panel. Por eso se cambió a una contraseña personal: cada quien lo
  // verifica una vez por navegador (se guarda en localStorage) y el servidor lo vuelve a revisar
  // en cada comentario, sin depender de Google ni exponer el Sheet.
  var myRealIdentity = "";
  var myPassword = "";

  var myTemplates = {};
  var myTemplateLabels = {};

  var salidaMexicoDebounceTimers = {};
  var cruceUsaDebounceTimers = {};
  var pendingFieldFlush = {};
  function flushPendingFieldSaves(load, done) {
    var flushers = pendingFieldFlush[load];
    var keys = flushers ? Object.keys(flushers) : [];
    if (!keys.length) {
      done();
      return;
    }
    var remaining = keys.length;
    keys.forEach(function (k) {
      var fn = flushers[k];
      fn(function () {
        remaining--;
        if (remaining <= 0) done();
      });
    });
  }

  // Si con tu identidad ya verificada te metes al panel de otro CSR (o a "Todos") para revisar
  // algo puntual, después de 1.5 minutos sin volver a tocar el selector de "¿quién eres?" se
  // regresa solo a tu propio panel — para que no se te quede viendo el de otra persona por
  // accidente. Se reprograma cada vez que cambias de panel (ver updateWhoToggleLabel).
  var panelAutoReturnTimer = null;
  var PANEL_AUTO_RETURN_MS = 90000; // 1.5 minutos

  function schedulePanelAutoReturn() {
    if (panelAutoReturnTimer) {
      clearTimeout(panelAutoReturnTimer);
      panelAutoReturnTimer = null;
    }
    if (!myRealIdentity || currentWho === myRealIdentity) return;
    panelAutoReturnTimer = setTimeout(function () {
      panelAutoReturnTimer = null;
      if (!myRealIdentity || currentWho === myRealIdentity) return;
      selectWho(myRealIdentity, "");
      showToast(
        "Regresaste en automático a tu panel (" + myRealIdentity + ")",
        "good",
      );
    }, PANEL_AUTO_RETURN_MS);
  }

  // Callback pendiente de un intento de cambio que se detuvo porque nadie había iniciado sesión
  // todavía en este navegador — se ejecuta solo (una vez) en cuanto el login se completa. Ver
  // ensureLoggedIn(), que es el punto de entrada único usado por TODOS los cambios editables del
  // panel (estatus, POD, recargos, truck, trailer, fechas, color, comentarios, incidencias,
  // pendientes, bitácora) para exigir sesión iniciada antes de guardar cualquier cosa.
  var pendingAfterLogin = null;

  /** Punto de entrada único: si ya hay sesión iniciada, ejecuta "accion" de inmediato; si no,
   * abre el modal de login y deja "accion" pendiente para correrla sola en cuanto se inicie
   * sesión con éxito (ver el final de verifyIdentity()). */
  function ensureLoggedIn(accion) {
    if (myRealIdentity && myPassword) {
      accion();
      return;
    }
    pendingAfterLogin = accion;
    openIdentityModal();
  }

  function renderIdentitySelect() {
    var sel = document.getElementById("identity-nombre-select");
    if (!sel) return;
    var actual = sel.value;
    sel.innerHTML =
      '<option value="" disabled' +
      (actual ? "" : " selected") +
      ">" +
      (personas.length ? "Elige tu nombre…" : "Cargando nombres…") +
      "</option>" +
      personas
        .map(function (p) {
          return (
            '<option value="' +
            esc(p.nombre) +
            '">' +
            esc(p.nombre) +
            "</option>"
          );
        })
        .join("");
    if (actual) sel.value = actual;
  }

  function openIdentityModal() {
    renderIdentitySelect();
    if (myRealIdentity)
      document.getElementById("identity-nombre-select").value = myRealIdentity;
    document.getElementById("identity-password-input").value = "";
    document.getElementById("identity-error").style.display = "none";
    document.getElementById("identity-change-pw-box").style.display = "none";
    document.getElementById("identity-new-password-input").value = "";
    var isGate = !myRealIdentity;
    var box = document.getElementById("identity-modal-box");
    var backdrop = document.getElementById("identity-backdrop");
    box.classList.toggle("gate-mode", isGate);
    backdrop.classList.toggle("gate-active", isGate);
    document.getElementById("identity-modal-title").textContent = isGate
      ? "Iniciar sesión"
      : "Cambiar de sesión";
    backdrop.classList.add("show");
  }

  /** Atajo para el botón "Cambiar contraseña" del header: abre el mismo modal pero directo con el
   * bloque de nueva contraseña ya desplegado, para no obligar a dar clic dos veces. */
  function openChangePasswordModal() {
    openIdentityModal();
    if (myRealIdentity)
      document.getElementById("identity-change-pw-box").style.display = "flex";
  }

  function closeIdentityModal() {
    if (!myRealIdentity) return;
    document.getElementById("identity-backdrop").classList.remove("show");
  }

  document
    .getElementById("identity-change-pw-link")
    .addEventListener("click", function () {
      var box = document.getElementById("identity-change-pw-box");
      box.style.display = box.style.display === "none" ? "flex" : "none";
    });

  document
    .getElementById("identity-change-pw-submit")
    .addEventListener("click", function () {
      var nombre = document.getElementById("identity-nombre-select").value;
      var currentPassword = document
        .getElementById("identity-password-input")
        .value.trim();
      var newPassword = document
        .getElementById("identity-new-password-input")
        .value.trim();
      var errEl = document.getElementById("identity-error");
      if (!nombre || !currentPassword) {
        errEl.textContent = "Escribe tu contraseña actual arriba primero.";
        errEl.style.display = "";
        return;
      }
      if (!newPassword || newPassword.length < 8) {
        errEl.textContent =
          "La nueva contraseña debe tener al menos 8 caracteres.";
        errEl.style.display = "";
        return;
      }
      var btn = document.getElementById("identity-change-pw-submit");
      btn.disabled = true;
      google.script.run
        .withSuccessHandler(function (res) {
          btn.disabled = false;
          if (res.ok) {
            // Con el Code.gs nuevo, cambiar la contraseña cierra las demás sesiones y regresa un
            // token nuevo para esta — se sigue trabajando sin volver a entrar.
            if (res.token && nombre === myRealIdentity) {
              myPassword = res.token;
              guardarSesionLocal_(nombre, res.token);
              showToast(
                "Contraseña actualizada. Se cerró tu sesión en otras computadoras.",
                "good",
              );
              document.getElementById("identity-new-password-input").value = "";
              document.getElementById("identity-change-pw-box").style.display =
                "none";
              closeIdentityModal();
              return;
            }
            showToast(
              "Contraseña actualizada — vuelve a iniciar sesión con la nueva",
              "good",
            );
            document.getElementById("identity-new-password-input").value = "";
            document.getElementById("identity-change-pw-box").style.display =
              "none";
          } else {
            errEl.textContent = res.error || "No se pudo cambiar la contraseña";
            errEl.style.display = "";
          }
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          errEl.textContent = "Error: " + err.message;
          errEl.style.display = "";
        })
        .changeMyPassword(nombre, currentPassword, newPassword);
    });

  /** Verifica nombre+contraseña contra el servidor. opts.silent evita mostrar toasts/errores (se usa al
   * restaurar la identidad guardada en localStorage al cargar la página); opts.onDone se llama
   * siempre al terminar (éxito o no), para poder reactivar botones. */
  function verifyIdentity(nombre, password, opts) {
    opts = opts || {};
    google.script.run
      .withSuccessHandler(function (res) {
        if (res && res.ok) {
          myRealIdentity = nombre;
          myPassword = res.token ? res.token : password;
          guardarSesionLocal_(nombre, res.token || "");
          if (!currentWho) {
            currentWho = nombre;
            var mePersonaLogin = personas.filter(function (p) {
              return p.nombre === nombre;
            })[0];
            currentFollowCsrs =
              mePersonaLogin && mePersonaLogin.rol === "Seguimiento"
                ? mePersonaLogin.sigueA || []
                : [];
            updateWhoToggleLabel();
            renderWhoDrawer();
            applyFilters();
            refreshOperationalAttention();
          } else {
            // currentWho ya estaba en algo (p. ej. el panel de otro CSR) desde antes de verificar
            // tu identidad — igual hay que (re)programar el regreso automático a tu panel, ya que
            // updateWhoToggleLabel() no se llama en este caso (currentWho no cambió).
            schedulePanelAutoReturn();
          }
          updateCommentsIdentityGate();
          // FIX: seguridad — todo lo que exige sesión se pide aquí, en cuanto se confirma (ver el
          // arranque al final del script, que ya no pide cargas sin sesión).
          // Una sola llamada trae todo lo que depende de quién eres: cargas, personas/asignaciones/
          // seguimientos, comentarios, bitácora, pendientes, apartados y cierres de turno.
          lastLoadsFetchTs = 0;
          autoRefreshBusy = false;
          autoRefresh(true);
          loadSlaMetrics();
          loadMisPlantillas(); // el Centro de mensajes también es de quien inició sesión
          renderVistas_(); // "Mis vistas" es de cada quien
          closeIdentityModal();
          if (!opts.silent) showToast("Sesión iniciada: " + nombre, "good");
          if (pendingAfterLogin) {
            var accion = pendingAfterLogin;
            pendingAfterLogin = null;
            accion();
          }
        } else {
          myRealIdentity = "";
          myPassword = "";
          borrarSesionLocal_();
          schedulePanelAutoReturn(); // sin identidad verificada, no hay a dónde regresar — cancela el temporizador
          updateCommentsIdentityGate();
          loadBitacora(); // sin identidad verificada, no debe quedar viendo pendientes de nadie
          loadPendientes(); // idem
          loadApartados_(); // idem
          loadMisPlantillas(); // idem — sin identidad, vuelve a las 4 plantillas default
          loadCierresRecibidos(); // idem — sin identidad, no debe quedar viendo cierres de nadie
          if (!opts.silent) {
            var errEl = document.getElementById("identity-error");
            errEl.textContent = (res && res.error) || "Contraseña incorrecta.";
            errEl.style.display = "";
          }
        }
        if (opts.onDone) opts.onDone();
      })
      .withFailureHandler(function (err) {
        updateCommentsIdentityGate();
        if (!opts.silent)
          showToast("Error al verificar: " + err.message, "error");
        if (opts.onDone) opts.onDone();
      })
      .verifyIdentityLogin(nombre, password);
  }

  function submitIdentity() {
    var nombre = document.getElementById("identity-nombre-select").value;
    var password = document
      .getElementById("identity-password-input")
      .value.trim();
    if (!nombre || !password) {
      var errEl = document.getElementById("identity-error");
      errEl.textContent = !nombre
        ? "Elige tu nombre."
        : "Escribe tu contraseña.";
      errEl.style.display = "";
      return;
    }
    var btn = document.getElementById("identity-submit");
    btn.disabled = true;
    verifyIdentity(nombre, password, {
      onDone: function () {
        btn.disabled = false;
      },
    });
  }

  document
    .getElementById("identity-verify-btn")
    .addEventListener("click", openIdentityModal);
  document
    .getElementById("identity-close")
    .addEventListener("click", closeIdentityModal);
  document
    .getElementById("identity-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "identity-backdrop") closeIdentityModal();
    });
  document
    .getElementById("identity-submit")
    .addEventListener("click", submitIdentity);
  document
    .getElementById("identity-password-input")
    .addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitIdentity();
    });

  /** Al cargar la página, intenta restaurar la identidad ya verificada antes en este navegador
   * (guardada en localStorage), revalidándola contra el servidor por si la contraseña cambió mientras
   * tanto. Si no hay nada guardado, se queda bloqueado hasta que alguien verifique su contraseña. */
  function guardarSesionLocal_(nombre, token) {
    try {
      localStorage.setItem("bajio_identity_nombre", nombre);
      if (token) localStorage.setItem("bajio_identity_token", token);
      else localStorage.removeItem("bajio_identity_token");
      localStorage.removeItem("bajio_identity_password"); // formato viejo: contraseña en claro
    } catch (e) {}
  }
  function borrarSesionLocal_() {
    try {
      localStorage.removeItem("bajio_identity_nombre");
      localStorage.removeItem("bajio_identity_token");
      localStorage.removeItem("bajio_identity_password");
    } catch (e) {}
  }

  function loadStoredIdentity() {
    var nombre = "",
      password = "";
    try {
      nombre = localStorage.getItem("bajio_identity_nombre") || "";
      // Token de sesión (formato nuevo). Si este navegador todavía trae la contraseña guardada
      // del formato viejo, se usa UNA vez para entrar: verifyIdentity la cambia por un token y la
      // borra del disco (ver guardarSesionLocal_).
      password =
        localStorage.getItem("bajio_identity_token") ||
        localStorage.getItem("bajio_identity_password") ||
        "";
    } catch (e) {}
    if (nombre && password) {
      verifyIdentity(nombre, password, { silent: true });
    } else {
      updateCommentsIdentityGate();
    }
  }

  // Bloquea (o desbloquea) el cuadro de comentarios según si ya se verificó la identidad real
  // de quien está usando el panel. Sin identidad verificada, no se permite escribir/guardar
  // comentarios, para que nunca se pueda guardar uno sin saber con certeza quién lo escribió.
  function updateCommentsIdentityGate() {
    var textarea = document.getElementById("comments-textarea");
    var btn = document.getElementById("comments-submit");
    var verifyBtn = document.getElementById("identity-verify-btn");
    if (textarea && btn) {
      if (myRealIdentity) {
        textarea.disabled = false;
        btn.disabled = false;
        textarea.placeholder = "Escribe un comentario...";
        if (verifyBtn) verifyBtn.style.display = "none";
      } else {
        textarea.disabled = true;
        btn.disabled = true;
        textarea.placeholder =
          "Verifica tu identidad para poder comentar (botón de abajo).";
        if (verifyBtn) verifyBtn.style.display = "";
      }
    }
    updateHeaderSessionUI();
    updateWhoToggleBtnMeta();
  }

  function sessionInitials(nombre) {
    if (!nombre) return "";
    var parts = nombre.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function updateHeaderSessionUI() {
    var avatar = document.getElementById("session-chip-avatar");
    var name = document.getElementById("session-chip-name");
    var chip = document.getElementById("session-chip");
    if (!avatar || !name || !chip) return;
    chip.hidden = !myRealIdentity;
    renderAvisos_();
    ["session-change-pw-btn", "session-logout-btn"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.hidden = !myRealIdentity;
    });
    if (myRealIdentity) {
      var persona = personas.filter(function (p) {
        return p.nombre === myRealIdentity;
      })[0];
      avatar.textContent = sessionInitials(myRealIdentity);
      name.textContent = myRealIdentity;
      chip.title = persona ? rolLabel(persona.rol, persona.nombre) : "";
    } else {
      avatar.textContent = "";
      name.textContent = "Sin sesión";
      chip.title = "";
    }
  }

  /** A qué persona pertenece la sesión actualmente iniciada (CSR / Seguimiento), o '' si nadie ha
   * iniciado sesión todavía. Usado en Fase B para decidir qué versión de "¿Quién eres?" mostrar. */
  function myRole() {
    if (!myRealIdentity) return "";
    var p = personas.filter(function (p) {
      return p.nombre === myRealIdentity;
    })[0];
    return p ? p.rol : "";
  }

  /** El botón "¿Quién eres?"/"A quién sigues" del sidebar cambia de título según el rol de quien
   * inició sesión (ver Fase B: openWhoDrawer()). */
  function updateWhoToggleBtnMeta() {
    var btn = document.getElementById("who-toggle-btn");
    if (!btn) return;
    btn.title = myRole() === "Seguimiento" ? "A quién sigues" : "¿Quién eres?";
  }

  function logout() {
    // Invalidar respuestas pendientes antes de borrar la identidad visible.
    window.panelApi.logout().catch(function (err) {
      showToast(err.message, "error");
    });
    autoRefreshBusy = false;
    myRealIdentity = "";
    myPassword = "";
    csrAdminPw = "";
    borrarSesionLocal_();
    // Las cargas de quien cerró sesión no deben quedarse en memoria para el siguiente que entre.
    lastLoadsFetchTs = 0;
    marcasConocidas_ = {};
    if (masivo_.activo) activarMasivo_(false);
    renderVistas_();
    render([]);
    avisosEstado_ = null;
    bitacoraCargada_ = false;
    abrirAvisos_(false);
    currentWho = "";
    currentOperationalScope = false;
    currentFollowCsrs = [];
    updateWhoToggleLabel();
    renderWhoDrawer();
    applyFilters();
    updateCommentsIdentityGate();
    loadBitacora();
    loadPendientes(); // idem — ya no debe quedar viendo los pendientes de load de quien cerró sesión
    loadApartados_(); // idem — ni sus loads apartados
    loadMisPlantillas(); // idem — ya no debe quedar viendo el Centro de mensajes de quien cerró sesión
    loadCierresRecibidos(); // idem — ya no debe quedar viendo los cierres de turno de quien cerró sesión
    showToast("Sesión cerrada", "good");
    openIdentityModal();
  }

  document
    .getElementById("session-change-pw-btn")
    .addEventListener("click", openChangePasswordModal);
  document
    .getElementById("session-logout-btn")
    .addEventListener("click", logout);

  // ---- Sidebar: accesos rápidos (scroll a sección) y encabezado (última actualización + refresh) ----
  document
    .querySelectorAll(".sidebar-btn[data-scroll-to]")
    .forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(
          btn.getAttribute("data-scroll-to"),
        );
        if (target)
          target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

  function updateHeaderTimestamp() {
    var el = document.getElementById("header-updated");
    if (!el || !lastRenderedAt) return;
    el.textContent = "Actualizado " + relativeTimeLabel(lastRenderedAt);
  }
  setInterval(updateHeaderTimestamp, 30000);

  document
    .getElementById("header-refresh-btn")
    .addEventListener("click", function () {
      var btn = this;
      if (btn.classList.contains("spinning")) return;
      btn.classList.add("spinning");
      setTimeout(function () {
        btn.classList.remove("spinning");
      }, 450);
      autoRefreshBusy = false;
      autoRefresh(true); // trae todo, aunque las marcas digan que no cambió nada
    });

  function loadPersonasYAsignaciones() {
    google.script.run
      .withSuccessHandler(aplicarPersonas_)
      .getPersonas(myRealIdentity, myPassword);
    google.script.run
      .withSuccessHandler(aplicarAsignaciones_)
      .getAsignaciones(myRealIdentity, myPassword);
    google.script.run
      .withSuccessHandler(aplicarSeguimientos_)
      .getLoadSeguimientos(myRealIdentity, myPassword);
  }
  function aplicarPersonas_(json) {
    personas = JSON.parse(json);
    if (myRealIdentity) {
      var mePersona = personas.filter(function (p) {
        return p.nombre === myRealIdentity;
      })[0];
      if (mePersona && mePersona.rol === "Seguimiento")
        currentFollowCsrs = mePersona.sigueA || [];
    }
    renderWhoDrawer();
    updateWhoToggleLabel();
    renderPersonasList();
    renderAsigCsrSelect();
    applyFilters();
    if (!myRealIdentity) renderIdentitySelect();
    updateHeaderSessionUI();
  }
  function aplicarAsignaciones_(json) {
    asignaciones = JSON.parse(json);
    renderAvisos_(); // Retirar inmediatamente los avisos de un cliente que cambió de dueño.
    programarAvisos_();
    renderAsignacionesList();
    renderTable(currentData);
    wireCardEvents();
    applyFilters();
  }
  function aplicarSeguimientos_(json) {
    loadSeguimientos = JSON.parse(json);
    applyFilters();
    renderWorkspace();
  }

  document
    .getElementById("csr-add-persona-btn")
    .addEventListener("click", function () {
      var nombre = document.getElementById("csr-new-nombre").value.trim();
      var correo = document.getElementById("csr-new-correo").value.trim();
      var rol = document.getElementById("csr-new-rol").value;
      if (!nombre) return;
      google.script.run
        .withSuccessHandler(function (res) {
          if (res.ok) {
            document.getElementById("csr-new-nombre").value = "";
            document.getElementById("csr-new-correo").value = "";
            loadPersonasYAsignaciones();
            showToast(
              "Persona agregada: " +
                nombre +
                " (" +
                rolLabel(rol, nombre) +
                ")",
              "good",
            );
          } else {
            showToast(res.error, "error");
          }
        })
        .addPersona(nombre, rol, correo, adminCred_());
    });

  document
    .getElementById("csr-asignar-btn")
    .addEventListener("click", function () {
      var csr = document.getElementById("csr-asig-csr").value;
      var cliente = document.getElementById("csr-asig-cliente").value;
      if (!csr || !cliente) return;
      guardarConVerificacion_(
        function () {
          loadPersonasYAsignaciones();
          showToast("Cliente asignado: " + cliente + " → " + csr, "good");
        },
        function (err) {
          showToast("No se pudo asignar el cliente: " + err.message, "error");
        },
      ).asignarCliente(cliente, csr, adminCred_());
    });

  document.querySelectorAll("[data-pw-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = document.getElementById(btn.getAttribute("data-pw-toggle"));
      input.type = input.type === "password" ? "text" : "password";
      btn.textContent = input.type === "password" ? "👁" : "🙈";
    });
  });

  document
    .getElementById("csr-pw-change-btn")
    .addEventListener("click", function () {
      var cur = document.getElementById("csr-pw-current").value;
      var next = document.getElementById("csr-pw-new").value;
      google.script.run
        .withSuccessHandler(function (res) {
          if (res.ok) {
            document.getElementById("csr-pw-current").value = "";
            document.getElementById("csr-pw-new").value = "";
            showToast("Contraseña actualizada", "good");
          } else {
            showToast(res.error, "error");
          }
        })
        .changeCsrPassword(cur, next);
    });

  var csrPwGateOnSuccess = null;
  // Contraseña de administración ya validada en esta pestaña — se manda en cada llamada de
  // "Gestionar CSR" e "Importar Excel" porque ahora el servidor también la revisa (ver
  // requireAdmin_ en Code.gs). Solo vive en memoria: se pierde al recargar y se borra al cerrar sesión.
  var csrAdminPw = "";
  /** Lo que se manda en las acciones de admin: la contraseña + quién tiene sesión en este panel,
   * para la Bitácora de admin (ver logAdmin_ en Code.gs). */
  function adminCred_() {
    return { pw: csrAdminPw, quien: myRealIdentity || "" };
  }
  function openCsrPasswordGate(onSuccess) {
    csrPwGateOnSuccess = typeof onSuccess === "function" ? onSuccess : null;
    document.getElementById("csr-pw-input").value = "";
    document.getElementById("csr-pw-error").style.display = "none";
    document.getElementById("csr-pw-backdrop").classList.add("show");
    document.getElementById("csr-pw-input").focus();
  }
  function closeCsrPasswordGate() {
    document.getElementById("csr-pw-backdrop").classList.remove("show");
  }
  function submitCsrPassword() {
    var pw = document.getElementById("csr-pw-input").value;
    var btn = document.getElementById("csr-pw-submit");
    btn.disabled = true;
    google.script.run
      .withSuccessHandler(function (res) {
        btn.disabled = false;
        if (res.ok) {
          csrAdminPw = pw;
          closeCsrPasswordGate();
          if (csrPwGateOnSuccess) {
            csrPwGateOnSuccess(pw);
          } else {
            renderAsigClienteSelect();
            cargarAdminExtras_();
            document.getElementById("csr-backdrop").classList.add("show");
          }
        } else {
          document.getElementById("csr-pw-error").textContent =
            res.error || "Contraseña incorrecta.";
          document.getElementById("csr-pw-error").style.display = "";
        }
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        showToast("Error: " + err.message, "error");
      })
      .checkCsrPassword(pw);
  }
  document
    .getElementById("csr-pw-submit")
    .addEventListener("click", submitCsrPassword);
  document
    .getElementById("csr-pw-input")
    .addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitCsrPassword();
    });
  document
    .getElementById("csr-pw-close")
    .addEventListener("click", closeCsrPasswordGate);
  document
    .getElementById("csr-pw-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "csr-pw-backdrop") closeCsrPasswordGate();
    });

  document
    .getElementById("manage-csr-btn")
    .addEventListener("click", function () {
      openCsrPasswordGate();
    });
  document
    .getElementById("sidebar-manage-csr-btn")
    .addEventListener("click", function () {
      openCsrPasswordGate();
    });
  document
    .getElementById("sidebar-historico-btn")
    .addEventListener("click", function () {
      showMainPage("historico");
      loadHistoricoPendientes();
    });

  document
    .getElementById("export-operation-report-btn")
    .addEventListener("click", function () {
      exportReporteOperacion(this);
    });

  document
    .getElementById("excel-import-btn")
    .addEventListener("click", function () {
      openCsrPasswordGate(function () {
        document.getElementById("file-input").click();
      });
    });
  document.getElementById("csr-close").addEventListener("click", function () {
    document.getElementById("csr-backdrop").classList.remove("show");
  });
  document
    .getElementById("csr-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "csr-backdrop")
        document.getElementById("csr-backdrop").classList.remove("show");
    });

  /** Un solo selector conserva el alcance y la lógica de los filtros de la operación. */
  function marcarFiltroOperacion_(filtro) {
    currentFilter = filtro;
    document.getElementById("operation-state-filter").value = filtro;
  }
  document
    .getElementById("operation-state-filter")
    .addEventListener("change", function (event) {
      marcarFiltroOperacion_(event.target.value);
      applyFilters();
    });
  document.getElementById("search").addEventListener("input", function (e) {
    currentSearch = e.target.value.trim().toLowerCase();
    applyFilters();
  });

  // ---- Acciones masivas (Operación completa, vista tabla) ----
  // "Seleccionar varias" cambia el clic en un renglón: en vez de abrir el detalle, lo marca. Con
  // la barra se cambia el estatus o se marca POD a todas las marcadas en una sola llamada
  // (guardarMasivo en Code.gs), con el mismo historial que hacerlo una por una. Los estatus que
  // piden fecha de recordatorio no aparecen aquí: cada carga necesita su propia fecha.
  var masivo_ = { activo: false, sel: {} };
  function masivoCuenta_() {
    return Object.keys(masivo_.sel).length;
  }
  function marcarFilasMasivo_() {
    if (!masivo_ || !masivo_.activo) return;
    document.querySelectorAll("#table-body tr.t-row").forEach(function (tr) {
      tr.classList.toggle(
        "sel-masivo",
        !!masivo_.sel[tr.getAttribute("data-load")],
      );
    });
  }
  function renderMasivo_() {
    document.getElementById("masivo-bar").hidden = !masivo_.activo;
    document
      .getElementById("masivo-btn")
      .classList.toggle("activo", masivo_.activo);
    document.getElementById("masivo-btn").textContent = masivo_.activo
      ? "Seleccionando…"
      : "Seleccionar varias";
    document
      .getElementById("table-view")
      .classList.toggle("modo-masivo", masivo_.activo);
    var n = masivoCuenta_();
    document.getElementById("masivo-cuenta").textContent =
      n + (n === 1 ? " seleccionada" : " seleccionadas");
    document.getElementById("masivo-aplicar-status").disabled = !n;
    document.getElementById("masivo-pod").disabled = !n;
    if (!masivo_.activo)
      document
        .querySelectorAll("#table-body tr.sel-masivo")
        .forEach(function (tr) {
          tr.classList.remove("sel-masivo");
        });
    marcarFilasMasivo_();
  }
  function activarMasivo_(on) {
    masivo_.activo = on;
    masivo_.sel = {};
    if (on && currentView !== "table") {
      currentView = "table";
      try {
        localStorage.setItem("bajio_view", currentView);
      } catch (e) {}
      applyView();
    }
    if (on) {
      selectedTableLoad = null;
      renderTableDetailPanel();
    }
    renderMasivo_();
  }
  function aplicarMasivo_(accion, valor, etiqueta) {
    var loads = Object.keys(masivo_.sel);
    if (!loads.length) return;
    var hacer = function () {
      confirmarModal_(
        etiqueta +
          " a " +
          loads.length +
          (loads.length === 1 ? " carga" : " cargas") +
          "?",
        loads
          .slice(0, 40)
          .map(function (l) {
            return "Carga " + esc(l);
          })
          .join(", ") +
          (loads.length > 40 ? "…" : "") +
          "<br><br>Queda en el historial de cada carga, igual que si lo hicieras una por una.",
        "Sí, aplicar",
        function () {
          ["masivo-aplicar-status", "masivo-pod"].forEach(function (id) {
            document.getElementById(id).disabled = true;
          });
          google.script.run
            .withSuccessHandler(function (res) {
              if (!res || res.ok === false) {
                renderMasivo_();
                showToast((res && res.error) || "No se pudo aplicar", "error");
                return;
              }
              res.hechos.forEach(function (l) {
                var r = recPorLoad_(l);
                if (!r) return;
                if (accion === "pod") r.pod_sent = true;
                else r.status = valor;
              });
              masivo_.sel = {};
              render(currentData);
              renderMasivo_();
              showToast(
                res.hechos.length +
                  " actualizadas" +
                  (res.fallas.length
                    ? " · no se pudo con " +
                      res.fallas
                        .map(function (f) {
                          return f.load;
                        })
                        .join(", ")
                    : ""),
                res.fallas.length ? "error" : "good",
              );
              loadData(); // trae lo que el servidor cambió además (revisión de tránsito, aviso al cliente)
            })
            .withFailureHandler(function (err) {
              renderMasivo_();
              showToast("Error: " + err.message, "error");
            })
            .guardarMasivo(loads, accion, valor, myRealIdentity, myPassword);
        },
      );
    };
    if (!myRealIdentity || !myPassword) {
      ensureLoggedIn(hacer);
      return;
    }
    hacer();
  }
  document.getElementById("masivo-status").innerHTML = STATUS_OPTIONS.filter(
    function (s) {
      return REMINDER_STATUSES.indexOf(s) === -1;
    },
  )
    .map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + "</option>";
    })
    .join("");
  document.getElementById("masivo-btn").addEventListener("click", function () {
    activarMasivo_(!masivo_.activo);
  });
  document
    .getElementById("masivo-salir")
    .addEventListener("click", function () {
      activarMasivo_(false);
    });
  document
    .getElementById("masivo-ninguna")
    .addEventListener("click", function () {
      masivo_.sel = {};
      renderMasivo_();
    });
  document
    .getElementById("masivo-visibles")
    .addEventListener("click", function () {
      document.querySelectorAll("#table-body tr.t-row").forEach(function (tr) {
        if (tr.style.display !== "none")
          masivo_.sel[tr.getAttribute("data-load")] = true;
      });
      renderMasivo_();
    });
  document
    .getElementById("masivo-aplicar-status")
    .addEventListener("click", function () {
      var st = document.getElementById("masivo-status").value;
      aplicarMasivo_("status", st, '¿Cambiar a "' + st + '"');
    });
  document.getElementById("masivo-pod").addEventListener("click", function () {
    aplicarMasivo_("pod", true, "¿Marcar POD enviado");
  });

  // ---- Espacio entre filas (preferencia local; no modifica datos ni filtros) ----
  var tablaCompacta_ = false;
  try {
    tablaCompacta_ = localStorage.getItem("bajio_tabla_compacta") === "1";
  } catch (e) {}
  function aplicarDensidad_() {
    document
      .getElementById("table-view")
      .classList.toggle("tabla-compacta", tablaCompacta_);
    document.getElementById("densidad-select").value = tablaCompacta_
      ? "compacta"
      : "normal";
  }
  document
    .getElementById("densidad-select")
    .addEventListener("change", function () {
      tablaCompacta_ = this.value === "compacta";
      try {
        localStorage.setItem(
          "bajio_tabla_compacta",
          tablaCompacta_ ? "1" : "0",
        );
      } catch (e) {}
      aplicarDensidad_();
    });
  aplicarDensidad_();

  // ---- Mis vistas: filtro + cliente + búsqueda + orden guardados con nombre ----
  // Se guardan en este navegador, por persona (es una comodidad de cada quien, no un dato del equipo).
  var VISTAS_MAX_ = 12;
  var FILTRO_NOMBRES_ = {
    all: "Todas",
    active: "Activas",
    attention: "Necesitan atención",
    "cruce-hoy": "Cruzan hoy",
    "cruce-semana": "Cruzan esta semana",
    done: "Entregadas",
    cancelada: "Canceladas",
  };
  function vistasKey_() {
    return "bajio_vistas_" + (myRealIdentity || "sin-sesion");
  }
  function leerVistas_() {
    try {
      return JSON.parse(localStorage.getItem(vistasKey_()) || "[]") || [];
    } catch (e) {
      return [];
    }
  }
  function guardarVistas_(v) {
    try {
      localStorage.setItem(vistasKey_(), JSON.stringify(v));
    } catch (e) {}
  }
  function describirVista_(x) {
    return [
      FILTRO_NOMBRES_[x.filtro] || x.filtro,
      x.cliente ? "cliente: " + x.cliente : "",
      x.busqueda ? 'busca "' + x.busqueda + '"' : "",
      x.vista === "table" ? "tabla" : "tarjetas",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function renderVistas_() {
    var v = leerVistas_();
    document.getElementById("vistas-bar").innerHTML =
      '<span class="vistas-label">Mis vistas</span>' +
      v
        .map(function (x, i) {
          return (
            '<span class="vista-chip"><button type="button" data-vista="' +
            i +
            '" title="' +
            esc(describirVista_(x)) +
            '">' +
            esc(x.nombre) +
            "</button>" +
            '<button type="button" class="vista-x" data-vista-borrar="' +
            i +
            '" aria-label="Borrar la vista ' +
            esc(x.nombre) +
            '">&times;</button></span>'
          );
        })
        .join("") +
      (v.length < VISTAS_MAX_
        ? '<button type="button" class="link-btn" data-vista-guardar>+ Guardar la vista actual</button>'
        : "");
  }
  function aplicarVista_(x) {
    marcarFiltroOperacion_(x.filtro || "all");
    currentClienteFiltro = x.cliente || "";
    document.getElementById("cliente-filter").value = currentClienteFiltro;
    document.getElementById("search").value = x.busqueda || "";
    currentSearch = String(x.busqueda || "")
      .trim()
      .toLowerCase();
    tableSort.col = x.orden ? x.orden.col : tableSort.col;
    tableSort.dir = x.orden ? x.orden.dir : tableSort.dir;
    if (x.vista && x.vista !== currentView) {
      currentView = x.vista;
      try {
        localStorage.setItem("bajio_view", currentView);
      } catch (e) {}
    }
    viewDirty.table = true;
    viewDirty.cards = true;
    applyView();
    applyFilters();
    showToast("Vista: " + x.nombre, "good");
  }
  document.getElementById("vistas-bar").addEventListener("click", function (e) {
    var b;
    if ((b = e.target.closest("[data-vista]"))) {
      var x = leerVistas_()[Number(b.getAttribute("data-vista"))];
      if (x) aplicarVista_(x);
      return;
    }
    if ((b = e.target.closest("[data-vista-borrar]"))) {
      var v = leerVistas_(),
        i = Number(b.getAttribute("data-vista-borrar"));
      v.splice(i, 1);
      guardarVistas_(v);
      renderVistas_();
      return;
    }
    if (e.target.closest("[data-vista-guardar]")) {
      var actual = {
        filtro: currentFilter,
        cliente: currentClienteFiltro,
        busqueda: document.getElementById("search").value.trim(),
        vista: currentView,
        orden: tableSort.col
          ? { col: tableSort.col, dir: tableSort.dir }
          : null,
      };
      confirmarModal_(
        "Guardar la vista actual",
        '<p class="who-hint" style="margin:0 0 .5rem">' +
          esc(describirVista_(actual)) +
          "</p>" +
          '<input type="text" id="vista-nombre" class="search" maxlength="30" placeholder="Nombre, por ejemplo: Bosch activas" style="width:100%">',
        "Guardar",
        function () {
          actual.nombre =
            document.getElementById("vista-nombre").value.trim() ||
            describirVista_(actual).slice(0, 30);
          var v = leerVistas_();
          v.push(actual);
          guardarVistas_(v.slice(0, VISTAS_MAX_));
          renderVistas_();
          showToast("Vista guardada: " + actual.nombre, "good");
        },
      );
      setTimeout(function () {
        var n = document.getElementById("vista-nombre");
        if (n) n.focus();
      }, 60);
    }
  });
  renderVistas_();
