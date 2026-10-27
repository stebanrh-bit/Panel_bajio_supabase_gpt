/** Un aviso por carga. Conserva todas las claves para leer o posponer sus motivos juntos. */
export function groupNotices(items) {
  const groups = new Map(),
    rank = { critical: 0, warn: 1, info: 2 };
  for (const item of items) {
    const id = item.load ? "load:" + item.load : "event:" + item.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  return [...groups.values()].map((list) => {
    list.sort(
      (a, b) =>
        (rank[a.sev] ?? 3) - (rank[b.sev] ?? 3) ||
        Date.parse(b.ts || 0) - Date.parse(a.ts || 0),
    );
    const first = list[0],
      details = [...new Set(list.map((i) => i.detalle).filter(Boolean))];
    return {
      ...first,
      nuevo: list.some((i) => i.nuevo),
      memberIds: list.map((i) => i.id),
      detalle:
        details.slice(0, 3).join(" · ") +
        (details.length > 3
          ? " · " + (details.length - 3) + " motivos más"
          : ""),
    };
  });
}
