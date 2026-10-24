import { escapeHtml as esc } from "../content.js";
import { validateForm } from "../validation.js";
import { field, area, select } from "../dialogs.js";
import {
  instructionStages,
  requirementLabels,
  instructionCard,
} from "./content.js";

/** Editor de conocimiento y acciones por carga. Ninguna propuesta se publica sola. */
export function mountInstructions(api, doc = document) {
  let library = null;
  const call = async (name, ...args) => {
    const result = await api.methods[name](...args);
    if (result?.ok === false) throw Error(result.error || "No se pudo guardar");
    return result;
  };
  const refresh = () =>
    window.dispatchEvent(new CustomEvent("panel:instruction-refresh"));
  function modal(title, body, submit, onSave) {
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
      dialog.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        await onSave(data, form);
        busy = false;
        close();
      } catch (err) {
        error.textContent = err.message;
        busy = false;
        dialog.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
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
  ) {
    const admin = api.profile.role === "admin";
    let flow = record.flow || source?.instruction_context?.flow || "export";
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
    const key = (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const base =
      admin && record.state !== "approved"
        ? knownItems.find(
            (item) =>
              item.state === "approved" &&
              item.id !== record.id &&
              item.flow === flow &&
              [
                "customer",
                "origin_city",
                "origin_state",
                "dest_city",
                "dest_state",
              ].every((field) => key(item[field]) === key(seed[field])),
          )
        : null;

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
      '</div><div class="instruction-step-fields">' +
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
        await call(
          "guardarInstructivoRuta",
          record.id || null,
          record.updated_at || null,
          values,
          data.has("apply_missing"),
        );
        refresh();
        await onDone();
      },
    );
    editor.form.elements.flow.addEventListener("change", (e) => {
      drafts[flow] = readSteps(editor.form, flow);
      flow = e.target.value;
      editor.form.querySelector(".instruction-step-fields").innerHTML =
        stepFields(flow, drafts[flow] || {});
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
        editTemplate(item, null, openLibrary, data.items);
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
      return editTemplate({}, record, () => refresh(), libraryData.items);
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
    button.disabled = true;
    try {
      const r = await call(
        "instruccionCarga",
        load,
        name,
        {},
        record.updated_at,
      );
      window.dispatchEvent(
        new CustomEvent("panel:instruction-load", { detail: r }),
      );
      const parent = button.closest(".instruction-dialog");
      if (parent) {
        parent.close();
        parent.remove();
      }
    } finally {
      button.disabled = false;
    }
  }
  doc.addEventListener("click", async (e) => {
    const libraryButton = e.target.closest("[data-instruction-library]"),
      open = e.target.closest("[data-instruction-open]"),
      actionButton = e.target.closest("[data-instruction-action]");
    if (!libraryButton && !open && !actionButton) return;
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
      const parent = (libraryButton || open || actionButton).closest("dialog");
      const target = parent?.querySelector('[role="alert"]');
      if (target) target.textContent = error.message;
      else
        modal(
          "No se pudo abrir el instructivo",
          "<p>" + esc(error.message) + "</p>",
          null,
        );
    }
  });
  window.addEventListener("panel:save", (e) => {
    if (e.detail?.phase === "reset")
      doc.querySelectorAll(".instruction-dialog").forEach((dialog) => {
        dialog.close();
        dialog.remove();
      });
  });
  return { openLibrary };
}
