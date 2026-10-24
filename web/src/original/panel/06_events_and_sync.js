// Integración de instructivos: una confirmación del servidor actualiza la misma carga en todas las vistas.
  window.addEventListener("panel:instruction-load", function (event) {
    var result = event.detail,
      record = result && recPorLoad_(result.load);
    if (!record) return;
    Object.assign(record, result);
    render(currentData);
    if (workspaceCurrentLoad === String(record.load)) renderWorkspace();
    document
      .querySelectorAll(".instruction-full-plan")
      .forEach(function (node) {
        var dialog = node.closest("dialog");
        if (dialog) {
          dialog.close();
          dialog.remove();
        }
      });
  });
  window.addEventListener("panel:instruction-refresh", function () {
    autoRefresh(true);
  });
  // El borrador vive solo dentro del diálogo. Cancelar nunca escribe en Supabase.
  var senalamientosEdicion_ = null;
  function opcionesSenalamientos_() {
    return Array.from(
      document.querySelectorAll("#load-signals-options input:checked"),
    ).map(function (input) {
      return input.dataset.signalOption;
    });
  }
  function actualizarSelectorSenalamientos_() {
    var dialog = document.getElementById("load-signals-dialog");
    var selected = opcionesSenalamientos_();
    var readonly = senalamientosEdicion_ && senalamientosEdicion_.readonly;
    var busy = senalamientosEdicion_ && senalamientosEdicion_.busy;
    dialog.querySelectorAll("[data-signal-option]").forEach(function (input) {
      input.disabled =
        readonly ||
        busy ||
        (!input.checked &&
          selected.length >= window.panelSignals.maxLogisticsSignals);
    });
    dialog
      .querySelectorAll(
        "[data-signals-cancel], [data-signals-clear], [data-signals-save]",
      )
      .forEach(function (button) {
        button.disabled = !!busy;
      });
    dialog.querySelector("[data-signals-clear]").hidden = !!readonly;
    dialog.querySelector("[data-signals-save]").hidden = !!readonly;
    dialog.querySelector("[data-signals-save]").textContent = busy
      ? "Guardando…"
      : "Guardar señalamientos";
    document.getElementById("load-signals-count").textContent =
      selected.length +
      " de 3 seleccionados" +
      (readonly ? " · Solo consulta" : "");
  }
  function cambioSenalamientosCarga_(event) {
    if (!event.target.closest("[data-signal-option]")) return SIGUE_;
    document.getElementById("load-signals-error").hidden = true;
    actualizarSelectorSenalamientos_();
    return;
  }
  function cerrarSenalamientosCarga_() {
    if (!senalamientosEdicion_ || senalamientosEdicion_.busy) return;
    document.getElementById("load-signals-dialog").close();
  }
  function abrirSenalamientosCarga_(button) {
    var rec = recPorLoad_(button.dataset.loadSignals);
    if (!rec) return;
    var dialog = document.getElementById("load-signals-dialog");
    if (dialog.open) return;
    senalamientosEdicion_ = {
      load: String(rec.load),
      original: (rec.logistics_signals || []).slice(),
      opener: button,
      readonly: !["admin", "csr"].includes(
        window.panelApi.profile && window.panelApi.profile.role,
      ),
      busy: false,
    };
    document.getElementById("load-signals-title").textContent =
      "Señalamientos · Carga " + rec.load;
    document.getElementById("load-signals-options").innerHTML =
      window.panelSignals.signalOptions(rec.logistics_signals || []);
    document.getElementById("load-signals-error").hidden = true;
    actualizarSelectorSenalamientos_();
    dialog.showModal();
  }
  function clicSenalamientosCarga_(event) {
    var open = event.target.closest("[data-load-signals]");
    if (open) {
      abrirSenalamientosCarga_(open);
      return;
    }
    var cancel = event.target.closest("[data-signals-cancel]");
    if (cancel) {
      cerrarSenalamientosCarga_();
      return;
    }
    var clear = event.target.closest("[data-signals-clear]");
    if (clear) {
      if (
        !senalamientosEdicion_ ||
        senalamientosEdicion_.busy ||
        senalamientosEdicion_.readonly
      )
        return;
      document
        .querySelectorAll("[data-signal-option]")
        .forEach(function (input) {
          input.checked = false;
        });
      actualizarSelectorSenalamientos_();
      return;
    }
    if (!event.target.closest("[data-signals-save]")) return SIGUE_;
    var editing = senalamientosEdicion_;
    if (!editing || editing.busy || editing.readonly) return;
    var values = opcionesSenalamientos_();
    var error = document.getElementById("load-signals-error");
    function fail(err) {
      editing.busy = false;
      actualizarSelectorSenalamientos_();
      error.textContent =
        (err && err.message) || "No se pudieron guardar los señalamientos";
      error.hidden = false;
    }
    try {
      values = window.panelSignals.validateLogisticsSignals(values);
    } catch (err) {
      fail(err);
      return;
    }
    error.hidden = true;
    editing.busy = true;
    actualizarSelectorSenalamientos_();
    // Esperar confirmación evita mostrar iconos como guardados si hubo un rechazo o desconexión.
    guardarConVerificacion_(function (result) {
      if (
        !result ||
        JSON.stringify(result.logistics_signals) !== JSON.stringify(values)
      ) {
        fail(
          new Error(
            "No se confirmó el guardado. Cierra esta ventana y actualiza el panel.",
          ),
        );
        return;
      }
      var rec = recPorLoad_(editing.load);
      if (rec) Object.assign(rec, result);
      editing.busy = false;
      render(currentData);
      if (workspaceCurrentLoad === editing.load) renderWorkspace();
      cerrarSenalamientosCarga_();
      showToast(
        values.length ? "Señalamientos guardados" : "Señalamientos retirados",
        "good",
      );
    }, fail).setSenalamientosCarga(editing.load, values, editing.original);
    return;
  }
  function wireSignalDialogOnce_() {
    var dialog = document.getElementById("load-signals-dialog");
    dialog.addEventListener("keydown", function (event) {
      if (event.key === "Escape") event.stopPropagation(); // Conservar el detalle abierto debajo.
    });
    dialog.addEventListener("cancel", function (event) {
      if (senalamientosEdicion_ && senalamientosEdicion_.busy)
        event.preventDefault();
    });
    dialog.addEventListener("close", function () {
      var previous = senalamientosEdicion_;
      senalamientosEdicion_ = null;
      if (!previous) return;
      if (previous.opener.isConnected) previous.opener.focus();
      else {
        var replacements = Array.from(
          document.querySelectorAll("[data-load-signals]"),
        );
        var visible = replacements.find(function (button) {
          return (
            button.dataset.loadSignals === previous.load &&
            button.getClientRects().length &&
            !button.closest("[hidden]")
          );
        });
        if (visible) visible.focus();
      }
    });
  }

  function clicWorkspaceYAvisos_(e) {
    var btn;

    var workspaceBtn;
    if ((workspaceBtn = e.target.closest("[data-workspace-load]"))) {
      openLoadWorkspace(workspaceBtn.getAttribute("data-workspace-load"));
      return;
    }

    var docBtn;
    if ((docBtn = e.target.closest("[data-doc-toggle]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          docBtn.click();
        });
        return;
      }
      var docField = docBtn.getAttribute("data-doc-toggle");
      var docLoad = docBtn.getAttribute("data-doc-load");
      var docRec = recPorLoad_(docLoad);
      if (!docRec) return;
      var docNewVal = !docRec[docField];
      var docPrev = {
        val: docRec[docField],
        src: docRec[docField + "_source"],
        by: docRec[docField + "_manual_by"],
        at: docRec[docField + "_manual_at"],
      };
      docRec[docField] = docNewVal;
      docRec[docField + "_source"] = "MANUAL";
      docRec[docField + "_manual_by"] = myRealIdentity;
      docRec[docField + "_manual_at"] = new Date().toISOString();
      render(currentData);
      if (workspaceCurrentLoad === String(docLoad)) renderWorkspace();
      showToast(
        (docNewVal ? "Marcado: " : "Desmarcado: ") +
          (DOC_ITEM_LABELS[docField] || docField) +
          " — Carga " +
          docLoad,
        "good",
      );
      guardarConVerificacion_(null, function (err) {
        docRec[docField] = docPrev.val;
        docRec[docField + "_source"] = docPrev.src;
        docRec[docField + "_manual_by"] = docPrev.by;
        docRec[docField + "_manual_at"] = docPrev.at;
        render(currentData);
        if (workspaceCurrentLoad === String(docLoad)) renderWorkspace();
        showToast(
          "No se pudo guardar: " + (err && err.message ? err.message : err),
          "error",
        );
      }).saveDocItem(docLoad, docField, docNewVal, myRealIdentity, myPassword);
      return;
    }

    var taskButton = e.target.closest("[data-create-task-load]");
    if (taskButton) {
      var taskLoad = taskButton.getAttribute("data-create-task-load");
      ensureLoggedIn(function () {
        openBitacoraModal(null, taskLoad);
      });
      return;
    }

    var notifyBtn;
    if ((notifyBtn = e.target.closest("[data-client-notified-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          notifyBtn.click();
        });
        return;
      }
      var notifyLoad = notifyBtn.getAttribute("data-client-notified-load");
      var notifyRec = recPorLoad_(notifyLoad);
      notifyBtn.disabled = true;
      notifyBtn.textContent = "Guardando…";
      flushPendingFieldSaves(notifyLoad, function () {
        google.script.run
          .withSuccessHandler(function (result) {
            if (!result || result.ok === false) {
              notifyBtn.disabled = false;
              notifyBtn.textContent = "Marcar notificado";
              showToast(
                (result && result.error) ||
                  "No se pudo confirmar la comunicación",
                "error",
              );
              return;
            }
            if (notifyRec) {
              notifyRec.client_notify_pending = false;
              notifyRec.client_notified_at = new Date().toISOString();
              notifyRec.client_notified_by = myRealIdentity;
              notifyRec.client_notify_since = "";
              if (result.recordatorio_fecha)
                notifyRec.recordatorio_fecha = result.recordatorio_fecha;
            }
            render(currentData);
            if (workspaceCurrentLoad === String(notifyLoad)) renderWorkspace();
            showToast(
              "Cliente marcado como notificado — Carga " + notifyLoad,
              "good",
            );
          })
          .withFailureHandler(function (err) {
            notifyBtn.disabled = false;
            notifyBtn.textContent = "Marcar notificado";
            showToast("No se pudo guardar: " + err.message, "error");
          })
          .markClientNotified(notifyLoad, myRealIdentity, myPassword);
      });
      return;
    }
    return SIGUE_;
  }

  /** Clics: copiar load, recordatorios ("Ya revisé", editar) y color de la tarjeta. */
  function clicRecordatoriosYColor_(e) {
    var btn;

    // El número de load (tabla o tarjeta) es para copiar con doble clic — que no se
    // despliegue/contraiga la fila cuando el usuario hace clic (o doble clic) ahí encima.
    if (e.target.closest("[data-load-copy]")) {
      e.stopPropagation();
      return;
    }

    if ((btn = e.target.closest("[data-recordatorio-edit]"))) {
      e.stopPropagation();
      var load = btn.getAttribute("data-recordatorio-edit");
      var status = btn.getAttribute("data-recordatorio-status");
      openRecordatorioModal(load, status, "editar", status, null);
      return;
    }

    // "Ya revisé" (En transito): no abre ningún modal — reinicia el conteo a "ahora +
    // AUTO_REVIEW_HOURS horas" directamente, igual que POD/recargos (optimista, con reversa
    // si falla). Reutiliza saveRecordatorio, la misma función que usa "reprogramar" para los
    // recordatorios manuales — solo cambia la fecha, no el estatus.
    if ((btn = e.target.closest("[data-recordatorio-revisar]"))) {
      e.stopPropagation();
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          btn.dispatchEvent(new Event("click", { bubbles: true }));
        });
        return;
      }
      var load = btn.getAttribute("data-recordatorio-revisar");
      var rec = recPorLoad_(load);
      var prevFecha = rec ? rec.recordatorio_fecha : null;
      var fechaISO = new Date(
        Date.now() + AUTO_REVIEW_HOURS * 60 * 60 * 1000,
      ).toISOString();
      if (rec) rec.recordatorio_fecha = fechaISO;
      render(currentData);
      showToast(
        "Revisión registrada — próxima en " +
          AUTO_REVIEW_HOURS +
          " horas — Carga " +
          load,
        "good",
      );
      guardarConVerificacion_(null, function (err) {
        if (rec) rec.recordatorio_fecha = prevFecha;
        render(currentData);
        showToast("No se pudo guardar: " + err.message, "error");
      }).saveRecordatorio(load, fechaISO, myRealIdentity, myPassword);
      return;
    }

    if ((btn = e.target.closest("[data-set-color-load]"))) {
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          btn.dispatchEvent(new Event("click", { bubbles: true }));
        });
        return;
      }
      var load = btn.getAttribute("data-set-color-load");
      var color = btn.getAttribute("data-color") || "";
      var rec = recPorLoad_(load);
      var prev = rec ? rec.color || "" : "";
      if (prev === color) return; // ya estaba en ese color

      // Igual que POD/recargos: actualización optimista (re-dibuja para pintar la tarjeta/fila
      // de inmediato) y guardado en segundo plano, con reversa si falla.
      if (rec) rec.color = color;
      render(currentData);
      showToast(
        color
          ? "Color asignado — Carga " + load
          : "Color quitado — Carga " + load,
        "good",
      );

      guardarConVerificacion_(null, function (err) {
        if (rec) rec.color = prev;
        render(currentData);
        showToast("No se pudo guardar el color: " + err.message, "error");
      }).saveLoadColor(load, color, myRealIdentity, myPassword);
      return;
    }
    return SIGUE_;
  }

  /** Clics que abren modales o detalles: comentarios, bitácora, incidencias, cierres, cruce y vincular. */
  function clicAbrirModales_(e) {
    var btn;

    // Nota: se distingue por el atributo específico (data-comments-load / -pendiente), no por
    // la clase compartida ".comments-btn" — antes ambos tipos de botón compartían esa clase y
    // el manejador genérico de Loads también se enganchaba en el de un pendiente (llamando
    // openCommentsModal con "undefined"), aparte del suyo propio; con esto cada botón dispara
    // una sola vez la función correcta.
    if ((btn = e.target.closest("[data-comments-load]"))) {
      openCommentsModal(btn.getAttribute("data-comments-load"));
      return;
    }

    if ((btn = e.target.closest("[data-comments-pendiente]"))) {
      openCommentsModal(
        btn.getAttribute("data-comments-pendiente"),
        "pendiente",
      );
      return;
    }

    if ((btn = e.target.closest("[data-open-bitacora-load]"))) {
      abrirLoadDesdeBitacora(btn.getAttribute("data-open-bitacora-load"));
      return;
    }

    if ((btn = e.target.closest("[data-incidencias-load]"))) {
      openIncidenciaModal(btn.getAttribute("data-incidencias-load"));
      return;
    }

    if ((btn = e.target.closest("[data-export-comm-cliente]"))) {
      exportComunicacionesCliente(
        btn.getAttribute("data-export-comm-cliente"),
        btn,
      );
      return;
    }

    if ((btn = e.target.closest("[data-cierre-toggle]"))) {
      var cierreDetail = document.getElementById(
        "cierre-detail-" + btn.getAttribute("data-cierre-toggle"),
      );
      if (cierreDetail) {
        cierreDetail.hidden = !cierreDetail.hidden;
        btn.textContent = cierreDetail.hidden ? "Ver" : "Ocultar";
      }
      return;
    }

    if ((btn = e.target.closest("[data-carga-csr-toggle]"))) {
      var cargaCsrDetail = document.getElementById(
        "carga-csr-detail-" + btn.getAttribute("data-carga-csr-toggle"),
      );
      if (cargaCsrDetail) {
        cargaCsrDetail.hidden = !cargaCsrDetail.hidden;
        btn.textContent = cargaCsrDetail.hidden ? "Ver" : "Ocultar";
      }
      return;
    }

    if ((btn = e.target.closest("[data-cruce-si]"))) {
      var cruceSiLoad = btn.getAttribute("data-cruce-si");
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          confirmarCruce_(cruceSiLoad, true, null);
        });
        return;
      }
      confirmarCruce_(cruceSiLoad, true, null);
      return;
    }
    if ((btn = e.target.closest("[data-cruce-no]"))) {
      var cruceAdjustBox = document.getElementById(
        "cruce-adjust-" + btn.getAttribute("data-cruce-no"),
      );
      if (cruceAdjustBox) cruceAdjustBox.hidden = !cruceAdjustBox.hidden;
      return;
    }
    if ((btn = e.target.closest("[data-cruce-guardar]"))) {
      var cruceGuardarLoad = btn.getAttribute("data-cruce-guardar");
      var cruceInput = document.getElementById(
        "cruce-adjust-input-" + cruceGuardarLoad,
      );
      var cruceNuevaFecha =
        cruceInput && cruceInput.value
          ? cruceInput.value.replace("T", " ")
          : "";
      if (!cruceNuevaFecha) {
        showToast("Selecciona fecha y hora", "error");
        return;
      }
      if (!myRealIdentity || !myPassword) {
        ensureLoggedIn(function () {
          confirmarCruce_(cruceGuardarLoad, false, cruceNuevaFecha);
        });
        return;
      }
      confirmarCruce_(cruceGuardarLoad, false, cruceNuevaFecha);
      return;
    }

    if ((btn = e.target.closest("[data-vincular-pendiente]"))) {
      openVincularModal(btn.getAttribute("data-vincular-pendiente"));
      return;
    }
    return SIGUE_;
  }

  /** Clics: eliminar pendientes/bitácora y editar bitácora. */
  function clicEliminarEditar_(e) {
    var btn;

    if ((btn = e.target.closest("[data-remove-pendiente]"))) {
      var id = btn.getAttribute("data-remove-pendiente");
      idsBorrandose_[id] = true;
      pendientes = pendientes.filter(function (p) {
        return String(p.id) !== String(id);
      });
      renderPendientes();
      accionConDeshacer_(
        "Registro eliminado",
        function () {
          guardarConVerificacion_(
            function () {
              delete idsBorrandose_[id];
              loadPendientes();
            },
            function (err) {
              delete idsBorrandose_[id];
              loadPendientes();
              showToast("No se pudo eliminar: " + err.message, "error");
            },
          ).removePendiente(id, myRealIdentity, myPassword);
        },
        function () {
          delete idsBorrandose_[id];
          loadPendientes();
        },
      );
      return;
    }

    if ((btn = e.target.closest("[data-remove-bitacora]"))) {
      var id = btn.getAttribute("data-remove-bitacora");
      idsBorrandose_[id] = true;
      bitacora = bitacora.filter(function (b) {
        return String(b.id) !== String(id);
      });
      renderBitacora();
      accionConDeshacer_(
        "Pendiente de turno eliminado",
        function () {
          guardarConVerificacion_(
            function () {
              delete idsBorrandose_[id];
              loadBitacora();
            },
            function (err) {
              delete idsBorrandose_[id];
              loadBitacora();
              showToast("No se pudo eliminar: " + err.message, "error");
            },
          ).removeBitacoraTurno(id, myRealIdentity, myPassword);
        },
        function () {
          delete idsBorrandose_[id];
          loadBitacora();
        },
      );
      return;
    }

    if ((btn = e.target.closest("[data-edit-bitacora]"))) {
      var editId = btn.getAttribute("data-edit-bitacora");
      var registro = bitacora.filter(function (x) {
        return String(x.id) === String(editId);
      })[0];
      if (!registro) return;
      ensureLoggedIn(function () {
        openBitacoraModal(registro);
      });
      return;
    }
    return SIGUE_;
  }

  /** Clics en la tabla de Operación completa: celda de comentario y renglón (detalle). */
  function clicTabla_(e) {
    if (e.target.closest("[data-instruction-open],[data-instruction-action]"))
      return;
    var btn;

    if ((btn = e.target.closest("[data-table-select]"))) {
      var selectedLoad = btn.getAttribute("data-table-select");
      if (masivo_.activo) {
        if (masivo_.sel[selectedLoad]) delete masivo_.sel[selectedLoad];
        else masivo_.sel[selectedLoad] = true;
        renderMasivo_();
      } else {
        selectedTableLoad = selectedLoad;
        renderTableDetailPanel();
      }
      return;
    }

    // Modo "Seleccionar varias": el clic en el renglón lo marca o desmarca (no abre el detalle).
    if (masivo_.activo) {
      var filaSel = e.target.closest("#table-body tr.t-row");
      if (filaSel && !e.target.closest("button, a, input, select, textarea")) {
        var lsel = filaSel.getAttribute("data-load");
        if (masivo_.sel[lsel]) delete masivo_.sel[lsel];
        else masivo_.sel[lsel] = true;
        renderMasivo_();
        return;
      }
    }

    // Clic en la celda "Último comentario" del listado: abre directo el modal completo de
    // comentarios de ese load. Antes se abría con hover, pero detectaba mal la zona (a veces
    // mostraba los comentarios de otro load) — un clic con la llave tomada directo de la fila
    // es mucho más confiable. Va antes del manejador genérico de "tr.t-row" para que no se
    // abra también/en su lugar el panel de detalle.
    if ((btn = e.target.closest(".t-comment"))) {
      var tcRow = btn.closest("tr.t-row");
      var tcLoad = tcRow ? tcRow.getAttribute("data-load") : null;
      if (tcLoad) {
        openCommentsModal(tcLoad, "load");
        return;
      }
    }

    if (e.target.closest("[data-instruction-open],[data-instruction-action]"))
      return;
    var row = e.target.closest("tr.t-row");
    if (row) {
      // Los controles conservan su acción propia; los demás datos abren el detalle.
      if (e.target.closest("select, input, button, details, a, label")) return;
      var load = row.getAttribute("data-load");
      selectedTableLoad =
        String(selectedTableLoad) === String(load) ? null : load;
      renderTableDetailPanel();
      if (selectedTableLoad) {
        var panel = document.getElementById("table-detail-panel");
        if (panel)
          panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    return SIGUE_;
  }

  var MANEJADORES_CAMBIO_ = [
    cambioSenalamientosCarga_,
    cambioPendientePuntual_,
    cambioCamposCarga_,
    cambioEstatus_,
    cambioCasillas_,
  ];
  var MANEJADORES_CLIC_ = [
    clicSenalamientosCarga_,
    clicPendientePuntual_,
    clicWorkspaceYAvisos_,
    clicRecordatoriosYColor_,
    clicAbrirModales_,
    clicEliminarEditar_,
    clicTabla_,
  ];
  function despachar_(manejadores, e) {
    for (var i = 0; i < manejadores.length; i++)
      if (manejadores[i](e) !== SIGUE_) return;
  }
  // wireCardEvents() se llamaba antes al final de CADA render() (cada 60s por autoRefresh, y
  // cada vez que se guarda un estatus/POD/recargos/color) y volvía a recorrer TODO el
  // documento —querySelectorAll + addEventListener por cada tarjeta/fila y por cada tipo de
  // campo— para reconectar los eventos desde cero. Con el panel ya lleno de campos editables
  // (truck, trailer, citas, status, POD, recargos, color…) eso significaba miles de listeners
  // creados una y otra vez en cada actualización, y era la causa principal de que el panel se
  // sintiera lento. Ahora los eventos se conectan UNA sola vez (delegados en document, usando
  // e.target.closest para saber a qué campo/tarjeta pertenece el click o change) y siguen
  // funcionando aunque el HTML de las tarjetas/filas se vuelva a dibujar por completo — ya no
  // hace falta "reconectar" nada.
  function wireDelegatedEventsOnce() {
    if (delegatedEventsWired) return;
    delegatedEventsWired = true;
    wireSignalDialogOnce_();

    document.addEventListener("change", function (e) {
      despachar_(MANEJADORES_CAMBIO_, e);
    });
    document.addEventListener("click", function (e) {
      despachar_(MANEJADORES_CLIC_, e);
    });

    document.addEventListener("dblclick", function (e) {
      var el = e.target.closest("[data-load-copy]");
      if (!el) return;
      e.stopPropagation();
      copyLoadToClipboard(el.getAttribute("data-load-copy"));
    });

    var tableDetailClose = document.getElementById("table-detail-close");
    if (tableDetailClose) {
      tableDetailClose.addEventListener("click", function () {
        cerrarDetalleRapido_();
      });
    }
    var detailDialog = document.getElementById("table-detail-dialog");
    function cerrarDetalleRapido_() {
      var previousLoad = String(selectedTableLoad);
      selectedTableLoad = null;
      renderTableDetailPanel();
      // Un guardado puede sustituir la fila que abrió el diálogo: recuperar su botón vigente.
      document
        .querySelectorAll("[data-table-select]")
        .forEach(function (button) {
          if (button.getAttribute("data-table-select") === previousLoad)
            button.focus();
        });
    }
    detailDialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      cerrarDetalleRapido_();
    });
    detailDialog.addEventListener("click", function (event) {
      if (event.target === detailDialog) cerrarDetalleRapido_();
    });
    // Liberar la capa modal antes de abrir el expediente, comentarios o una tarea.
    document.addEventListener(
      "click",
      function (event) {
        if (!detailDialog.open || !detailDialog.contains(event.target)) return;
        if (
          event.target.closest(
            "[data-workspace-load],[data-comments-load],[data-incidencias-load],[data-create-task-load],[data-recordatorio-edit]",
          )
        ) {
          cerrarDetalleRapido_();
        }
      },
      true,
    );
  }

  function wireCardEvents() {
    wireDelegatedEventsOnce();
  }

  // ---- Importación: CSV/XLSX incluidos y compatibilidad .xls con SheetJS ----

  var xlsxLoadPromise = null;
  function ensureXlsxLoaded() {
    if (xlsxLoadPromise) return xlsxLoadPromise;
    xlsxLoadPromise = new Promise(function (resolve, reject) {
      if (window.XLSX) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        xlsxLoadPromise = null;
        reject(
          new Error(
            "No se pudo cargar la librería de Excel (revisa tu conexión)",
          ),
        );
      };
      document.head.appendChild(s);
    });
    return xlsxLoadPromise;
  }

  /** Compatibilidad con .xls: conserva SheetJS solo para el formato antiguo. */
  async function readLegacyExcelRows(file) {
    await ensureXlsxLoaded();
    var workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: true,
    });
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
      header: 1,
      raw: true,
      defval: null,
    });
  }

  var importReadController_ = null;
  document
    .getElementById("file-input")
    .addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      if (importReadController_) importReadController_.abort();
      var controller = new AbortController();
      importReadController_ = controller;
      var statusEl = document.getElementById("import-status");
      var cancelRead = document.createElement("button");
      cancelRead.type = "button";
      cancelRead.className = "ws-btn";
      cancelRead.textContent = "Cancelar lectura";
      cancelRead.onclick = function () {
        controller.abort();
      };
      statusEl.after(cancelRead);
      statusEl.textContent = "Leyendo archivo…";
      statusEl.className = "import-status";

      // Leer el archivo completo antes de pedir la vista previa. No se escribe al seleccionar.
      e.target.value = "";
      window.panelFiles
        .parseLoadFile(file, readLegacyExcelRows, {
          signal: controller.signal,
          onProgress: function (message) {
            statusEl.textContent = message;
          },
        })
        .finally(function () {
          cancelRead.remove();
          if (importReadController_ === controller)
            importReadController_ = null;
        })
        .then(function (records) {
          try {
            if (!records.length) {
              statusEl.textContent =
                "No se encontraron cargas con número de load en este archivo.";
              statusEl.className = "import-status err";
              return;
            }

            // Vista previa: el servidor calcula qué va a cambiar SIN escribir nada (previewImport) y
            // se pide confirmación antes de guardar (importLoads). Antes se guardaba de inmediato.
            var guardarImportacion = function () {
              statusEl.textContent = "Guardando " + records.length + " cargas…";
              statusEl.className = "import-status";
              google.script.run
                .withSuccessHandler(function (result) {
                  if (result && result.ok === false) {
                    statusEl.textContent =
                      "No se importó: " +
                      (result.error || "el servidor rechazó el archivo");
                    statusEl.className = "import-status err";
                    return;
                  }
                  var msg =
                    "Listo: " +
                    result.inserted +
                    " nuevas, " +
                    result.updated +
                    " actualizadas" +
                    (result.unchanged
                      ? ", " + result.unchanged + " sin cambios"
                      : "") +
                    ".";
                  if (result.skipped)
                    msg +=
                      " (" +
                      result.skipped +
                      " sin número de load, se ignoraron)";
                  statusEl.textContent = msg;
                  statusEl.className = "import-status ok";
                  lastImportAt = new Date().toISOString();
                  renderOperationMeta();
                  loadData();
                })
                .withFailureHandler(function (err) {
                  statusEl.textContent = "Error al guardar: " + err.message;
                  statusEl.className = "import-status err";
                })
                .importLoads(records, adminCred_());
            };
            statusEl.textContent = "Revisando el archivo…";
            google.script.run
              .withSuccessHandler(function (p) {
                if (!p || p.ok === false) {
                  statusEl.textContent =
                    "No se pudo revisar el archivo: " +
                    ((p && p.error) || "error desconocido");
                  statusEl.className = "import-status err";
                  return;
                }
                statusEl.textContent = "Esperando tu confirmación…";
                var html =
                  "<ul>" +
                  "<li><b>" +
                  esc(p.inserted) +
                  "</b> " +
                  (p.inserted === 1 ? "carga nueva" : "cargas nuevas") +
                  "</li>" +
                  "<li><b>" +
                  esc(p.updated) +
                  "</b> con cambios" +
                  (p.citasMovidas
                    ? " (<b>" +
                      esc(p.citasMovidas) +
                      "</b> con cita movida — " +
                      (p.citasMovidas === 1
                        ? "quedará pendiente"
                        : "quedarán pendientes") +
                      " de avisar al cliente)"
                    : "") +
                  "</li>" +
                  "<li><b>" +
                  esc(p.unchanged) +
                  "</b> sin cambios</li>" +
                  (p.skipped
                    ? "<li><b>" +
                      esc(p.skipped) +
                      "</b> filas sin número de load (se ignoran)</li>"
                    : "") +
                  "</ul>" +
                  (p.clientesSinCsr && p.clientesSinCsr.length
                    ? '<p class="aviso-fuerte">Clientes sin CSR asignado (sus cargas no le aparecerán a ningún CSR): ' +
                      p.clientesSinCsr.map(esc).join(", ") +
                      '. Asígnalos en "Gestionar CSR".</p>'
                    : "") +
                  (p.duplicadosEnArchivo && p.duplicadosEnArchivo.length
                    ? '<p class="aviso-fuerte">Cargas repetidas en el archivo (se queda el último): ' +
                      p.duplicadosEnArchivo.map(esc).join(", ") +
                      "</p>"
                    : "") +
                  '<p>Si después necesitas regresar, en "Gestionar CSR" puedes deshacer la última importación.</p>';
                confirmarModal_(
                  "Importar " + records.length + " cargas",
                  html,
                  "Importar",
                  guardarImportacion,
                );
                // Si se cierra sin confirmar, que la barra no se quede diciendo "Esperando…".
                var limpiarSiCancela = function () {
                  if (
                    !document
                      .getElementById("confirmar-backdrop")
                      .classList.contains("show")
                  ) {
                    if (statusEl.textContent === "Esperando tu confirmación…") {
                      statusEl.textContent = "Importación cancelada.";
                      statusEl.className = "import-status";
                    }
                  } else setTimeout(limpiarSiCancela, 500);
                };
                setTimeout(limpiarSiCancela, 500);
              })
              .withFailureHandler(function (err) {
                statusEl.textContent =
                  "No se pudo revisar el archivo: " + err.message;
                statusEl.className = "import-status err";
              })
              .previewImport(records, csrAdminPw);
          } catch (err) {
            statusEl.textContent = "Error al leer el archivo: " + err.message;
            statusEl.className = "import-status err";
          }
        })
        .catch(function (err) {
          // Una lectura inválida termina aquí, antes de consultar o guardar cargas.
          statusEl.textContent = err.message;
          statusEl.className = "import-status err";
          e.target.value = "";
        });
    });

  var lastLoadsFetchTs = null;

  /** Combina el resultado de getLoadsDelta() con lo que el panel ya tenía en memoria (current).
   * result.full === true cuando el servidor decidió mandar todo de una vez (primera carga del
   * panel, hoja vacía, o demasiados cambios de golpe — ver getLoadsDelta en Code.gs): en ese caso
   * se usa result.loads tal cual, igual que la vieja getLoads(). Si no, se parte de lo que ya
   * había en el navegador, se reemplazan solo las cargas listadas en result.updated (por número
   * de load) y se quita cualquier carga que ya no aparezca en result.currentLoads (por ejemplo,
   * porque se archivó) — una carga que no cambió jamás se toca ni se vuelve a pedir. */
  function mergeLoadsDelta_(current, result) {
    if (!result || result.full) return (result && result.loads) || [];
    var byLoad = Object.create(null);
    (current || []).forEach(function (r) {
      byLoad[String(r.load)] = r;
    });
    (result.updated || []).forEach(function (r) {
      byLoad[String(r.load)] = r;
    });
    var keep = Object.create(null);
    (result.currentLoads || []).forEach(function (k) {
      keep[k] = true;
    });
    return Object.keys(byLoad)
      .filter(function (k) {
        return keep[k];
      })
      .map(function (k) {
        return byLoad[k];
      });
  }

  // FIX: seguridad — getLoadsDelta ahora exige sesión y sin ella responde { ok:false, loads:[] }.
  // Ese "vacío" NO debe pintarse encima de lo que ya hay (una respuesta sin sesión que llega tarde,
  // después del login, borraría las cargas de la pantalla). Si ya había sesión y el servidor la
  // rechaza (token vencido o contraseña cambiada en otra computadora), se manda de vuelta al login.
  function respuestaSinSesion_(result) {
    if (!result || result.ok !== false) return false;
    if (myRealIdentity) {
      logout();
      showToast("Tu sesión expiró. Vuelve a iniciar sesión.", "error");
    }
    return true;
  }

  function loadData() {
    if (!myRealIdentity || !myPassword) return; // sin sesión no hay nada que pedir — ver verifyIdentity
    google.script.run
      .withSuccessHandler(function (result) {
        if (respuestaSinSesion_(result)) return;
        lastLoadsFetchTs =
          result && typeof result.ts === "number" ? result.ts : Date.now();
        render(mergeLoadsDelta_(currentData, result));
      })
      .withFailureHandler(function (err) {
        document.getElementById("header-updated").textContent =
          "Error al cargar: " + err.message;
      })
      .getLoadsDelta(lastLoadsFetchTs, myRealIdentity, myPassword);
  }

  // ===== Auto-actualización =====
  // El panel no se sincroniza solo entre navegadores — sin esto, si alguien más entra un
  // comentario o cambia un estatus, el resto del equipo no lo ve hasta que recargue la
  // página a mano. Con esto, cada quien recibe los cambios de los demás automáticamente,
  // sin tener que darle F5. No interrumpe si justo estás escribiendo en un campo (ETA,
  // comentario), para no perderte lo que llevas escrito a medio terminar.
  //
  // Todo el refresco es UNA sola llamada (getPanelCambios en Code.gs): el panel manda la "marca"
  // que ya conoce de cada área (loads, comentarios, pendientes, bitácora, apartados, cierres,
  // personas) y el servidor regresa solo los datos de las áreas que cambiaron. Si nadie tocó nada
  // (lo más común) regresa solo las marcas. Antes eran hasta 9 llamadas cada vez que alguien del
  // equipo cambiaba cualquier cosa. Loads, además, llega en modo incremental (getLoadsDelta).
  // Con la pestaña oculta se pregunta cada 5 min en vez de cada minuto; al volver, al instante.
  var AUTO_REFRESH_MS = 60000; // cada 60s
  var AUTO_REFRESH_OCULTO_MS = 300000; // cada 5 min con la pestaña oculta
  var autoRefreshBusy = false;
  var marcasConocidas_ = {};
  var ultimoRefresco_ = 0;
  var fallasSeguidas_ = 0;

  function isUserEditingField() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return false;
    return !!(
      el.closest(".card,.workspace-panel,.organize-dialog") ||
      el.closest("#table-body") ||
      el.closest(".t-detail-content") ||
      el.id === "comments-textarea"
    );
  }

  /** Aplica lo que regresó getPanelCambios: cada área con su misma función de siempre. */
  function aplicarCambiosPanel_(res) {
    var d = res.datos || {};
    if (d.loads) {
      if (respuestaSinSesion_(d.loads)) return;
      lastLoadsFetchTs =
        typeof d.loads.ts === "number" ? d.loads.ts : Date.now();
      render(mergeLoadsDelta_(currentData, d.loads));
    }
    if (d.personas) aplicarPersonas_(d.personas);
    if (d.asignaciones) aplicarAsignaciones_(d.asignaciones);
    if (d.seguimientos) aplicarSeguimientos_(d.seguimientos);
    if (d.comentarios) aplicarComentarios_(d.comentarios);
    if (d.pendientes) aplicarPendientes_(d.pendientes);
    if (d.bitacora) aplicarBitacora_(d.bitacora);
    if (d.apartados) aplicarApartados_(d.apartados);
    if (d.cierres) aplicarCierres_(d.cierres);
    if (d.avisos) {
      serverAlerts_ = d.avisos;
      programarAvisos_();
    }
    marcasConocidas_ = res.marcas || {};
  }

  /** forzar = traer todo (login, botón de actualizar) aunque estés escribiendo en un campo. */
  function autoRefresh(forzar) {
    if (!myRealIdentity || !myPassword) return;
    if (autoRefreshBusy || (forzar !== true && isUserEditingField())) return;
    if (
      forzar !== true &&
      document.hidden &&
      Date.now() - ultimoRefresco_ < AUTO_REFRESH_OCULTO_MS
    )
      return;
    if (forzar === true) marcasConocidas_ = {};
    autoRefreshBusy = true;
    ultimoRefresco_ = Date.now();
    var quien = myRealIdentity;
    google.script.run
      .withSuccessHandler(function (res) {
        autoRefreshBusy = false;
        marcarConexion_(true);
        if (quien !== myRealIdentity) return; // cambió la sesión mientras tanto
        if (!res || res.ok === false) {
          respuestaSinSesion_({ ok: false });
          return;
        }
        aplicarCambiosPanel_(res);
      })
      .withFailureHandler(function () {
        autoRefreshBusy = false; // si falla por algo transitorio, se reintenta solo en el siguiente ciclo
        marcarConexion_(false);
      })
      .getPanelCambios(
        marcasConocidas_,
        lastLoadsFetchTs,
        myRealIdentity,
        myPassword,
      );
  }

  /** Aviso "Sin conexión" en el encabezado: aparece después de 2 fallas seguidas del refresco (una
   * sola puede ser algo pasajero) y se quita solo en cuanto el servidor vuelve a responder. */
  function marcarConexion_(bien) {
    fallasSeguidas_ = bien ? 0 : fallasSeguidas_ + 1;
    var el = document.getElementById("conexion-aviso");
    if (el) el.hidden = fallasSeguidas_ < 2;
  }

  // ===== Búsqueda global (Inicio) =====
  // Busca en load, cliente, trailer, truck, WO, estatus, ciudades, notas y último comentario de
  // las cargas de tu alcance, y muestra los resultados ahí mismo (antes copiaba el texto al
  // buscador de "Operación completa", que estaba oculto, y no se veía nada).
  function camposBusqueda_(r) {
    var lc = ultimosComentarios[String(r.load)];
    return [
      ["Load", r.load],
      ["Cliente", r.customer],
      ["Trailer", r.trailer],
      ["Unidad", r.truck],
      ["WO", r.work_order],
      ["Estatus", r.status],
      ["Origen", r.origin_city],
      ["Destino", r.dest_city],
      ["Nota ETA", r.eta_note],
      ["Próxima revisión", r.next_review_note],
      ["Pendiente de avisar", r.client_notify_reason],
      ["Comentario", lc && lc.text],
    ];
  }
  function textoBusqueda_(r) {
    return camposBusqueda_(r)
      .map(function (c) {
        return c[1] || "";
      })
      .join(" ");
  }
  function marcar_(texto, q) {
    var s = String(texto),
      i = s.toLowerCase().indexOf(q);
    if (i < 0) return esc(s);
    return (
      esc(s.slice(0, i)) +
      "<mark>" +
      esc(s.slice(i, i + q.length)) +
      "</mark>" +
      esc(s.slice(i + q.length))
    );
  }
  var busquedaActiva_ = -1;
  function cerrarBusqueda_() {
    document.getElementById("home-search-resultados").hidden = true;
    var input = document.getElementById("home-search");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    busquedaActiva_ = -1;
  }
  function buscarGlobal_() {
    var input = document.getElementById("home-search"),
      box = document.getElementById("home-search-resultados");
    var q = input.value.trim().toLowerCase();
    busquedaActiva_ = -1;
    if (q.length < 2) {
      cerrarBusqueda_();
      box.innerHTML = "";
      return;
    }
    var res = [];
    actionCenterScope(currentData).forEach(function (r) {
      var hit = camposBusqueda_(r).filter(function (c) {
        return c[1] && String(c[1]).toLowerCase().indexOf(q) !== -1;
      })[0];
      if (hit) res.push({ r: r, campo: hit });
    });
    var html = res
      .slice(0, 8)
      .map(function (x, i) {
        var r = x.r,
          c = x.campo;
        return (
          '<button type="button" class="search-item" role="option" data-search-load="' +
          esc(r.load) +
          '" id="global-search-result-' +
          i +
          '" aria-selected="false" data-idx="' +
          i +
          '">' +
          "<b>Carga " +
          marcar_(r.load, q) +
          "</b> · " +
          marcar_(r.customer || "Sin cliente", q) +
          "<small>" +
          esc(c[0]) +
          ": " +
          marcar_(String(c[1]).slice(0, 140), q) +
          (r.status ? " · " + esc(r.status) : "") +
          "</small></button>"
        );
      })
      .join("");
    box.innerHTML = res.length
      ? html +
        '<button type="button" class="search-todos" data-search-todos>Ver los ' +
        esc(res.length) +
        " resultados en Operación completa ›</button>"
      : '<div class="avisos-vacio">Nada coincide con "' +
        esc(input.value.trim()) +
        '" en tus cargas.</div>';
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.removeAttribute("aria-activedescendant");
  }
  (function () {
    var input = document.getElementById("home-search"),
      box = document.getElementById("home-search-resultados");
    if (!input || !box) return;
    input.addEventListener("input", buscarGlobal_);
    input.addEventListener("focus", function () {
      if (input.value.trim().length >= 2) buscarGlobal_();
    });
    input.addEventListener("keydown", function (e) {
      var items = box.querySelectorAll(".search-item");
      if (e.key === "Escape") {
        cerrarBusqueda_();
        return;
      }
      if (box.hidden || !items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        busquedaActiva_ =
          busquedaActiva_ < 0
            ? e.key === "ArrowDown"
              ? 0
              : items.length - 1
            : (busquedaActiva_ +
                (e.key === "ArrowDown" ? 1 : -1) +
                items.length) %
              items.length;
        items.forEach(function (it, i) {
          it.classList.toggle("activo", i === busquedaActiva_);
          it.setAttribute("aria-selected", String(i === busquedaActiva_));
        });
        input.setAttribute("aria-activedescendant", items[busquedaActiva_].id);
        items[busquedaActiva_].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        items[Math.max(0, busquedaActiva_)].click();
      }
    });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-search-load]");
      if (b) {
        cerrarBusqueda_();
        openLoadWorkspace(b.getAttribute("data-search-load"), "operacion");
        return;
      }
      if (e.target.closest("[data-search-todos]")) {
        cerrarBusqueda_();
        var main = document.getElementById("search");
        main.value = input.value.trim();
        marcarFiltroOperacion_("all"); // resultados de búsqueda: en todas las cargas, no solo "Activas"
        showMainPage("operation");
        main.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".home-global-search")) cerrarBusqueda_();
    });
  })();

  // ===== Comentarios rápidos =====
  var COMENTARIOS_RAPIDOS_ = [
    "Unidad en frontera",
    "Esperando documentos",
    "Cliente confirmó cita",
    "Operador en camino a planta",
    "Unidad cargada",
    "Cruce realizado",
    "Llegó a planta",
    "En espera de descarga",
    "Se envió POD al cliente",
  ];
  function pintarComentariosRapidos_() {
    if (!COMENTARIOS_RAPIDOS_) return;
    document.querySelectorAll(".quick-comments").forEach(function (box) {
      if (box.childElementCount) return;
      box.innerHTML = COMENTARIOS_RAPIDOS_.map(function (t) {
        return (
          '<button type="button" class="quick-comment" data-quick-text="' +
          esc(t) +
          '">' +
          esc(t) +
          "</button>"
        );
      }).join("");
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-quick-text]");
    if (!b) return;
    var ta = document.getElementById(
      b.closest(".quick-comments").getAttribute("data-quick-target"),
    );
    if (!ta || ta.disabled) return;
    var t = b.getAttribute("data-quick-text");
    ta.value = ta.value.trim() ? ta.value.trim() + ". " + t : t;
    ta.focus();
  });
  pintarComentariosRapidos_();

  // ===== Clientes sin CSR asignado =====
  // Si llega en el Excel un cliente que nadie tiene asignado, sus cargas no le aparecen a ningún
  // CSR. Se muestra a Supervisor y Seguimiento (que ven todo) para que alguien lo asigne.
  function clientesSinCsr_() {
    var asignados = Object.create(null);
    asignaciones.forEach(function (a) {
      asignados[
        String(a.cliente || "")
          .trim()
          .toLowerCase()
      ] = true;
    });
    var porCliente = Object.create(null);
    currentData.forEach(function (r) {
      if (
        isArchived(r) ||
        isCanceladaFinalizada(r) ||
        isCancelledStatus(r.status)
      )
        return;
      var c = String(r.customer || "").trim();
      if (!c || asignados[c.toLowerCase()]) return;
      porCliente[c] = (porCliente[c] || 0) + 1;
    });
    return Object.keys(porCliente)
      .sort()
      .map(function (c) {
        return { cliente: c, cargas: porCliente[c] };
      });
  }
  function puedeVerTodo_() {
    var rol = myRole();
    return rol === "Supervisor" || rol === "Seguimiento";
  }
  function renderSinCsr_() {
    var section = document.getElementById("group-sin-csr"),
      box = document.getElementById("home-sin-csr");
    if (!section || !box) return;
    var lista = puedeVerTodo_() ? clientesSinCsr_() : [];
    section.hidden = !lista.length;
    document.getElementById("home-sin-csr-count").textContent =
      lista.length + (lista.length === 1 ? " cliente" : " clientes");
    box.innerHTML = lista
      .map(function (x) {
        return (
          '<div class="home-mini-row"><span class="hm-load">' +
          esc(x.cliente) +
          '</span><span class="hm-soft">' +
          esc(x.cargas) +
          (x.cargas === 1 ? " carga activa" : " cargas activas") +
          '</span><span class="hm-soft">Nadie la ve en su panel</span><button class="ws-btn" data-asignar-csr>Asignar</button></div>'
        );
      })
      .join("");
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-asignar-csr]")) openCsrPasswordGate();
  });

  // ===== Mensaje a cliente para varias cargas =====
  var multiMsgEditado_ = false;
  function multiMsgLoads_(cliente) {
    return computeActiveJourney(currentData).active.filter(function (r) {
      return String(r.customer || "") === cliente;
    });
  }
  function abrirMultiMsg_(clientePre) {
    if (PANEL_CONFIG.INTERNAL_ONLY) return;
    var activas = computeActiveJourney(currentData).active,
      clientes = {};
    activas.forEach(function (r) {
      if (r.customer)
        clientes[r.customer] =
          (clientes[r.customer] || 0) + (r.client_notify_pending ? 1 : 0);
    });
    var nombres = Object.keys(clientes).sort();
    if (!nombres.length) {
      showToast("No tienes cargas activas", "error");
      return;
    }
    if (!clientePre)
      clientePre =
        nombres.filter(function (c) {
          return clientes[c] > 0;
        })[0] || nombres[0];
    document.getElementById("multimsg-cliente").innerHTML = nombres
      .map(function (c) {
        return (
          '<option value="' +
          esc(c) +
          '"' +
          (c === clientePre ? " selected" : "") +
          ">" +
          esc(c) +
          (clientes[c] ? " (" + clientes[c] + " sin avisar)" : "") +
          "</option>"
        );
      })
      .join("");
    renderMultiMsgLoads_();
    document.getElementById("multimsg-backdrop").classList.add("show");
  }
  function renderMultiMsgLoads_() {
    var cliente = document.getElementById("multimsg-cliente").value;
    var lista = multiMsgLoads_(cliente);
    var hayPendientes = lista.some(function (r) {
      return r.client_notify_pending;
    });
    document.getElementById("multimsg-loads").innerHTML =
      lista
        .map(function (r) {
          var marcado = hayPendientes ? !!r.client_notify_pending : true;
          return (
            '<label><input type="checkbox" data-multimsg-load="' +
            esc(r.load) +
            '"' +
            (marcado ? " checked" : "") +
            ">" +
            "<b>Carga " +
            esc(r.load) +
            '</b><span class="hm-soft">' +
            esc(r.status || "Sin estatus") +
            " · " +
            esc(titleCity(r.origin_city)) +
            " → " +
            esc(titleCity(r.dest_city)) +
            (r.client_notify_pending
              ? ' · <span style="color:var(--warn)">sin avisar</span>'
              : "") +
            "</span></label>"
          );
        })
        .join("") ||
      '<div class="avisos-vacio">Este cliente no tiene cargas activas.</div>';
    multiMsgEditado_ = false;
    generarMultiMsg_();
  }
  function multiMsgSeleccion_() {
    return [].slice
      .call(document.querySelectorAll("[data-multimsg-load]:checked"))
      .map(function (c) {
        return recPorLoad_(c.getAttribute("data-multimsg-load"));
      })
      .filter(Boolean);
  }
  function generarMultiMsg_() {
    if (multiMsgEditado_) return;
    var sel = multiMsgSeleccion_();
    var lineas = sel.map(function (r) {
      var ent = pd(r.delivery_appt);
      return (
        "• Carga " +
        r.load +
        " — " +
        (r.status || "En proceso") +
        " — " +
        titleCity(r.origin_city) +
        " → " +
        titleCity(r.dest_city) +
        (ent && !isNaN(ent.getTime())
          ? " — Cita de entrega: " + fmtDateTime(ent)
          : "") +
        (r.tracking_link ? "\n  Seguimiento: " + r.tracking_link : "")
      );
    });
    document.getElementById("multimsg-texto").value = sel.length
      ? "Buen día, les compartimos la actualización de sus cargas:\n\n" +
        lineas.join("\n") +
        "\n\nQuedamos atentos."
      : "";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-abrir-multi-msg]");
    if (b) abrirMultiMsg_();
  });
  document
    .getElementById("multimsg-cliente")
    .addEventListener("change", renderMultiMsgLoads_);
  document
    .getElementById("multimsg-loads")
    .addEventListener("change", generarMultiMsg_);
  document
    .getElementById("multimsg-texto")
    .addEventListener("input", function () {
      multiMsgEditado_ = true;
    });
  document
    .getElementById("multimsg-cerrar")
    .addEventListener("click", function () {
      document.getElementById("multimsg-backdrop").classList.remove("show");
    });
  document
    .getElementById("multimsg-backdrop")
    .addEventListener("click", function (e) {
      if (e.target.id === "multimsg-backdrop")
        e.target.classList.remove("show");
    });
  document
    .getElementById("multimsg-canal")
    .addEventListener("change", function (e) {
      document.getElementById("multimsg-abrir").textContent =
        e.target.value === "Email" ? "Abrir en correo" : "Abrir en WhatsApp";
    });
  document
    .getElementById("multimsg-copiar")
    .addEventListener("click", function () {
      var t = document.getElementById("multimsg-texto").value;
      if (t.trim()) copyTextGeneric(t, "Mensaje copiado");
    });
  document
    .getElementById("multimsg-abrir")
    .addEventListener("click", function () {
      var t = document.getElementById("multimsg-texto").value;
      if (!t.trim()) return;
      var canal = document.getElementById("multimsg-canal").value;
      window.open(
        canal === "Email"
          ? "mailto:?subject=" +
              encodeURIComponent("Actualización de sus cargas") +
              "&body=" +
              encodeURIComponent(t)
          : "https://wa.me/?text=" + encodeURIComponent(t),
        "_blank",
        "noopener",
      );
    });
  document
    .getElementById("multimsg-registrar")
    .addEventListener("click", function () {
      var sel = multiMsgSeleccion_(),
        texto = document.getElementById("multimsg-texto").value.trim(),
        canal = document.getElementById("multimsg-canal").value;
      if (!sel.length || !texto) {
        showToast("Elige al menos una carga y escribe el mensaje", "error");
        return;
      }
      var btn = this;
      btn.disabled = true;
      var hechos = 0,
        fallas = [];
      var siguiente = function (i) {
        if (i >= sel.length) {
          btn.disabled = false;
          render(currentData);
          if (fallas.length)
            showToast(
              "Se registraron " + hechos + "; fallaron: " + fallas.join(", "),
              "error",
            );
          else {
            showToast(
              "Aviso registrado en " +
                hechos +
                (hechos === 1 ? " carga" : " cargas"),
              "good",
            );
            document
              .getElementById("multimsg-backdrop")
              .classList.remove("show");
          }
          return;
        }
        var r = sel[i];
        guardarConVerificacion_(
          function (res) {
            hechos++;
            if (res && res.recordatorio_fecha)
              r.recordatorio_fecha = res.recordatorio_fecha;
            r.client_notify_pending = false;
            r.client_notify_reason = "";
            r.client_notify_since = "";
            r.client_notified_at = new Date().toISOString();
            r.client_notified_by = myRealIdentity;
            siguiente(i + 1);
          },
          function () {
            fallas.push(r.load);
            siguiente(i + 1);
          },
        ).registrarComunicacionCliente(
          r.load,
          canal,
          "Actualización de varias cargas",
          myRealIdentity,
          myPassword,
        ); // solo qué fue, no el texto
      };
      siguiente(0);
    });

  // ===== Calendario de la semana =====
  var calTipo_ = "all",
    calCliente_ = ""; // Filtros locales, independientes del listado de Cargas.
  var calDiasAbiertos_ = new Set(); // Conserva el despliegue durante la actualización automática.
  var calSemana_ = 0; // 0 = esta semana, -1 la anterior, +1 la siguiente
  var calVista_ = "agenda",
    calVistaCuenta_ = null;

  /** Preferencia por cuenta y navegador; no modifica registros ni filtros. */
  function calVistaKey_() {
    return "bajio_cal_view_" + (myRealIdentity || "sin-sesion");
  }
  function actualizarVistaCalendario_() {
    var key = calVistaKey_();
    if (calVistaCuenta_ !== key) {
      calVistaCuenta_ = key;
      calVista_ = "agenda";
      try {
        var saved = localStorage.getItem(key);
        if (["agenda", "week", "list"].indexOf(saved) !== -1) calVista_ = saved;
      } catch (e) {}
    }
    document.getElementById("cal-grid").dataset.view = calVista_;
    document.querySelectorAll("[data-cal-view]").forEach(function (button) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.calView === calVista_),
      );
    });
    document.getElementById("cal-view-help").textContent = {
      agenda:
        "Agenda por día: muestra tres movimientos y permite desplegar los demás.",
      week: "Semana en columnas: compara los días y despliega los movimientos restantes. En pantallas pequeñas, los días se acomodan en menos columnas.",
      list: "Lista compacta: muestra todos los movimientos por día y hora, sin desplegables. Pulsa un registro para abrirlo.",
    }[calVista_];
  }
  function lunesDe_(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function renderCalendario_() {
    var grid = document.getElementById("cal-grid");
    if (!grid) return;
    actualizarVistaCalendario_();
    var inicio = lunesDe_(new Date());
    inicio.setDate(inicio.getDate() + calSemana_ * 7);
    var dias = [],
      porDia = {};
    for (var i = 0; i < 7; i++) {
      var d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      dias.push(d);
      porDia[d.toDateString()] = [];
    }
    var scope = actionCenterScope(currentData);
    scope.forEach(function (r) {
      if (isCancelledStatus(r.status)) return;
      [
        ["pickup", r.pickup_appt, "Pickup"],
        ["cruce", r.cruce_usa_fecha, "Cruce"],
        ["entrega", r.delivery_appt, "Entrega"],
      ].forEach(function (ev) {
        var f = pd(ev[1]);
        if (!f || isNaN(f.getTime())) return;
        var k = new Date(
          f.getFullYear(),
          f.getMonth(),
          f.getDate(),
        ).toDateString();
        if (porDia[k])
          porDia[k].push({
            tipo: ev[0],
            etiqueta: ev[2],
            fecha: f,
            r: r,
            customer: r.customer || "",
          });
      });
    });
    // Loads apartados activos: cruce, entrega en destino y la fecha de mi carga.
    apartados.forEach(function (ap) {
      if (apartadoCerrado_(ap)) return;
      [
        [ap.fecha_cruce, "Cruce apartado"],
        [ap.fecha_entrega, "Entrega apartado"],
        [ap.fecha_mi_carga, "Mi carga (apartado)"],
      ].forEach(function (ev) {
        var f = pd(ev[0]);
        if (!f || isNaN(f.getTime())) return;
        var k = new Date(
          f.getFullYear(),
          f.getMonth(),
          f.getDate(),
        ).toDateString();
        if (porDia[k])
          porDia[k].push({
            tipo: "apartado",
            etiqueta: ev[1],
            fecha: f,
            ap: ap,
            customer: window.panelCalendar.reservationCalendarClient(ap, scope),
          });
      });
    });
    // Opciones tomadas exclusivamente del alcance visible del usuario; no consulta otros clientes.
    var clients = new Map();
    function addClient(name) {
      var key = window.panelCalendar.calendarClientKey(name);
      if (!clients.has(key))
        clients.set(
          key,
          String(name || "").trim() || "Sin cliente identificado",
        );
    }
    scope.forEach(function (r) {
      if (!isCancelledStatus(r.status)) addClient(r.customer);
    });
    apartados.forEach(function (ap) {
      if (!apartadoCerrado_(ap))
        addClient(window.panelCalendar.reservationCalendarClient(ap, scope));
    });
    if (calCliente_ && !clients.has(calCliente_)) calCliente_ = "";
    var clientSelect = document.getElementById("cal-cliente");
    clientSelect.innerHTML =
      '<option value="">Todos mis clientes</option>' +
      Array.from(clients.entries())
        .sort(function (a, b) {
          return a[1].localeCompare(b[1], "es-MX");
        })
        .map(function (entry) {
          return (
            '<option value="' +
            esc(entry[0]) +
            '">' +
            esc(entry[1]) +
            "</option>"
          );
        })
        .join("");
    clientSelect.value = calCliente_;
    var counts = { all: 0, pickup: 0, cruce: 0, entrega: 0, apartado: 0 },
      visible = 0;
    dias.forEach(function (day) {
      var key = day.toDateString();
      window.panelCalendar
        .filterCalendarEvents(porDia[key], "all", calCliente_)
        .forEach(function (event) {
          counts.all++;
          counts[event.tipo]++;
        });
      porDia[key] = window.panelCalendar.filterCalendarEvents(
        porDia[key],
        calTipo_,
        calCliente_,
      );
      visible += porDia[key].length;
    });
    document.querySelectorAll("[data-cal-type]").forEach(function (button) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.calType === calTipo_),
      );
    });
    document.querySelectorAll("[data-cal-count]").forEach(function (count) {
      count.textContent = counts[count.dataset.calCount];
    });
    document.getElementById("cal-week-title").textContent =
      window.panelUsability.formatMoment(dias[0], true) +
      " — " +
      window.panelUsability.formatMoment(dias[6], true);
    document.getElementById("cal-result").textContent =
      visible +
      (visible === 1 ? " movimiento" : " movimientos") +
      (calCliente_
        ? " · " + clients.get(calCliente_)
        : " · Todos mis clientes");
    document.getElementById("cal-no-results").hidden = visible > 0;
    var nombres = [
        "Lunes",
        "Martes",
        "Miércoles",
        "Jueves",
        "Viernes",
        "Sábado",
        "Domingo",
      ],
      hoy = new Date().toDateString();
    function calendarCard(x) {
      var record = x.ap || x.r;
      var hh =
        ("0" + x.fecha.getHours()).slice(-2) +
        ":" +
        ("0" + x.fecha.getMinutes()).slice(-2);
      var target = x.ap
        ? 'data-cal-apartado="' + esc(x.ap.id)
        : 'data-cal-load="' + esc(x.r.load);
      return (
        '<button type="button" class="cal-chip t-' +
        esc(x.tipo) +
        '" ' +
        target +
        '">' +
        '<span class="cal-event-top"><span class="cal-event-type">' +
        esc(x.etiqueta) +
        '</span><time datetime="' +
        esc(x.fecha.toISOString()) +
        '">' +
        hh +
        "</time></span>" +
        "<strong>Carga " +
        esc(record.load) +
        '</strong><small class="cal-event-client">' +
        esc(x.customer || "Sin cliente identificado") +
        "</small>" +
        '<span class="cal-event-equipment">Trailer: ' +
        esc(record.trailer || "Sin asignar") +
        (x.ap ? "" : " · Truck: " + esc(record.truck || "Sin asignar")) +
        "</span>" +
        '<span class="cal-event-status">' +
        esc(
          x.ap
            ? APARTADO_ESTADOS_[x.ap.estado] || "Apartado"
            : x.r.status || "Sin estatus",
        ) +
        '<span aria-hidden="true"> ›</span></span></button>'
      );
    }
    // La semana se lee por filas; los días con mayor actividad se despliegan a petición.
    grid.innerHTML = dias
      .map(function (d, i) {
        var items = porDia[d.toDateString()].sort(function (a, b) {
          return a.fecha - b.fecha;
        });
        var limit = calVista_ === "list" ? items.length : 3;
        var extra = items.length - limit;
        return (
          '<section class="cal-dia' +
          (d.toDateString() === hoy ? " hoy" : "") +
          (!items.length ? " cal-dia-empty" : "") +
          '" aria-labelledby="cal-day-' +
          i +
          '">' +
          '<header class="cal-dia-head"><div><span class="cal-day-name">' +
          esc(nombres[i]) +
          "</span>" +
          '<h3 id="cal-day-' +
          i +
          '">' +
          d.getDate() +
          "<small>" +
          esc(d.toLocaleDateString("es-MX", { month: "short" })) +
          "</small></h3>" +
          (d.toDateString() === hoy
            ? '<span class="cal-today-label">Hoy</span>'
            : "") +
          '</div><span class="cal-day-count">' +
          items.length +
          (items.length === 1 ? " movimiento" : " movimientos") +
          "</span></header>" +
          '<div class="cal-dia-body">' +
          (items.length
            ? '<div class="cal-day-events">' +
              items.slice(0, limit).map(calendarCard).join("") +
              "</div>" +
              (extra > 0
                ? '<details class="cal-day-more" data-cal-day="' +
                  i +
                  '"' +
                  (calDiasAbiertos_.has(i) ? " open" : "") +
                  "><summary><span>Ver " +
                  extra +
                  " movimientos más</span><span>Mostrar menos</span></summary>" +
                  '<div class="cal-day-events">' +
                  items.slice(limit).map(calendarCard).join("") +
                  "</div></details>"
                : "")
            : '<p class="cal-vacio">Sin movimientos programados</p>') +
          "</div></section>"
        );
      })
      .join("");
  }
  document.querySelectorAll("[data-cal-view]").forEach(function (button) {
    button.addEventListener("click", function () {
      calVista_ = button.dataset.calView;
      calVistaCuenta_ = calVistaKey_();
      try {
        localStorage.setItem(calVistaCuenta_, calVista_);
      } catch (e) {}
      renderCalendario_();
    });
  });
  document
    .getElementById("cal-cliente")
    .addEventListener("change", function (event) {
      calCliente_ = event.target.value;
      renderCalendario_();
    });
  document.querySelectorAll("[data-cal-type]").forEach(function (button) {
    button.addEventListener("click", function () {
      calTipo_ = button.dataset.calType;
      renderCalendario_();
    });
  });
  document.getElementById("cal-reset").addEventListener("click", function () {
    calTipo_ = "all";
    calCliente_ = "";
    renderCalendario_();
  });
  document.getElementById("cal-prev").addEventListener("click", function () {
    calDiasAbiertos_.clear();
    calSemana_--;
    renderCalendario_();
  });
  document.getElementById("cal-next").addEventListener("click", function () {
    calDiasAbiertos_.clear();
    calSemana_++;
    renderCalendario_();
  });
  document.getElementById("cal-hoy").addEventListener("click", function () {
    calDiasAbiertos_.clear();
    calSemana_ = 0;
    renderCalendario_();
  });
  document.getElementById("cal-grid").addEventListener(
    "toggle",
    function (event) {
      if (!event.target.matches("details[data-cal-day]")) return;
      var day = Number(event.target.dataset.calDay);
      // Ignorar eventos pendientes de nodos reemplazados al volver a dibujar la semana.
      if (!event.target.isConnected) return;
      if (event.target.open) calDiasAbiertos_.add(day);
      else calDiasAbiertos_.delete(day);
    },
    true,
  );
  document.getElementById("cal-grid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cal-load]");
    if (b) {
      openLoadWorkspace(b.getAttribute("data-cal-load"), "operacion");
      return;
    }
    b = e.target.closest("[data-cal-apartado]");
    if (b) verApartado_(b.getAttribute("data-cal-apartado"));
  });

  // ===== Loads apartados (regreso cargado) =====
  // Loads de otros CSR (en Vanguard) que se apartan para regresar cargado. Pasos: monitorear que
  // cruce y sea despachado → revisar cuándo entrega en destino → decidir si sirve para mi carga
  // o se cambia a broker. El servidor calcula "proxima_revision" (fecha de cruce, fecha de
  // entrega o cada X horas) y la campana avisa cuando llega (ver candidatosAvisos_).
  var apartados = [];
  var apartadosCargados_ = false;
  var apartadoEditando_ = null;
