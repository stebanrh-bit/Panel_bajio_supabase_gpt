import { escapeHtml as esc } from "../content.js";
import { validateForm } from "../validation.js";
/** Diálogo reutilizable: conserva valores ante errores y no acepta envíos dobles. */
export function personalDialog(title, body, onSave, submit = "Guardar") {
  const previous = document.activeElement,
    dialog = document.createElement("dialog");
  dialog.className = "personal-dialog";
  const heading = "personal-" + crypto.randomUUID();
  dialog.setAttribute("aria-labelledby", heading);
  dialog.innerHTML = `<form novalidate data-managed-validation><header><h2 id="${heading}">${esc(title)}</h2><button type="button" data-personal-close aria-label="Cerrar">×</button></header><div class="personal-body">${body}</div><p class="personal-error" role="alert"></p><footer><button type="button" data-personal-close>Cancelar</button>${onSave ? `<button type="submit">${esc(submit)}</button>` : ""}</footer></form>`;
  const form = dialog.querySelector("form"),
    error = dialog.querySelector('[role="alert"]');
  let busy = false,
    closed = false;
  const close = () => {
    if (busy || closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    previous?.isConnected && previous.focus();
  };
  dialog
    .querySelectorAll("[data-personal-close]")
    .forEach((b) => (b.onclick = close));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || !validateForm(form)) return;
    busy = true;
    error.textContent = "";
    const buttons = [...dialog.querySelectorAll("button")],
      disabled = buttons.map((b) => b.disabled);
    buttons.forEach((b) => (b.disabled = true));
    try {
      const keep = await onSave(new FormData(form), form);
      busy = false;
      if (keep !== false) close();
    } catch (err) {
      error.textContent = err.message;
      busy = false;
    } finally {
      buttons.forEach((b, i) => (b.disabled = disabled[i]));
    }
  });
  const reset = (e) => {
    if (e.detail?.phase === "reset") {
      busy = false;
      close();
    }
  };
  window.addEventListener("panel:save", reset);
  dialog.addEventListener(
    "close",
    () => window.removeEventListener("panel:save", reset),
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("input,select,textarea")?.focus();
  return { dialog, form, error, close };
}
