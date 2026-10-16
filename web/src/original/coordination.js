/** Coordina solo sondeos de fondo. Una pestaña enfocada o una actualización manual consulta siempre. */
export async function coordinatePoll(key, known, call, env = globalThis) {
  const background =
    env.document?.hidden ||
    (env.document?.hasFocus && !env.document.hasFocus());
  if (!background || !Object.keys(known).length) return call();
  const storage = env.localStorage,
    stampKey = "panel:poll:" + key;
  const deferred = () => ({
    ok: true,
    deferred: true,
    marcas: known,
    datos: {},
  });
  const run = async () => {
    try {
      if (Date.now() - Number(storage?.getItem(stampKey) || 0) < 60000)
        return deferred();
    } catch {}
    const result = await call();
    if (result?.ok)
      try {
        storage?.setItem(stampKey, String(Date.now()));
      } catch {}
    return result;
  };
  return env.navigator?.locks
    ? env.navigator.locks.request(stampKey, { ifAvailable: true }, (lock) =>
        lock ? run() : deferred(),
      )
    : run();
}
