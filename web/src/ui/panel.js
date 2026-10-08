import { escapeHtml } from "./html.js";

export const roleLabels = {
  pending: "Acceso pendiente",
  admin: "Administración",
  csr: "Operador",
  manager: "Gerencia",
  client: "Cliente",
};
export const personName = (people, id) =>
  people.find((person) => person.id === id)?.display_name ||
  people.find((person) => person.id === id)?.contact_email ||
  "Cuenta sin nombre";
export const formatDate = (value) =>
  value ? new Date(value).toLocaleString() : "—";

/** Opciones seguras para seleccionar cuentas existentes; los identificadores quedan como valores. */
export function personOptions(
  people,
  selected = "",
  placeholder = "Selecciona una persona…",
  operatorsOnly = true,
) {
  return (
    `<option value="">${escapeHtml(placeholder)}</option>` +
    people
      .filter(
        (person) =>
          (!operatorsOnly || ["admin", "csr"].includes(person.role)) &&
          (person.active !== false || person.id === selected),
      )
      .map(
        (
          person,
        ) => `<option value="${escapeHtml(person.id)}" ${person.id === selected ? "selected" : ""}>
      ${escapeHtml(personName(people, person.id))} · ${roleLabels[person.role]}
    </option>`,
      )
      .join("")
  );
}

/** Protege cada pantalla frente a dobles envíos y respuestas recibidas después de navegar. */
export function createPanelController(container, onError) {
  let mounted = true;
  let request = 0;
  async function load(read, render) {
    if (!mounted) return;
    const current = ++request;
    try {
      const data = await read();
      if (mounted && current === request) render(data);
    } catch (error) {
      if (mounted && current === request) onError(error.message);
    }
  }
  async function run(button, action) {
    if (!mounted || button.disabled) return;
    button.disabled = true;
    onError("");
    try {
      await action();
    } catch (error) {
      if (mounted) onError(error.message);
    } finally {
      button.disabled = false;
    }
  }
  function invalidate() {
    request++;
  }
  function dispose() {
    mounted = false;
    request++;
  }
  return {
    get mounted() {
      return mounted;
    },
    container,
    load,
    run,
    invalidate,
    dispose,
  };
}
