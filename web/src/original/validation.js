/** Un solo mensaje por campo; las ayudas existentes conservan su asociación accesible. */
export function showFieldValidation(field) {
  if (!field.matches?.("input,textarea,select")) return;
  const doc = field.ownerDocument;
  field.id ||= "field-" + crypto.randomUUID();
  const errorId = field.id + "-error";
  doc.getElementById(errorId)?.remove();
  const described = (field.getAttribute("aria-describedby") || "")
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  field.removeAttribute("aria-invalid");
  if (field.willValidate && !field.validity.valid) {
    const message = doc.createElement("span");
    message.id = errorId;
    message.className = "field-validation-error";
    message.textContent = field.validationMessage;
    message.role = "alert";
    field.after(message);
    described.push(errorId);
    field.setAttribute("aria-invalid", "true");
  }
  if (described.length)
    field.setAttribute("aria-describedby", described.join(" "));
  else field.removeAttribute("aria-describedby");
}

export function validateForm(form) {
  let firstInvalid = null;
  for (const field of form.querySelectorAll("input,select,textarea")) {
    if (!field.checkValidity()) firstInvalid ||= field;
    showFieldValidation(field);
  }
  firstInvalid?.focus();
  return !firstInvalid;
}

/** Rechazar un intervalo invertido antes de consultar, sin intercambiar fechas por el usuario. */
export function validateDateRange(start, end) {
  end.setCustomValidity(
    start.value && end.value && end.value < start.value
      ? "La fecha Hasta debe ser igual o posterior a Desde."
      : "",
  );
  showFieldValidation(end);
  if (!end.validity.valid) {
    end.focus();
    return false;
  }
  return true;
}

const mounted = new WeakSet();
export function mountValidation(doc = document) {
  if (mounted.has(doc)) return;
  mounted.add(doc);
  let firstInvalid = null;
  doc.addEventListener(
    "invalid",
    (event) => {
      event.preventDefault();
      showFieldValidation(event.target);
      // Los formularios nativos no emiten submit si son inválidos: enfocar desde invalid.
      if (!firstInvalid) {
        firstInvalid = event.target;
        queueMicrotask(() => {
          if (firstInvalid?.isConnected) firstInvalid.focus();
          firstInvalid = null;
        });
      }
    },
    true,
  );
  const refresh = (event) => {
    if (event.target.getAttribute?.("aria-invalid"))
      showFieldValidation(event.target);
  };
  doc.addEventListener("input", refresh);
  doc.addEventListener("change", refresh);
  doc.addEventListener(
    "submit",
    (event) => {
      if (event.target.matches("[data-managed-validation]")) return;
      if (!validateForm(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}
