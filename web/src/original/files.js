/** El lector se descarga al seleccionar un archivo, sin incluirlo en el arranque. */
let sourcePromise;
let sequence = 0;
async function workerSource() {
  if (!sourcePromise)
    sourcePromise = (async () => {
      const native = globalThis.google?.script?.run;
      if (native)
        return new Promise((resolve, reject) =>
          native
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)
            .panelFileReader(),
        );
      const response = await fetch(new URL("./lector.html", location.href));
      if (!response.ok) throw Error("No se pudo cargar el lector de archivos.");
      return response.text();
    })().catch((error) => {
      sourcePromise = null;
      throw error;
    });
  return sourcePromise;
}
export async function parseLoadFile(file, readLegacy, options = {}) {
  if (typeof Worker === "undefined")
    throw Error(
      "Este navegador necesita soporte de Web Workers para leer archivos.",
    );
  if (!file || file.size > 10 * 1024 * 1024)
    throw Error("Selecciona un archivo de hasta 10 MB.");
  const source = await workerSource(),
    url = URL.createObjectURL(
      new Blob([source], { type: "application/javascript" }),
    ),
    worker = new Worker(url),
    id = ++sequence;
  return new Promise((resolve, reject) => {
    let ended = false;
    const finish = (error, result) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
      URL.revokeObjectURL(url);
      error ? reject(error) : resolve(result);
    };
    const abort = () => finish(new Error("Lectura cancelada."));
    const timer = setTimeout(
      () => finish(new Error("El archivo tardó demasiado. Revisa su tamaño.")),
      90000,
    );
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.progress) {
        options.onProgress?.(data.progress);
        return;
      }
      if (data.error) {
        finish(Error(data.error));
        return;
      }
      finish(null, data.records);
    };
    worker.onerror = () =>
      finish(
        Error("No se pudo iniciar el lector. Actualiza lector.html en Google."),
      );
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    worker.postMessage({ id, file, raw: Boolean(options.raw) });
  });
}
