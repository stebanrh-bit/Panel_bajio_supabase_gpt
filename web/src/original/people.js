/** El rol de administración también permite trabajar como operador, sin perder permisos. */
export function canOperate(person) {
  return person?.rol === "CSR" || person?.rol === "Supervisor";
}

/** Un supervisor aparece en la lista de CSR cuando tiene clientes o cargas a su cargo. */
export function isOperational(person, assignments = [], follows = []) {
  if (person?.rol === "CSR") return true;
  if (person?.rol !== "Supervisor") return false;
  return [...assignments, ...follows].some(
    (item) => item.csr === person.nombre,
  );
}
