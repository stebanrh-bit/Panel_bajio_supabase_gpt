import { createContext } from "./context.js";
import { operationMethods } from "./operations.js";
import { teamMethods } from "./team.js";
import { radarMethods } from "./radar.js";
import { importMethods } from "./imports.js";

/** Cadena compatible con la UI original, sin reemplazar el servicio real de Google Maps. */
export function createRunner(methods, epoch = () => 0) {
  const loginMethods = new Set([
    "verifyIdentityLogin",
    "checkClientLogin",
    "checkVistaLecturaPassword",
  ]);
  function chain(success, failure) {
    return new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "then") return undefined;
          if (property === "withSuccessHandler")
            return (callback) => chain(callback, failure);
          if (property === "withFailureHandler")
            return (callback) => chain(success, callback);
          return (...args) => {
            const stamp = epoch();
            Promise.resolve()
              .then(() => {
                if (typeof methods[property] !== "function")
                  throw Error(`Acción desconocida: ${String(property)}`);
                return methods[property](...args);
              })
              .then(
                (result) => {
                  if (stamp === epoch() || loginMethods.has(property))
                    success?.(result);
                },
                (error) => {
                  if (stamp === epoch() || loginMethods.has(property)) {
                    if (failure) failure(error);
                    else if (success)
                      success({ ok: false, error: error.message });
                    else
                      console.error(
                        `No se completó ${String(property)}:`,
                        error.message,
                      );
                  }
                },
              )
              .catch((error) =>
                console.error("Error al mostrar la respuesta:", error.message),
              );
          };
        },
      },
    );
  }
  return chain();
}
export function createOriginalApi(client) {
  const ctx = createContext(client);
  const operations = operationMethods(ctx);
  const team = teamMethods(ctx, operations);
  const methods = {
    ...operations,
    ...team,
    ...radarMethods(ctx),
    ...importMethods(ctx),
  };
  methods.getPanelCambios = async (known = {}, since = 0) => {
    ctx.staff();
    const marks = await ctx.rpc("ops_original_marks");
    if (!marks.ok) return marks;
    const changed = (key) => !since || known[key] !== marks.marcas[key];
    const data = {};
    // Resolver personas antes de las cargas para traducir autores UUID a nombres.
    if (changed("personas")) {
      data.personas = await team.getPersonas();
      data.asignaciones = await team.getAsignaciones();
      data.seguimientos = await team.getLoadSeguimientos();
    }
    const calls = {
      loads: () => methods.getLoadsDelta(),
      comentarios: operations.getUltimosComentarios,
      pendientes: operations.getPendientes,
      bitacora: operations.getBitacoraTurno,
      apartados: operations.getApartados,
      cierres: operations.getCierresTurnoRecibidos,
    };
    const areas = {
      comentarios: "comentarios",
      pendientes: "pendientes",
      bitacora: "bitacora",
      apartados: "apartados",
      cierres: "cierres",
      loads: "loads",
    };
    const entries = await Promise.all(
      Object.entries(calls)
        .filter(([key]) => changed(areas[key]))
        .map(async ([key, call]) => [key, await call()]),
    );
    return {
      ok: true,
      marcas: marks.marcas,
      datos: { ...data, ...Object.fromEntries(entries) },
    };
  };
  return {
    run: createRunner(methods, () => ctx.epoch),
    methods,
    restore: ctx.restore,
    logout: ctx.logout,
    get profile() {
      return ctx.profile;
    },
  };
}
