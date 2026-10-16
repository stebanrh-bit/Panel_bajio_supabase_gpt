/** Una consulta externa siempre termina y una búsqueda nueva cancela la anterior del grupo. */
const pending = new Map();
export async function fetchExternal(url, options = {}) {
  const { timeout = 20000, group, ...init } = options;
  if (group) pending.get(group)?.abort();
  const controller = new AbortController();
  if (group) pending.set(group, controller);
  const abort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) abort();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          "La consulta tardó demasiado. Intenta de nuevo.",
          "TimeoutError",
        ),
      ),
    timeout,
  );
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    // Consumir también el cuerpo dentro del plazo. Las consultas del panel usan JSON.
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      json: async () => JSON.parse(body),
      text: async () => body,
    };
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
    if (group && pending.get(group) === controller) pending.delete(group);
  }
}
export function cancel(group) {
  pending.get(group)?.abort();
  pending.delete(group);
}
