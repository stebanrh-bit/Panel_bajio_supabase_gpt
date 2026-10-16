import { escapeHtml as esc } from "./content.js";

/** Diálogo único con validación junto al campo. Cancelar nunca ejecuta la operación. */
export function formDialog(title, content, submitLabel = "Guardar") {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "organize-dialog";
    dialog.innerHTML = `<form novalidate><header><h2>${esc(title)}</h2><button type="button" data-close aria-label="Cerrar">×</button></header><div class="organize-fields">${content}</div><p role="alert" class="organize-error"></p><footer><button type="button" data-close>Cancelar</button><button type="submit">${esc(submitLabel)}</button></footer></form>`;
    const close = (value) => {
      dialog.close();
      dialog.remove();
      previous?.focus();
      resolve(value);
    };
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(null);
    });
    dialog
      .querySelectorAll("[data-close]")
      .forEach((b) => (b.onclick = () => close(null)));
    const form = dialog.querySelector("form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      form.querySelectorAll("[data-field-error]").forEach((n) => n.remove());
      let invalid = null;
      for (const input of form.querySelectorAll("input,select,textarea")) {
        input.removeAttribute("aria-invalid");
        if (!input.checkValidity()) {
          invalid ||= input;
          input.setAttribute("aria-invalid", "true");
          const hint = document.createElement("small");
          hint.dataset.fieldError = "";
          hint.className = "organize-error";
          hint.textContent = input.validationMessage;
          input.after(hint);
        }
      }
      if (invalid) {
        invalid.focus();
        return;
      }
      close(Object.fromEntries(new FormData(form)));
    });
    document.body.append(dialog);
    dialog.showModal();
    form.querySelector("input,textarea,select")?.focus();
  });
}
export const field = (name, label, type = "text", value = "", attrs = "") =>
  `<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
export const area = (
  name,
  label,
  value = "",
  attrs = 'required maxlength="1000"',
) =>
  `<label>${esc(label)}<textarea name="${esc(name)}" ${attrs}>${esc(value)}</textarea></label>`;
export const select = (name, label, options, value = "", attrs = "") =>
  `<label>${esc(label)}<select name="${esc(name)}" ${attrs}>${options.map(([id, label]) => `<option value="${esc(id)}" ${String(value) === String(id) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`;
export async function reason(effect) {
  const data = await formDialog(
    "Motivo de la acción",
    `<p>${esc(effect)}</p>${area("reason", "Motivo", "", 'required minlength="3" maxlength="1000"')}`,
    "Confirmar acción",
  );
  return data?.reason;
}
export async function closure(people) {
  return formDialog(
    "Entregar el turno",
    `<p>El cierre queda guardado para el equipo. Si no hay pendientes críticos, escribe «Sin pendientes críticos».</p>${area("critical", "Pendientes críticos", "", 'required minlength="3" maxlength="5000"')}${select("responsible", "Asignar seguimiento a:", [["", "Elige a una persona"], ...people.filter((p) => p.active && ["admin", "csr"].includes(p.role)).map((p) => [p.id, p.display_name])], "", "required")}${area("nextAction", "Próxima acción y plazo", "", 'required minlength="3" maxlength="5000"')}`,
    "Guardar cierre",
  );
}
