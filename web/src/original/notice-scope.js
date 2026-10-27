/** Alcance personal de la campana. No depende del rol ni de los filtros de consulta del panel. */
export function customerNoticeScope(identity, assignments = [], loads = []) {
  const name = String(identity || "").trim();
  const customerKey = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const loadKey = (value) => String(value || "").trim();
  const customers = new Set(
    assignments
      .filter((item) => name && String(item.csr || "").trim() === name)
      .flatMap((item) =>
        [item.cliente, ...(item.aliases || [])].map(customerKey),
      )
      .filter(Boolean),
  );
  const ownLoads = new Set(
    loads
      .filter((item) => customers.has(customerKey(item.customer)))
      .map((item) => loadKey(item.load))
      .filter(Boolean),
  );
  const hasLoad = (load) => ownLoads.has(loadKey(load));
  return {
    hasLoad,
    // Una tarea sin carga sigue siendo personal si se asignó expresamente a esta cuenta.
    hasTask: (task) =>
      task.load
        ? hasLoad(task.load)
        : !!name && (task.asignado_a || task.asignado_csr) === name,
    // El CSR de VG es texto libre: nunca acredita la pertenencia del cliente.
    hasReservation: (item) =>
      hasLoad(item.related_load || item.mi_carga || item.load),
  };
}
