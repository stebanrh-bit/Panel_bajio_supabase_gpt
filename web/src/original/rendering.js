/** Reconciliar por clave conserva controles y foco cuando solo cambia el orden u otra fila. */
const states = new WeakMap();
export function reset(container) {
  if (container) states.delete(container);
}
export function renderKeyed(
  container,
  records,
  keyOf,
  htmlOf,
  { wrapperTag = "div", nodesPerItem = 1 } = {},
) {
  if (!container) return;
  const previous = states.get(container) || new Map(),
    next = new Map();
  let cursor = container.firstChild;
  for (const record of records) {
    const key = String(keyOf(record)),
      html = htmlOf(record);
    if (next.has(key)) throw Error("Clave repetida al mostrar registros.");
    let entry = previous.get(key);
    if (
      !entry ||
      entry.html !== html ||
      entry.nodes.some((n) => n.parentNode !== container)
    ) {
      const wrapper = container.ownerDocument.createElement(wrapperTag);
      wrapper.innerHTML = html;
      const nodes = [...wrapper.childNodes].filter((n) => n.nodeType === 1);
      if (nodes.length !== nodesPerItem)
        throw Error("La fila no tiene la estructura esperada.");
      if (entry) {
        if (entry.nodes.includes(cursor))
          cursor = entry.nodes.at(-1).nextSibling;
        entry.nodes.forEach((n) => n.remove());
      }
      entry = { html, nodes };
    }
    for (const node of entry.nodes) {
      if (node === cursor) cursor = cursor.nextSibling;
      else container.insertBefore(node, cursor);
    }
    next.set(key, entry);
  }
  for (const [key, entry] of previous)
    if (!next.has(key)) entry.nodes.forEach((n) => n.remove());
  // Retirar mensajes de lista vacía que no pertenecen a una clave.
  const owned = new Set([...next.values()].flatMap((e) => e.nodes));
  for (const node of [...container.childNodes])
    if (!owned.has(node)) node.remove();
  states.set(container, next);
}
