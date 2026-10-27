import { escapeHtml as esc } from "../content.js";
import { validateForm } from "../validation.js";
import { field, area, select } from "../dialogs.js";
import {
  instructionStages,
  requirementLabels,
  instructionCard,
} from "./content.js";
import {
  findInstructionMatches,
  instructionFlow,
  instructionKey,
} from "./matching.js";

/** Editor de conocimiento y acciones por carga. Ninguna propuesta se publica sola. */
export function mountInstructions(api, doc = document) {
  let library = null;
  let session = 0;
  const call = async (name, ...args) => {
    const started = session;
    const result = await api.methods[name](...args);
    if (started !== session) throw Error("La sesión cambió. Vuelve a entrar.");
    if (result?.ok === false) throw Error(result.error || "No se pudo guardar");
    return result;
  };
  const refresh = () =>
    window.dispatchEvent(new CustomEvent("panel:instruction-refresh"));
  function modal(title, body, submit, onSave) {
    const previousFocus = doc.activeElement;
    const dialog = doc.createElement("dialog");
    dialog.className = "organize-dialog instruction-dialog";
    const heading = "instruction-" + crypto.randomUUID();
    dialog.setAttribute("aria-labelledby", heading);
    dialog.innerHTML =
      '<form novalidate data-managed-validation><header><h2 id="' +
      heading +
      '">' +
      esc(title) +
      '</h2><button type="button" data-close aria-label="Cerrar">×</button></header><div class="organize-fields">' +
      body +
      '</div><p class="organize-error" role="alert"></p><footer><button type="button" data-close>Cerrar</button>' +
      (submit ? '<button type="submit">' + esc(submit) + "</button>" : "") +
      "</footer></form>";
    const form = dialog.querySelector("form"),
      error = dialog.querySelector('[role="alert"]');
    let busy = false;
    const close = () => {
      if (busy) return;
      dialog.close();
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    dialog.querySelectorAll("[data-close]").forEach((b) => (b.onclick = close));
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy || !validateForm(form)) return;
      busy = true;
      error.textContent = "";
      const data = new FormData(form);
      const submitButton = form.querySelector('[type="submit"]');
      const submitText = submitButton?.textContent;
      if (submitButton) submitButton.textContent = "Guardando…";
      dialog.querySelectorAll("button").forEach((b) => (b.disabled = true));
      let afterSave;
      try {
        afterSave = await onSave(data, form);
        busy = false;
        close();
      } catch (err) {
        error.textContent = err.message;
        busy = false;
        dialog.querySelectorAll("button").forEach((b) => (b.disabled = false));
        if (submitButton) submitButton.textContent = submitText;
      }
      // Una recarga posterior al guardado no debe presentarse como un fallo al guardar.
      if (typeof afterSave === "function") await afterSave();
    });
    doc.body.append(dialog);
    dialog.showModal();
    return { dialog, form, error, close };
  }
  const stepFields = (flow, steps = {}) =>
    instructionStages(flow)
      .map(([id, label], i) => {
        const s = steps[id] || {};
        return (
          '<details class="instruction-step-editor" data-stage="' +
          id +
          '"' +
          (i === 0 ? " open" : "") +
          "><summary>" +
          esc(label) +
          (s.action ? " · Con instrucciones" : "") +
          "</summary>" +
          area(
            id + ".action",
            "Qué hacer",
            s.action || "",
            'maxlength="3000"',
          ) +
          area(
            id + ".condition",
            "Condición para avanzar (requiere confirmación)",
            s.condition || "",
            'maxlength="3000"',
          ) +
          area(
            id + ".on_issue",
            "Qué hacer si ocurre un problema",
            s.on_issue || "",
            'maxlength="3000"',
          ) +
          field(
            id + ".contact",
            "Contacto / referencia",
            "text",
            s.contact || "",
            'maxlength="3000"',
          ) +
          "<fieldset><legend>Requisitos que el panel puede comprobar</legend>" +
          Object.entries(requirementLabels)
            .filter(([key]) =>
              [
                "bol",
                "doda",
                "entry",
                "sobre_listo",
                "cruce_confirmado",
              ].includes(key),
            )
            .map(
              ([key, label]) =>
                '<label class="instruction-check"><input type="checkbox" name="' +
                id +
                '.requires" value="' +
                key +
                '"' +
                ((s.requires || []).includes(key) ? " checked" : "") +
                ">" +
                esc(label) +
                "</label>",
            )
            .join("") +
          "</fieldset>" +
          select(
            id + ".notice",
            "Cuándo avisarme",
            [
              ["stage", "Al confirmar esta etapa"],
              ["pickup", "En la cita de recolección"],
              ["delivery", "En la cita de entrega"],
            ],
            s.notice || "stage",
          ) +
          "</details>"
        );
      })
      .join("");
  function readSteps(form, flow) {
    const data = new FormData(form);
    return Object.fromEntries(
      instructionStages(flow).map(([id]) => [
        id,
        {
          action: data.get(id + ".action") || "",
          condition: data.get(id + ".condition") || "",
          on_issue: data.get(id + ".on_issue") || "",
          contact: data.get(id + ".contact") || "",
          requires: data.getAll(id + ".requires"),
          notice: data.get(id + ".notice") || "stage",
        },
      ]),
    );
  }
  async function editTemplate(
    record = {},
    source = null,
    onDone = () => {},
    knownItems = [],
    aliases = [],
  ) {
    const editingSession = session;
    const admin = api.profile.role === "admin";
    let flow = instructionFlow(record.flow ? record : source || record);
    const fromSource = source
      ? {
          [source.instruction_context?.stage || "origin"]: {
            ...(source.instruction_plan?.steps?.[
              source.instruction_context?.stage
            ] || {}),
            action:
              source.instruction_exception ||
              source.instruction_context?.action ||
              "",
            requires:
              source.instruction_plan?.steps?.[
                source.instruction_context?.stage
              ]?.requires || [],
          },
        }
      : {};
    const drafts = { [flow]: record.steps || fromSource };
    const seed = { ...source, ...record };
    const bases =
      admin && record.state !== "approved"
        ? findInstructionMatches(knownItems, seed, aliases).approved.filter(
            (item) =>
              item.id !== record.id &&
              item.flow === flow &&
              instructionKey(item.customer) === instructionKey(seed.customer),
          )
        : [];
    const base = bases.length === 1 ? bases[0] : null;

    const body =
      '<p>Se configura una vez por ruta. Los borradores son propuestas; solo un instructivo publicado se asigna automáticamente.</p><div class="instruction-route-fields">' +
      field(
        "name",
        "Nombre del instructivo",
        "text",
        record.name ||
          [source?.customer, source?.origin_city, source?.dest_city]
            .filter(Boolean)
            .join(" · "),
        'required minlength="3" maxlength="200"',
      ) +
      field(
        "customer",
        "Cliente (vacío = ruta general)",
        "text",
        record.customer ?? source?.customer ?? "",
        'maxlength="500"',
      ) +
      field(
        "origin_city",
        "Ciudad de origen",
        "text",
        record.origin_city || source?.origin_city || "",
        'required maxlength="300"',
      ) +
      field(
        "origin_state",
        "Estado de origen",
        "text",
        record.origin_state || source?.origin_state || "",
        'maxlength="100"',
      ) +
      field(
        "dest_city",
        "Ciudad de destino",
        "text",
        record.dest_city || source?.dest_city || "",
        'required maxlength="300"',
      ) +
      field(
        "dest_state",
        "Estado de destino",
        "text",
        record.dest_state || source?.dest_state || "",
        'maxlength="100"',
      ) +
      select(
        "flow",
        "Recorrido",
        [
          ["export", "Exportación"],
          ["import", "Importación"],
        ],
        flow,
      ) +
      select(
        "state",
        "Uso del instructivo",
        admin
          ? [
              ["draft", "Borrador / propuesta"],
              ["approved", "Publicado y aprobado"],
              ["paused", "Pausado"],
            ]
          : [["draft", "Propuesta para revisión"]],
        record.state || "draft",
      ) +
      '</div><p class="instruction-save-help" role="status"></p><div class="instruction-step-fields">' +
      stepFields(flow, drafts[flow]) +
      "</div>" +
      area(
        "case_note",
        "Caso real: qué ocurrió y qué funcionó",
        record.case_note || "",
        'maxlength="3000"',
      ) +
      (admin
        ? '<label class="instruction-check"><input type="checkbox" name="apply_missing" checked> Aplicar a las cargas actuales de esta ruta que todavía no tienen instructivo</label>'
        : "") +
      (base
        ? '<label class="instruction-check"><input type="checkbox" name="merge_approved" checked> Al publicar, incorporar las etapas con indicaciones al instructivo «' +
          esc(base.name) +
          "». Se conservarán las demás etapas.</label>"
        : "") +
      "<p>Las cargas con instructivo conservan su versión y sus excepciones. Puedes actualizar una carga desde su propio detalle.</p>";
    const editor = modal(
      source
        ? "Proponer instrucciones desde esta carga"
        : "Instructivo por ruta",
      body,
      "Guardar instructivo",
      async (data, form) => {
        const values = Object.fromEntries(data);
        values.steps = readSteps(form, values.flow);
        values.source_load = record.source_load || source?.load || "";
        delete values.apply_missing;
        if (base && data.has("merge_approved")) {
          values.merge_approved = true;
          values.merge_template_id = base.id;
          values.merge_version = base.updated_at;
        }
        const result = await call(
          "guardarInstructivoRuta",
          record.id || null,
          record.updated_at || null,
          values,
          data.has("apply_missing"),
        );
        refresh();
        return async () => {
          let warning = "";
          try {
            await onDone();
          } catch {
            warning =
              "El instructivo se guardó, pero no se pudo actualizar la biblioteca. Ciérrala y vuelve a abrirla para consultar el cambio.";
          }
          if (!api.profile || session !== editingSession) return;
          savedConfirmation(
            result.record,
            source,
            onDone,
            knownItems,
            aliases,
            warning,
          );
        };
      },
    );
    const saveHint = () => {
      const state = editor.form.elements.state.value;
      editor.form.querySelector('[type="submit"]').textContent = {
        draft: "Guardar borrador",
        approved: "Guardar y publicar",
        paused: "Guardar pausado",
      }[state];
      editor.form.querySelector(".instruction-save-help").textContent = {
        draft: admin
          ? "El borrador queda guardado en la biblioteca. Para usarlo en las cargas, elige Publicado y aprobado antes de guardar."
          : "El borrador queda guardado como propuesta. Un Admin debe revisarlo y publicarlo para usarlo en las cargas.",
        approved:
          "Al guardar, este instructivo quedará publicado para las cargas que coincidan con el cliente, las ciudades y los estados de esta ruta.",
        paused:
          "El instructivo quedará guardado, pero no se asignará a nuevas cargas mientras esté pausado.",
      }[state];
    };
    editor.form.elements.state.addEventListener("change", saveHint);
    saveHint();
    editor.form.elements.flow.addEventListener("change", (e) => {
      drafts[flow] = readSteps(editor.form, flow);
      flow = e.target.value;
      editor.form.querySelector(".instruction-step-fields").innerHTML =
        stepFields(flow, drafts[flow] || {});
    });
    return editor;
  }
  function savedConfirmation(
    record,
    source,
    onDone,
    knownItems,
    aliases,
    warning,
  ) {
    const draft = record.state === "draft";
    const result = modal(
      draft
        ? "Borrador guardado"
        : record.state === "paused"
          ? "Instructivo pausado"
          : "Instructivo publicado",
      "<p><strong>" +
        esc(record.name) +
        "</strong></p><p>" +
        (draft
          ? api.profile.role === "admin"
            ? "Tus indicaciones están guardadas. El borrador todavía no se aplica a las cargas; debes publicarlo para empezar a usarlo."
            : "Tus indicaciones están guardadas como propuesta. Un Admin debe revisarlas y publicarlas para usarlas en las cargas."
          : record.state === "paused"
            ? "Los cambios están guardados. Este instructivo no se asignará a nuevas cargas mientras esté pausado."
            : "El instructivo está publicado y disponible para las cargas que coincidan con esta ruta. Las cargas que ya tenían otro instructivo conservan su versión.") +
        "</p>" +
        (warning
          ? '<p class="instruction-blockers">' + esc(warning) + "</p>"
          : "") +
        (draft && api.profile.role === "admin"
          ? '<button type="button" class="file-btn" data-review-saved>Revisar y publicar</button>'
          : ""),
      null,
    );
    result.dialog.dataset.instructionResult = record.state;
    result.form
      .querySelector("[data-review-saved]")
      ?.addEventListener("click", async () => {
        result.close();
        const editor = await editTemplate(
          record,
          source,
          onDone,
          knownItems,
          aliases,
        );
        editor.form.elements.state.value = "approved";
        editor.form.elements.state.dispatchEvent(new Event("change"));
      });
  }
  async function openLibrary() {
    const data = await call("getInstructivosRuta");
    if (library?.dialog.isConnected) library.close();
    library = modal(
      "Instructivos por ruta",
      "<p>Guarda procedimientos aprobados y reutiliza los casos que se resolvieron. Las cargas nuevas reciben la coincidencia de cliente y ruta.</p>" +
        select("route_reference", "Usar una ruta ya registrada", [
          ["", "Captura manual"],
          ...(data.routes || []).map((r) => [
            r.load,
            r.customer +
              " · " +
              [r.origin_city, r.origin_state].filter(Boolean).join(", ") +
              " → " +
              [r.dest_city, r.dest_state].filter(Boolean).join(", "),
          ]),
        ]) +
        '<button type="button" class="file-btn" data-new-instruction>Nueva plantilla</button><div class="instruction-library-list"></div>',
      null,
    );
    library.form.querySelector("[data-new-instruction]").onclick = () =>
      editTemplate(
        {},
        (data.routes || []).find(
          (r) => r.load === library.form.elements.route_reference.value,
        ) || null,
        openLibrary,
        data.items,
        data.customerAliases,
      );
    const list = library.form.querySelector(".instruction-library-list");
    list.innerHTML = data.items.length
      ? data.items
          .map(
            (item) =>
              "<article><div><strong>" +
              esc(item.name) +
              "</strong><p>" +
              esc(
                (item.customer || "Ruta general") +
                  " · " +
                  item.origin_city +
                  " → " +
                  item.dest_city,
              ) +
              "</p><small>" +
              esc(
                {
                  draft: "Propuesta pendiente de aprobación",
                  approved: "Publicado",
                  paused: "Pausado",
                  merged: "Caso incorporado",
                }[item.state],
              ) +
              '</small></div><button type="button" class="file-btn file-btn-sec" data-edit-instruction="' +
              esc(item.id) +
              '">' +
              ((data.admin && item.state !== "merged") ||
              (item.created_by === api.profile.id && item.state === "draft")
                ? "Revisar / editar"
                : "Consultar") +
              "</button></article>",
          )
          .join("")
      : "<p>Todavía no hay instructivos. Crea el primero con las indicaciones reales de una ruta.</p>";
    list.addEventListener("click", (e) => {
      const button = e.target.closest("[data-edit-instruction]");
      if (!button) return;
      const item = data.items.find(
        (x) => x.id === button.dataset.editInstruction,
      );
      if (
        (data.admin && item.state !== "merged") ||
        (item.created_by === api.profile.id && item.state === "draft")
      )
        editTemplate(item, null, openLibrary, data.items, data.customerAliases);
      else
        modal(
          item.name,
          "<div>" +
            instructionStages(item.flow)
              .map(
                ([id, label]) =>
                  "<details><summary>" +
                  esc(label) +
                  "</summary><p>" +
                  esc(item.steps[id]?.action || "Por definir") +
                  "</p></details>",
              )
              .join("") +
            "</div>",
          null,
        );
    });
  }
  async function loadRecord(load) {
    const r = await call("getDetalleCarga", load);
    return r.record;
  }
  /** Buscar es una lectura: aplicar requiere una confirmación aparte y la versión de la carga. */
  async function searchApproved(record) {
    const data = await call("getInstructivosRuta");
    const matches = findInstructionMatches(
      data.items,
      record,
      data.customerAliases,
    );
    const selected = matches.approved.length === 1 ? matches.approved[0] : null;
    const route =
      [record.origin_city, record.origin_state].filter(Boolean).join(", ") +
      " → " +
      [record.dest_city, record.dest_state].filter(Boolean).join(", ");
    const search = modal(
      "Buscar instructivo aprobado",
      "<p><strong>" +
        esc(record.customer || "Ruta general") +
        "</strong><br>" +
        esc(route) +
        "</p>" +
        (selected
          ? '<section class="instruction-search-result"><h3>' +
            esc(selected.name) +
            "</h3><p>Publicado y aprobado · " +
            (selected.customer
              ? "Específico de este cliente"
              : "Ruta general") +
            "</p>" +
            instructionStages(selected.flow)
              .map(([id, label], index) => {
                const step = selected.steps?.[id] || {};
                return (
                  "<details" +
                  (index === 0 ? " open" : "") +
                  "><summary>" +
                  esc(label) +
                  "</summary><p>" +
                  esc(step.action || "Instrucción por definir") +
                  "</p>" +
                  (step.condition
                    ? "<p><strong>Para avanzar:</strong> " +
                      esc(step.condition) +
                      "</p>"
                    : "") +
                  (step.on_issue
                    ? "<p><strong>Si hay un problema:</strong> " +
                      esc(step.on_issue) +
                      "</p>"
                    : "") +
                  (step.contact
                    ? "<p><strong>Contacto:</strong> " +
                      esc(step.contact) +
                      "</p>"
                    : "") +
                  (step.requires?.length
                    ? "<p><strong>Requisitos:</strong> " +
                      esc(
                        step.requires
                          .map((key) => requirementLabels[key] || key)
                          .join(" · "),
                      ) +
                      "</p>"
                    : "") +
                  "</details>"
                );
              })
              .join("") +
            "</section><p>Al aplicar se usará la versión publicada vigente para esta ruta. Se conserva la excepción particular de la carga.</p>"
          : matches.approved.length > 1
            ? '<p class="instruction-blockers">Hay varios instructivos aprobados con la misma prioridad. Revisa la biblioteca antes de aplicar uno.</p>'
            : '<p class="instruction-blockers">No hay un instructivo publicado que coincida con esta carga.</p>') +
        "<p>La coincidencia considera cliente, ciudad y estado de origen y destino. Un borrador o un instructivo pausado todavía no puede aplicarse.</p>" +
        (matches.unpublished.length
          ? '<div class="instruction-library-list">' +
            matches.unpublished
              .map(
                (item) =>
                  "<article><div><strong>" +
                  esc(item.name) +
                  "</strong><p>" +
                  (item.state === "draft"
                    ? "Guardado como borrador; falta publicarlo."
                    : "Pausado; no se aplica a cargas nuevas.") +
                  "</p></div>" +
                  (data.admin ||
                  (item.created_by === api.profile.id && item.state === "draft")
                    ? '<button type="button" class="file-btn file-btn-sec" data-search-edit="' +
                      esc(item.id) +
                      '">Revisar</button>'
                    : "") +
                  "</article>",
              )
              .join("") +
            "</div>"
          : "") +
        '<div class="instruction-actions"><button type="button" class="file-btn file-btn-sec" data-search-create>Crear instructivo para esta ruta</button><button type="button" class="file-btn file-btn-sec" data-search-library>Ver biblioteca</button></div>',
      selected ? "Aplicar a esta carga" : null,
      async () => {
        const result = await call(
          "instruccionCarga",
          record.load,
          "apply",
          {},
          record.updated_at,
        );
        window.dispatchEvent(
          new CustomEvent("panel:instruction-load", { detail: result }),
        );
      },
    );
    search.dialog.dataset.instructionSearch = "true";
    const afterEdit = () => {
      search.close();
      refresh();
    };
    search.form.querySelector("[data-search-create]").onclick = () =>
      editTemplate({}, record, afterEdit, data.items, data.customerAliases);
    search.form.querySelector("[data-search-library]").onclick = () =>
      openLibrary().catch((error) => {
        search.error.textContent = error.message;
      });
    search.form.querySelectorAll("[data-search-edit]").forEach((button) => {
      button.onclick = () =>
        editTemplate(
          data.items.find((item) => item.id === button.dataset.searchEdit),
          null,
          afterEdit,
          data.items,
          data.customerAliases,
        );
    });
    return search;
  }
  async function openLoad(load) {
    const record = await loadRecord(load),
      plan = record.instruction_plan || {};
    const body =
      instructionCard(record) +
      '<details class="instruction-full-plan"><summary>Recorrido completo</summary>' +
      instructionStages(plan.flow)
        .map(([id, label]) => {
          const step = plan.steps?.[id] || {};
          return (
            "<details><summary>" +
            esc(label) +
            "</summary><p>" +
            esc(step.action || "Instrucción por definir") +
            "</p>" +
            (step.condition
              ? "<p><b>Para avanzar:</b> " + esc(step.condition) + "</p>"
              : "") +
            (step.on_issue
              ? "<p><b>Si hay un problema:</b> " + esc(step.on_issue) + "</p>"
              : "") +
            "</details>"
          );
        })
        .join("") +
      '</details><div class="instruction-actions">' +
      [
        ["stage", "Confirmar etapa"],
        ["exception", "Excepción de esta carga"],
        ["apply", "Actualizar desde plantilla"],
        ["propose", "Guardar caso como propuesta"],
      ]
        .map(
          ([action, label]) =>
            '<button type="button" class="file-btn file-btn-sec" data-instruction-action="' +
            action +
            '" data-instruction-load="' +
            esc(load) +
            '">' +
            label +
            "</button>",
        )
        .join("") +
      "</div>";
    modal("Instructivo · Carga " + load, body, null);
  }
  async function action(load, name, button) {
    if (name === "open") return openLoad(load);
    const record = await loadRecord(load);
    if (name === "search") return searchApproved(record);
    if (
      ["complete", "condition", "reopen"].includes(name) &&
      button.dataset.instructionKey !==
        (record.instruction_context?.stage_key || "")
    )
      throw Error(
        "La etapa cambió. Vuelve a abrir el instructivo antes de continuar.",
      );
    if (name === "propose") {
      const libraryData = await call("getInstructivosRuta");
      return editTemplate(
        {},
        record,
        refresh,
        libraryData.items,
        libraryData.customerAliases,
      );
    }
    if (name === "stage")
      return modal(
        "Confirmar punto de seguimiento",
        select(
          "stage",
          "Etapa",
          [
            ["", "Automática según estatus"],
            ...instructionStages(record.instruction_plan?.flow),
          ],
          record.instruction_stage_override || "",
        ),
        "Confirmar etapa",
        async (data) => {
          const r = await call(
            "instruccionCarga",
            load,
            "stage",
            {
              stage: data.get("stage"),
            },
            record.updated_at,
          );
          window.dispatchEvent(
            new CustomEvent("panel:instruction-load", { detail: r }),
          );
        },
      );
    if (name === "exception")
      return modal(
        "Excepción de esta carga",
        area(
          "note",
          "Indicación particular",
          record.instruction_exception || "",
          'maxlength="3000"',
        ),
        "Guardar excepción",
        async (data) => {
          const r = await call(
            "instruccionCarga",
            load,
            "exception",
            {
              note: data.get("note"),
            },
            record.updated_at,
          );
          window.dispatchEvent(
            new CustomEvent("panel:instruction-load", { detail: r }),
          );
        },
      );
    const r = await call("instruccionCarga", load, name, {}, record.updated_at);
    window.dispatchEvent(
      new CustomEvent("panel:instruction-load", { detail: r }),
    );
    const parent = button.closest(".instruction-dialog");
    if (parent) {
      parent.close();
      parent.remove();
    }
  }
  doc.addEventListener("click", async (e) => {
    const libraryButton = e.target.closest("[data-instruction-library]"),
      open = e.target.closest("[data-instruction-open]"),
      actionButton = e.target.closest("[data-instruction-action]");
    if (!libraryButton && !open && !actionButton) return;
    const trigger = libraryButton || open || actionButton;
    if (trigger.disabled) return;
    const started = session;
    e.preventDefault();
    trigger.disabled = true;
    try {
      if (libraryButton) await openLibrary();
      else if (open) await openLoad(open.dataset.instructionOpen);
      else
        await action(
          actionButton.dataset.instructionLoad,
          actionButton.dataset.instructionAction,
          actionButton,
        );
    } catch (error) {
      if (started !== session) return;
      const parent = trigger.closest("dialog");
      const target = parent?.querySelector('.organize-error[role="alert"]');
      if (target) target.textContent = error.message;
      else
        modal(
          "No se pudo abrir el instructivo",
          "<p>" + esc(error.message) + "</p>",
          null,
        );
    } finally {
      trigger.disabled = false;
    }
  });
  window.addEventListener("panel:save", (e) => {
    if (e.detail?.phase === "reset") {
      session++;
      doc.querySelectorAll(".instruction-dialog").forEach((dialog) => {
        dialog.close();
        dialog.remove();
      });
    }
  });
  return { openLibrary };
}
