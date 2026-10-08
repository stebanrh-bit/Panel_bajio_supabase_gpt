import { prepareIncident, IncidentValidationError } from "./rules.js";

/** El aviso de campo obligatorio debe detener el envío, incluso sin validación nativa. */
export function bindIncidentForm({
  form,
  loadNumber,
  saveIncident,
  onSaved,
  onError,
  isCurrent = () => true,
}) {
  let saving = false;
  const clearFieldError = (event) => event.target.setCustomValidity?.("");
  form.addEventListener("input", clearFieldError);
  form.addEventListener("change", clearFieldError);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !isCurrent()) return;
    const button = form.querySelector("button");
    try {
      const values = prepareIncident(Object.fromEntries(new FormData(form)));
      if (!form.reportValidity()) return;
      saving = true;
      button.disabled = true;
      await saveIncident({ ...values, load: loadNumber });
      if (isCurrent()) await onSaved();
    } catch (error) {
      if (!isCurrent()) return;
      onError(error.message);
      if (error instanceof IncidentValidationError) {
        const control = form.elements[error.field];
        control?.setCustomValidity(error.message);
        control?.reportValidity();
        control?.focus();
      }
    } finally {
      saving = false;
      button.disabled = false;
    }
  });
}
