import { personalMethods } from "../personal/api.js";
import { gmailMethods } from "../gmail/api.js";
import config from "../config.js";
import { coordinatePoll } from "../coordination.js";
import { createContext } from "./context.js";
import { operationMethods } from "./operations.js";
import { teamMethods } from "./team.js";
import { radarMethods } from "./radar.js";
import { organizationMethods } from "./organization.js";
import { importMethods } from "./imports.js";

/** Cadena compatible con la UI original, sin reemplazar el servicio real de Google Maps. */
export function createRunner(methods, epoch = () => 0, observe = () => {}) {
  let nextOperationId = 0;
  // Las lecturas y el acceso no se presentan como guardados. Nunca se publican argumentos:
  // algunas acciones de cuentas reciben contraseñas y deben mantenerse privadas.
  const writes =
    /^(save|add|remove|set|guardar|quitar|asignar|seguir|dejarSeguir|registrar|mark|clear|confirmar|vincular|cambiar|revisar|eliminar|editar|resolver|enviar|deshacer|desbloquear|change|importLoads|recalcular)/;
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
            const id = ++nextOperationId;
            const write = writes.test(String(property));
            const announce = (phase, message) => {
              if (write && stamp === epoch()) observe({ id, phase, message });
            };
            Promise.resolve()
              .then(() => {
                if (typeof methods[property] !== "function")
                  throw Error(`Acción desconocida: ${String(property)}`);
                announce("start");
                return methods[property](...args);
              })
              .then(
                (result) => {
                  if (stamp === epoch() || loginMethods.has(property)) {
                    announce(
                      result?.ok === false ? "error" : "success",
                      result?.error,
                    );
                    success?.(result);
                  }
                },
                (error) => {
                  if (stamp === epoch() || loginMethods.has(property)) {
                    announce("error", error.message);
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
  const announce = (detail) => {
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("panel:save", { detail }));
  };
  const ctx = createContext(client);
  const operations = operationMethods(ctx);
  const team = teamMethods(ctx, operations);
  const methods = {
    ...gmailMethods(ctx),
    ...personalMethods(ctx),
    ...organizationMethods(ctx),
    ...operations,
    ...team,
    ...radarMethods(ctx),
    ...importMethods(ctx),
  };
  if (config.INTERNAL_ONLY) {
    for (const method of [
      "addPortalCliente",
      "removePortalCliente",
      "getPortalClientes",
      "setPortalClienteActivo",
      "setVistaLecturaPassword",
      "checkClientLogin",
      "checkVistaLecturaPassword",
      "getLoadsForCliente",
      "getLoadDetailForCliente",
      "getLoadsParaVista",
      "getIncidenciasParaVista",
      "getSlaComunicacion",
    ]) {
      if (methods[method])
        methods[method] = async () => {
          throw Error("Esta función no está disponible en la versión interna.");
        };
    }
  }
  if (config.INTERNAL_ONLY && !config.MANUAL_CLIENT_MESSAGES) {
    for (const method of ["registrarComunicacionCliente", "markClientNotified"])
      methods[method] = async () => {
        throw Error("La preparación de mensajes está desactivada.");
      };
  }
  const getChanges = async (known = {}, since = 0) => {
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
      loads: () => methods.getLoadsDelta(changed("personas") ? 0 : since),
      comentarios: operations.getUltimosComentarios,
      pendientes: operations.getPendientes,
      bitacora: operations.getBitacoraTurno,
      apartados: operations.getApartados,
      cierres: operations.getCierresTurnoRecibidos,
      avisos: methods.getAvisosOperacion,
    };
    const areas = {
      comentarios: "comentarios",
      pendientes: "pendientes",
      bitacora: "bitacora",
      apartados: "apartados",
      cierres: "cierres",
      avisos: "avisos",
      loads: "loads",
    };
    const entries = await Promise.all(
      Object.entries(calls)
        .filter(
          ([key]) =>
            changed(areas[key]) || (key === "loads" && changed("personas")),
        )
        .map(async ([key, call]) => [key, await call()]),
    );
    return {
      ok: true,
      marcas: marks.marcas,
      datos: { ...data, ...Object.fromEntries(entries) },
    };
  };
  methods.getPanelCambios = (known = {}, since = 0) =>
    coordinatePoll(
      (client.supabaseUrl || "panel") + ":" + (ctx.profile?.id || "anonymous"),
      known,
      () => getChanges(known, since),
    );
  return {
    run: createRunner(methods, () => ctx.epoch, announce),
    methods,
    restore: ctx.restore,
    logout: async () => {
      await ctx.logout();
      announce({ phase: "reset" });
    },
    get profile() {
      return ctx.profile;
    },
  };
}
