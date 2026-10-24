import { escapeHtml as esc } from "./content.js";
import { formDialog, field, area, select } from "./dialogs.js";

const date = (value) =>
  value
    ? new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Mexico_City",
      }).format(new Date(value))
    : "Sin fecha";
const empty = "<p>Sin registros todavía.</p>";
const row = (label, detail, buttons) =>
  `<div class="organize-row"><span>${esc(label)}<small>${esc(detail)}</small></span>${buttons}</div>`;
const button = (action, label, id = "") =>
  `<button type="button" data-org-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
const personOptions = (data) => [
  ["", "Selecciona a una persona"],
  ...data.people.map((p) => [p.id, p.display_name]),
];
const loadOptions = (data) => [
  ["", "Sin carga relacionada"],
  ...data.loads.map((l) => [l.load, `${l.load} · ${l.customer}`]),
];
const templateOptions = (data) => [
  ["", "Sin checklist"],
  ...data.task_checklist_templates.map((t) => [t.id, t.name]),
];

/** Iconos locales: acompañan al texto sin descargar imágenes ni añadir dependencias. */
const organizationSections = [
  {
    id: "instructions",
    label: "Instructivos por ruta",
    detail: "Procedimientos y casos aprobados",
    icon: "M4 3h16v18H4zM8 8h8M8 12h8M8 16h5",
  },
  {
    id: "tasks",
    label: "Tareas y checklist",
    detail: "Asigna acciones y revisa sus pasos",
    icon: "M9 5h10v15H5V5h2m2-2h6v4H9zM8 12l2 2 4-4m-6 7h8",
  },
  {
    id: "schedules",
    label: "Tareas recurrentes",
    detail: "Programa lo que se repite",
    icon: "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3",
  },
  {
    id: "reserved",
    label: "Referencias de regreso",
    detail: "Relaciona tus cargas apartadas",
    icon: "M3 6h11v11H3zM14 10h4l3 4v3h-7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4m11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  },
  {
    id: "alerts",
    label: "Avisos",
    detail: "Consulta lo que sigue pendiente",
    icon: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 20h4",
  },
  {
    id: "rules",
    label: "Reglas",
    detail: "Ajusta el funcionamiento del panel",
    admin: true,
    icon: "M4 7h16M4 17h16M8 4v6m8 4v6",
  },
  {
    id: "clients",
    label: "Nombres de clientes",
    detail: "Unifica nombres y equivalencias",
    admin: true,
    icon: "M3 21V5h11v16M14 10h7v11M1 21h22M6 9h5m-5 4h5m-5 4h5m6-3h2m-2 4h2",
  },
  {
    id: "retention",
    label: "Respaldo y archivo",
    detail: "Conserva y organiza tu información",
    admin: true,
    icon: "M4 8h16v13H4zM2 3h20v5H2zM9 12h6",
  },
];
const organizationNavButton = ({ id, label, detail, icon }) =>
  `<button type="button" data-org-action="tab" data-id="${id}" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icon}"/></svg><span><strong>${label}</strong><small>${detail}</small></span><span class="organize-nav-arrow" aria-hidden="true">›</span></button>`;

/** Controles nuevos en una sola ventana; se consultan al abrirla, no en cada refresco del panel. */
export function mountOrganization(api, doc = document) {
  const toolbar = doc.createElement("div");
  toolbar.className = "organize-toolbar";
  toolbar.innerHTML =
    '<button type="button">Organizar turno</button><button type="button">Guía de uso</button>';
  const anchor = doc.querySelector("header.top") || doc.body;
  anchor.append(toolbar);
  toolbar.children[0].onclick = () => open();
  toolbar.children[1].onclick = () => help();
  let active = null;
  let openRequest = 0;
  const openButton = toolbar.children[0];
  const feedback = doc.createElement("span");
  feedback.className = "organize-load-status";
  feedback.setAttribute("role", "status");
  toolbar.append(feedback);
  const setLoading = (loading) => {
    openButton.disabled = loading;
    openButton.textContent = loading ? "Abriendo turno…" : "Organizar turno";
    openButton.setAttribute("aria-busy", String(loading));
  };
  // Cerrar vistas de datos al salir, incluso si la sesión termina con un diálogo abierto.
  window.addEventListener("panel:save", (event) => {
    if (event.detail?.phase !== "reset") return;
    openRequest++; // Invalidar también lecturas pendientes al terminar la sesión.
    setLoading(false);
    feedback.textContent = "";
    for (const dialog of doc.querySelectorAll(".organize-dialog")) {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
      if (dialog.isConnected) {
        dialog.close();
        dialog.remove();
      }
    }
    active = null;
  });
  const call = async (name, ...args) => {
    const r = await api.methods[name](...args);
    if (r?.ok === false) throw Error(r.error || "No se completó la acción");
    return r;
  };
  const notice = (target, error) => {
    target.textContent = error?.message || String(error);
  };
  async function help() {
    await formDialog(
      "Guía del panel",
      `<div class="organize-help"><p><b>Inicio:</b> comienza por lo vencido y lo que requiere atención. «Próxima revisión» es la fecha para volver a revisar; al vencer sigue visible hasta que lo atiendas.</p><p><b>Revisión operativa:</b> depende del estatus de la carga. <b>Seguimiento personal:</b> es el pendiente que tú programas. Completar uno no completa el otro.</p><p><b>Cargas:</b> unidad = tractocamión; trailer = caja; cita = horario acordado. La etapa indica el avance, la prioridad el orden de trabajo y atención lo que necesita revisión. Los instructivos publicados muestran qué hacer por cliente y ruta.</p><p><b>Solicitudes:</b> viajes sin número de carga confirmado. <b>Tareas:</b> acciones asignadas a personas del panel. <b>Apartados:</b> viajes reservados para regreso; el CSR de VG se escribe manualmente.</p><p><b>CSR:</b> consulta las cargas de sus clientes asignados. <b>Admin:</b> administra cuentas, clientes y reglas. El nombre del perfil conserva Admin/Supervisor según tu cuenta.</p><p><b>Turno:</b> asigna las tareas, completa sus pasos y entrega pendientes críticos con responsable y próxima acción. Una tarea dependiente se completa después de sus antecedentes.</p><p><b>Millas:</b> revisa fuente y fecha. OSRM usa mapas abiertos; Google actualiza cuando el proceso programado tiene cuota.</p><p>Fechas mostradas en hora del centro de México. «Sin fecha» significa que no se capturó; 0 es un valor válido.</p><p>Los avisos de esta versión son internos.</p></div>`,
      "Entendido",
    );
  }
  async function open(tab = "tasks") {
    const request = ++openRequest;
    feedback.textContent = "";
    setLoading(true);
    let data;
    try {
      data = await call("getOrganizacion");
    } catch (error) {
      if (request === openRequest)
        feedback.textContent =
          "No se pudo abrir el turno: " +
          error.message +
          ". Vuelve a intentarlo.";
      return;
    } finally {
      if (request === openRequest) setLoading(false);
    }
    if (request !== openRequest) return;
    active?.remove();
    const dialog = doc.createElement("dialog");
    active = dialog;
    dialog.dataset.organizationId = crypto.randomUUID();
    dialog.className = "organize-dialog organize-hub";
    dialog.setAttribute("aria-labelledby", "organize-hub-title");
    const tabs = organizationSections.filter(
      (item) => !item.admin || data.admin,
    );
    dialog.innerHTML = `<form method="dialog">
      <header class="organize-hub-head"><div><span class="organize-eyebrow">TU ESPACIO DE TRABAJO</span><h2 id="organize-hub-title">Organizar turno</h2><p>Prepara el trabajo, da seguimiento y deja todo en orden.</p></div><button class="organize-close" value="close" aria-label="Cerrar">×</button></header>
      <div class="organize-layout"><nav class="organize-tabs" aria-label="Secciones de Organizar turno"><p class="organize-nav-label">Trabajo diario</p>${tabs
        .filter((t) => !t.admin)
        .map(organizationNavButton)
        .join("")}${
        data.admin
          ? '<p class="organize-nav-label">Administración</p>' +
            tabs
              .filter((t) => t.admin)
              .map(organizationNavButton)
              .join("")
          : ""
      }</nav>
      <div class="organize-content"><div class="organize-content-head"><span class="organize-eyebrow">TRABAJO DIARIO</span><h3 id="organize-section-title"></h3></div><p class="organize-status" role="status"></p><section aria-labelledby="organize-section-title"></section></div></div>
    </form>`;
    doc.body.append(dialog);
    dialog.addEventListener("close", () => {
      dialog.remove();
      if (active === dialog) active = null;
    });
    dialog.showModal();
    const section = dialog.querySelector("section"),
      status = dialog.querySelector("[role=status]");
    function show(key) {
      tab = key;
      const current = tabs.find((item) => item.id === key);
      dialog.querySelector("#organize-section-title").textContent =
        current.label;
      dialog.querySelector(
        ".organize-content-head .organize-eyebrow",
      ).textContent = current.admin ? "ADMINISTRACIÓN" : "TRABAJO DIARIO";
      status.textContent = "";
      dialog
        .querySelectorAll("[data-org-action=tab]")
        .forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.id === key)),
        );
      if (key === "instructions")
        section.innerHTML =
          '<p>Registra una vez qué hacer en cada punto de la ruta. Los casos propuestos requieren aprobación antes de aplicarse automáticamente.</p><button type="button" data-instruction-library>Abrir instructivos</button>';
      if (key === "tasks") {
        // La pestaña inicial debe explicar qué muestra y permitir crear una tarea aquí mismo.
        section.innerHTML = `<p>Estas son tus tareas abiertas. Pulsa «Abrir» para agregar o completar sus pasos obligatorios.</p>${button("new-task", "Nueva tarea de turno")}${data.tasks.length ? data.tasks.map((t) => row(t.note, `${t.load || "Sin carga"} · ${date(t.follow_up_at)}`, button("task", "Abrir", t.id))).join("") : "<p>No hay tareas abiertas. Crea una con «Nueva tarea de turno».</p>"}`;
      }
      if (key === "schedules")
        section.innerHTML = `<p>Horario del centro de México. Se crea una tarea por ocurrencia; si el proceso estuvo detenido, recupera una sola y continúa en el próximo horario.</p>${button("schedule", "Nueva programación")}${data.admin ? button("tick", "Comprobar programaciones ahora") : ""}${data.task_schedules.map((t) => row(t.note, `${t.cadence === "daily" ? "Diaria" : "Semanal"} · ${date(t.next_run_at)} · ${t.active ? "Activa" : "Pausada"}`, button("schedule", "Editar", t.id))).join("") || empty}`;
      if (key === "reserved") {
        section.innerHTML =
          "<p>«Carga relacionada» valida una carga activa. «Referencia libre» admite cualquier dato externo y no crea un vínculo.</p><p>Cargando…</p>";
        call("getApartados")
          .then((r) => {
            if (tab !== "reserved" || !dialog.isConnected) return;
            data.reserved = r.items;
            section.innerHTML = `<p>La carga relacionada es distinta de la referencia manual y del CSR externo de VG.</p>${r.items.map((a) => row(a.load, `Relacionada: ${a.related_load || "Ninguna"} · Referencia: ${a.free_reference || "Ninguna"}`, button("reserved", "Relacionar / referencia", a.id))).join("") || empty}`;
          })
          .catch((e) => notice(status, e));
      }
      if (key === "alerts") {
        section.innerHTML = "<p>Cargando avisos vigentes…</p>";
        call("getAvisosOperacion")
          .then((r) => {
            if (tab === "alerts" && dialog.isConnected)
              section.innerHTML = `<p>Leer el aviso no completa su tarea. Los avisos resueltos o reprogramados dejan de mostrarse.</p>${r.map((a) => row(a.message, date(a.created_at), button("read", "Marcar leído", a.id))).join("") || empty}<p>Avisos internos del panel.</p>`;
          })
          .catch((e) => notice(status, e));
      }
      if (key === "rules") {
        const c = data.panel_settings[0];
        section.innerHTML = `<p>Cada cuenta consulta las cargas de sus clientes asignados. No hay envíos ni borrados automáticos activados.</p>${button("rules", "Editar reglas")}<p>Escalamiento: ${c.escalation_enabled ? "activo a las " + esc(c.escalation_hours) + " horas" : "desactivado"}. Archivo manual: ${c.archive_days ? esc(c.archive_days) + " días" : "sin plazo"}. Instantáneas de importación: ${c.import_retention_days ? esc(c.import_retention_days) + " días" : "sin eliminación"}.</p><p>Las transiciones conservan el funcionamiento actual hasta que registres una regla.</p>${button("transition", "Configurar transición")}${Object.entries(
          c.status_transitions,
        )
          .map(([from, to]) =>
            row(
              from,
              to.join(", "),
              button("remove-transition", "Quitar regla", from),
            ),
          )
          .join("")}`;
      }
      if (key === "clients")
        section.innerHTML = `<p>Unifica nombres de nuevas capturas e importaciones. Las cargas anteriores conservan su dato original; el nombre principal hereda el mismo CSR si todavía no tiene asignación.</p>${button("alias", "Registrar equivalencia")}${data.customer_aliases.map((a) => row(a.alias, "Nombre principal: " + a.canonical_name, "")).join("")}`;
      if (key === "retention")
        section.innerHTML = `<p>Primero descarga un respaldo completo. El archivo conserva los expedientes; eliminar instantáneas antiguas impide deshacer esas importaciones. Siempre requiere revisión manual.</p>${button("backup", "Descargar respaldo completo")}${button("retention", "Revisar archivo y retención")}<p>El respaldo no contiene contraseñas, sesiones ni secretos de Google. La restauración debe ensayarse antes en una base separada.</p>`;
    }
    show(tab);
    dialog.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-org-action]");
      if (!b) return;
      e.preventDefault();
      const action = b.dataset.orgAction,
        id = b.dataset.id;
      if (action === "tab") {
        show(id);
        return;
      }
      b.disabled = true;
      status.textContent = "";
      try {
        let result;
        if (action === "new-task") {
          // Reutilizar el formulario existente conserva asignación, permisos e historial.
          dialog.close();
          doc
            .querySelector('[data-page-scroll="home:group-bitacora"]')
            ?.click();
          doc.getElementById("bitacora-add-btn")?.click();
          return;
        }
        if (action === "schedule") {
          const t = data.task_schedules.find((t) => t.id === id) || {};
          result = await formDialog(
            "Tarea recurrente",
            area(
              "note",
              "Acción a realizar",
              t.note,
              'required maxlength="9500"',
            ) +
              select(
                "assigned_to",
                "Asignar a:",
                personOptions(data),
                t.assigned_to,
                "required",
              ) +
              select("load", "Carga relacionada", loadOptions(data), t.load) +
              select(
                "cadence",
                "Frecuencia",
                [
                  ["daily", "Diaria"],
                  ["weekly", "Semanal"],
                ],
                t.cadence,
              ) +
              field(
                "weekdays",
                "Días de semana: 0 domingo, 1 lunes … 6 sábado",
                "text",
                (t.weekdays || [1, 2, 3, 4, 5]).join(","),
                'required pattern="[0-6](,[0-6])*"',
              ) +
              field(
                "local_time",
                "Hora del centro de México",
                "time",
                t.local_time?.slice(0, 5) || "09:00",
                "required",
              ) +
              select(
                "checklist_id",
                "Plantilla de checklist",
                templateOptions(data),
                t.checklist_id,
              ) +
              select(
                "active",
                "Estado",
                [
                  ["true", "Activa"],
                  ["false", "Pausada"],
                ],
                String(t.active !== false),
              ),
          );
          if (result) {
            result.weekdays = [
              ...new Set(result.weekdays.split(",").map(Number)),
            ];
            result.active = result.active === "true";
            await call("guardarProgramacion", id, result);
          }
        }
        if (action === "task") {
          status.textContent = "Abriendo tarea…";
          await taskDetails(id, data, call);
          await open(tab);
          dialog.close();
          return;
        }
        if (action === "reserved") {
          const a = data.reserved.find((a) => a.id === id);
          result = await formDialog(
            "Referencia del apartado " + a.load,
            select(
              "related_load",
              "Carga relacionada",
              [
                ...loadOptions(data),
                ...(a.related_load &&
                !data.loads.some((l) => l.load === a.related_load)
                  ? [[a.related_load, a.related_load + " (vínculo existente)"]]
                  : []),
              ],
              a.related_load,
            ) +
              field(
                "free_reference",
                "Referencia libre",
                "text",
                a.free_reference,
                'maxlength="500"',
              ),
          );
          if (result) await call("guardarApartado", { ...a, ...result });
        }
        if (action === "read") {
          await call("leerAvisoOperacion", id);
          result = true;
        }
        if (action === "tick") {
          const r = await call("ejecutarProgramaciones");
          status.textContent = `Tareas generadas: ${r.generated}. Avisos nuevos: ${r.task_alerts}. No se enviaron correos.`;
          return;
        }
        if (action === "rules") {
          const c = data.panel_settings[0];
          result = await formDialog(
            "Reglas del panel",
            select(
              "escalation_enabled",
              "Escalar tareas vencidas",
              [
                ["false", "Desactivado"],
                ["true", "Activado"],
              ],
              String(c.escalation_enabled),
            ) +
              field(
                "escalation_hours",
                "Horas después del vencimiento",
                "number",
                c.escalation_hours,
                'required min="1" max="720"',
              ) +
              select(
                "supervisor_id",
                "Enviar escalamiento interno a:",
                [
                  ["", "Sin destinatario"],
                  ...data.people
                    .filter((p) => p.role === "admin")
                    .map((p) => [p.id, p.display_name]),
                ],
                c.supervisor_id,
              ) +
              field(
                "archive_days",
                "Archivo manual: días (vacío = sin plazo)",
                "number",
                c.archive_days ?? "",
                'min="30" max="3650"',
              ) +
              field(
                "import_retention_days",
                "Instantáneas: días (vacío = conservar todas)",
                "number",
                c.import_retention_days ?? "",
                'min="30" max="3650"',
              ) +
              "<p>Envío externo desactivado. No se elimina ni archiva automáticamente.</p>",
          );
          if (result)
            await call("guardarReglas", {
              ...c,
              ...result,
              escalation_enabled: result.escalation_enabled === "true",
              external_alerts_enabled: false,
              alert_channel: "disabled",
            });
        }
        if (action === "transition") {
          const c = data.panel_settings[0];
          result = await formDialog(
            "Regla de avance",
            field(
              "from",
              "Estatus de origen (texto exacto)",
              "text",
              "",
              'required maxlength="100"',
            ) +
              field(
                "to",
                "Estatus permitidos, separados por coma",
                "text",
                "",
                'required maxlength="5000"',
              ) +
              "<p>Desde ese origen solo se permitirán los destinos indicados. También se valida al importar. Los demás orígenes conservan sus reglas actuales.</p>",
          );
          if (result)
            await call("guardarReglas", {
              ...c,
              status_transitions: {
                ...c.status_transitions,
                [result.from.trim()]: result.to
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            });
        }
        if (action === "remove-transition") {
          const c = data.panel_settings[0];
          const transitions = { ...c.status_transitions };
          delete transitions[id];
          result = await formDialog(
            "Quitar regla",
            `<p>Se permitirán los cambios actuales desde ${esc(id)}.</p>`,
            "Quitar regla",
          );
          if (result)
            await call("guardarReglas", {
              ...c,
              status_transitions: transitions,
            });
        }
        if (action === "alias") {
          result = await formDialog(
            "Nombres de un cliente",
            field(
              "alias",
              "Nombre alternativo",
              "text",
              "",
              'required maxlength="500"',
            ) +
              field(
                "canonical",
                "Nombre principal",
                "text",
                "",
                'required maxlength="500"',
              ),
          );
          if (result)
            await call("guardarAliasCliente", result.alias, result.canonical);
        }
        if (action === "backup") {
          const backup = await call("getRespaldoCompleto");
          const blob = new Blob([JSON.stringify(backup, null, 2)], {
              type: "application/json",
            }),
            url = URL.createObjectURL(blob),
            link = doc.createElement("a");
          link.href = url;
          link.download =
            "panel-bajio-respaldo-" +
            new Date().toISOString().slice(0, 10) +
            ".json";
          link.click();
          URL.revokeObjectURL(url);
          status.textContent =
            "Respaldo descargado. Verifica que el navegador guardó el archivo.";
          return;
        }
        if (action === "retention") {
          const plan = await call("getPlanRetencion");
          result = await formDialog(
            "Revisar retención manual",
            `<p>Cargas a archivar: ${esc(plan.archive_loads.length)}. Importaciones cuyas instantáneas se eliminarán: ${esc(plan.prune_imports.length)}.</p><details><summary>Ver registros</summary><p>${esc(plan.archive_loads.join(", ") || "Sin cargas")}</p><p>${esc(plan.prune_imports.join(", ") || "Sin importaciones")}</p></details><label><input type="checkbox" name="backup" required> Ya descargué y verifiqué el respaldo completo</label>${area("reason", "Motivo", "", 'required minlength="3" maxlength="1000"')}<p>No se borran cargas ni sus expedientes. Las instantáneas eliminadas ya no podrán deshacerse.</p>`,
            "Aplicar este plan",
          );
          if (result) {
            await call("aplicarRetencion", plan, result.reason);
            status.textContent =
              "Plan aplicado. Actualiza el panel para ver las cargas archivadas.";
            return;
          }
        }
        if (result) {
          await open(tab);
          dialog.close();
        }
      } catch (error) {
        notice(
          status,
          action === "task"
            ? new Error("No se pudo abrir la tarea: " + error.message)
            : error,
        );
      } finally {
        b.disabled = false;
      }
    });
  }
  return { open };
}

async function taskDetails(id, data, call) {
  const details = await call("getDetalleTarea", id);
  const task = details.task;
  const options = [
    ["", "Elige tarea anterior"],
    ...data.tasks
      .filter((t) => t.id !== id)
      .map((t) => [t.id, t.note.slice(0, 100)]),
  ];
  const result = await formDialog(
    "Pasos y dependencias",
    `<p>${esc(task.note)}</p><p>${task.state === "open" ? "Abierta" : "Cerrada"} · ${date(task.follow_up_at)}</p>${details.checklist.map((i) => `<label><input type="checkbox" name="step:${esc(i.item_id)}" ${i.done ? "checked" : ""} ${task.state === "open" ? "" : "disabled"}>${esc(i.label)} ${i.required ? "(obligatorio)" : ""}</label>`).join("")}${!details.checklist.length ? select("template", "Agregar plantilla", templateOptions(data)) + field("new_template", "O crea una plantilla con nombre", "text", "", 'maxlength="200"') + area("steps", "Un paso obligatorio por línea", "", 'maxlength="20000"') : ""}${select("dependency", "Debe completarse después de:", options)}${details.dependencies.map((d) => `<p>${esc(d.note)} · ${esc(d.state === "resolved" ? "Resuelta" : "Pendiente")}<label><input type="checkbox" name="remove:${esc(d.id)}">Quitar dependencia</label></p>`).join("")}<details><summary>Últimos cambios</summary>${details.history.map((h) => `<p>${esc(date(h.changed_at))} · ${esc({ checklist_added: "Agregó checklist", checklist_changed: "Actualizó un paso", dependency_changed: "Cambió una dependencia", scheduled: "Generó la tarea programada", resolved: "Resolvió", open: "Reabrió", cancelled: "Canceló", created: "Creó", edited: "Editó" }[h.event] || "Actualizó la tarea")}</p>`).join("")}</details>`,
  );
  if (!result) return;
  for (const step of details.checklist)
    if (
      task.state === "open" &&
      step.done !== Boolean(result["step:" + step.item_id])
    )
      await call(
        "marcarPasoTarea",
        id,
        step.item_id,
        Boolean(result["step:" + step.item_id]),
      );
  let template = result.template;
  if (result.new_template && result.steps.trim()) {
    const t = await call(
      "guardarChecklist",
      "",
      result.new_template,
      result.steps
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label) => ({ label, required: true })),
    );
    template = t.id;
  }
  await call("getDetalleTarea", id);
  if (template) await call("agregarChecklistTarea", id, template);
  for (const d of details.dependencies)
    if (result["remove:" + d.id]) {
      await call("getDetalleTarea", id);
      await call("guardarDependencia", id, d.id, false);
    }
  if (result.dependency) {
    await call("getDetalleTarea", id);
    await call("guardarDependencia", id, result.dependency, true);
  }
}
