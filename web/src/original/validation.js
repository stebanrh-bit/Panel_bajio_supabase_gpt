/** Compartir la validación nativa y mostrar el error al lado de su campo. */
export function mountValidation(doc = document) {
  const show = (field) => {
    if (!field.matches?.("input,textarea,select")) return;
    const id = field.id || "field-" + crypto.randomUUID();
    field.id = id;
    doc.getElementById(id + "-error")?.remove();
    field.removeAttribute("aria-invalid");
    if (field.validity.valid) return;
    const message = doc.createElement("span");
    message.id = id + "-error";
    message.className = "field-validation-error";
    message.textContent = field.validationMessage;
    message.role = "alert";
    field.after(message);
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", message.id);
  };
  doc.addEventListener(
    "invalid",
    (event) => {
      event.preventDefault();
      show(event.target);
    },
    true,
  );
  doc.addEventListener("input", (event) => {
    if (event.target.getAttribute?.("aria-invalid")) show(event.target);
  });
  doc.addEventListener(
    "submit",
    (event) => {
      if (!event.target.checkValidity()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.target.querySelector(":invalid")?.focus();
      }
    },
    true,
  );
}
