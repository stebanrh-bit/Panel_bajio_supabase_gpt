/** Normaliza solo mayúsculas y espacios: no cambia la identidad del cliente. */
export function normalizeCustomer(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

/** Convierte los valores del formulario en una solicitud válida para Supabase. */
export function preparePendingLoad(formValues) {
  const pendingLoad = {
    customer: String(formValues.customer ?? '').trim(),
    origin: String(formValues.origin ?? '').trim(),
    destination: String(formValues.destination ?? '').trim(),
    estimated_date: formValues.estimated_date || null,
    note: String(formValues.note ?? '').trim(),
  };

  if (!pendingLoad.customer || pendingLoad.customer.length > 200) {
    throw new Error('Indica un cliente de hasta 200 caracteres.');
  }
  if (pendingLoad.origin.length > 250 || pendingLoad.destination.length > 250) {
    throw new Error('El origen y el destino admiten hasta 250 caracteres.');
  }
  if (pendingLoad.note.length > 9500) {
    throw new Error('La nota admite hasta 9500 caracteres.');
  }

  // La fecha estimada es un día, no una hora: se conserva como YYYY-MM-DD.
  if (pendingLoad.estimated_date) {
    const value = pendingLoad.estimated_date;
    const date = new Date(`${value}T00:00:00Z`);
    const validFormat = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const validDate = !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    if (!validFormat || !validDate || value.startsWith('0000-')) {
      throw new Error('La fecha estimada no es válida.');
    }
  }
  return pendingLoad;
}

/** Administración puede operar todos los registros; un CSR solamente los propios. */
export function canEditPendingLoad(record, userId, role) {
  return record.state === 'pending'
    && (role === 'admin' || (role === 'csr' && record.created_by === userId));
}

/** El filtro facilita la elección; la base vuelve a verificar cliente y estado al vincular. */
export function matchingLoads(pendingLoad, loads) {
  const customer = normalizeCustomer(pendingLoad.customer);
  return loads.filter(load => !load.archived && normalizeCustomer(load.customer) === customer);
}
