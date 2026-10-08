import { createTeamService } from "../../features/team/service.js";
import { createPortalService } from "../../features/portal/service.js";
import {
  json,
  roles,
  databaseRoles,
  loadModel,
  incidentModel,
} from "./models.js";

/** Equipo, preferencias y portales. Las cuentas Auth se administran solo en el servidor. */
export function teamMethods(ctx, operations) {
  const service = createTeamService(ctx.client);
  const portal = createPortalService(ctx.client);
  const name = ctx.personName;
  async function people() {
    if (!ctx.profile) {
      const result = await ctx.account("directory");
      return json(result.items);
    }
    ctx.staff();
    const profiles = ctx.remember("profiles", await service.people());
    const following = await service.following();
    return json(
      profiles
        .filter((row) => row.active && row.role !== "client")
        .map((row) => ({
          nombre: row.display_name,
          rol: roles[row.role] || "",
          correo: row.contact_email || "",
          passwordSet: row.password_ready !== false,
          sigueA: following
            .filter((item) => item.user_id === row.id)
            .map((item) => name(item.followed_user)),
        })),
    );
  }
  async function profileChange(displayName, changes) {
    ctx.staff(true);
    const old = ctx.previous("profiles", ctx.personId(displayName));
    await service.saveProfile(old, { ...old, ...changes });
    // Devuelve a leer después de confirmar el guardado, para conservar la versión del servidor.
    await people();
    return { ok: true };
  }
  const methods = {
    getPersonas: people,
    verifyIdentityLogin: (displayName, password) =>
      ctx.login(displayName, password),
    checkClientLogin: (username, password) =>
      ctx.login(username, password, "client"),
    checkVistaLecturaPassword: (password) =>
      ctx.login("vista-gerencia", password, "manager"),
    checkCsrPassword: (password) => ctx.account("verifyAdmin", [password]),
    changeCsrPassword: (current, next) =>
      ctx.account("changeOwnPassword", [current, next]),
    changeMyPassword: (_name, current, next) =>
      ctx.account("changeOwnPassword", [current, next]),
    getAsignaciones: async () => {
      if (!ctx.profile) return json([]);
      ctx.staff();
      const records = ctx.remember(
        "customer_assignments",
        await service.assignments(),
        "customer_key",
      );
      return json(
        records.map((row) => ({
          cliente: row.customer,
          csr: name(row.owner_id),
        })),
      );
    },
    asignarCliente: async (customer, owner) => {
      ctx.staff(true);
      const key = String(customer).trim().toLowerCase().replace(/\s+/g, " ");
      let old = null;
      try {
        old = ctx.previous("customer_assignments", key);
      } catch {}
      await service.assign(customer, ctx.personId(owner), old);
      return { ok: true };
    },
    removeAsignacion: async (customer) => {
      ctx.staff(true);
      const key = String(customer).trim().toLowerCase().replace(/\s+/g, " ");
      await service.assign(
        customer,
        null,
        ctx.previous("customer_assignments", key),
      );
      return { ok: true };
    },
    getLoadSeguimientos: async () => {
      if (!ctx.profile) return json([]);
      ctx.staff();
      return json(
        (await ctx.rows("load_followers", (query) => query, "load")).map(
          (row) => ({
            load: row.load,
            csr: name(row.user_id),
            creado_en: row.created_at,
          }),
        ),
      );
    },
    seguirLoad: async (load) => {
      ctx.staff(true);
      await ctx.rpc("ops_follow_load", { p_load: load, p_follow: true });
      return { ok: true };
    },
    dejarSeguirLoad: async (load) => {
      ctx.staff(true);
      await ctx.rpc("ops_follow_load", { p_load: load, p_follow: false });
      return { ok: true };
    },
    setMiSeguimiento: async (_name, _password, names) => {
      ctx.staff(true);
      await service.setFollowing(names.map(ctx.personId));
      return { ok: true };
    },
    getMisPlantillas: async () => {
      if (!ctx.profile) return { ok: true, templates: {}, labels: {} };
      ctx.staff();
      const records = await ctx.rows(
        "original_preferences",
        (query) => query.eq("user_id", ctx.profile.id),
        "user_id",
      );
      return {
        ok: true,
        templates: records[0]?.templates || {},
        labels: records[0]?.labels || {},
      };
    },
    guardarMisPlantillas: async (_name, _password, templates, labels) => {
      ctx.staff(true);
      await ctx.rpc("ops_save_original_templates", {
        p_templates: JSON.parse(templates),
        p_labels: JSON.parse(labels),
      });
      return { ok: true };
    },
    addPersona: (name, role, email) =>
      ctx.account("createStaff", [name, databaseRoles[role], email]),
    removePersona: (displayName) =>
      profileChange(displayName, { active: false }),
    setPersonaCorreo: (displayName, email) =>
      profileChange(displayName, { contact_email: email }),
    setPersonaRol: (displayName, role) =>
      profileChange(displayName, { role: databaseRoles[role] }),
    setPersonaPassword: (name, password) =>
      ctx.account("resetPassword", [name, password]),
    addPortalCliente: (name, customer, username, password) =>
      ctx.account("createClient", [name, customer, username, password]),
    removePortalCliente: (username) => ctx.account("disableClient", [username]),
    setPortalClienteActivo: (username, active) =>
      ctx.account("setClientActive", [username, Boolean(active)]),
    getPortalClientes: async () => {
      const result = await ctx.account("clients");
      return { ok: true, items: result.items };
    },
    setVistaLecturaPassword: (password) =>
      ctx.account("setManagerPassword", [password]),
    getBloqueos: () => ctx.account("lockouts"),
    desbloquearCuenta: (key) => ctx.account("unlock", [key]),
    getBitacoraAdmin: async () => {
      ctx.staff();
      if (ctx.profile.role !== "admin")
        throw Error("Solo administración puede consultar esta bitácora.");
      return {
        ok: true,
        items: (await service.events())
          .slice(0, 100)
          .map((row) => ({
            fecha: row.created_at,
            quien: name(row.actor),
            accion: row.action,
            detalle: JSON.stringify(row.details),
          })),
      };
    },
    getLoadsForCliente: async () =>
      (await portal.list()).map((row) => loadModel(row)),
    getLoadDetailForCliente: async (load) => {
      const raw = await portal.get(load);
      const row = loadModel(raw);
      return {
        ...row,
        documentos: {
          bol: row.bol,
          doda: row.doda,
          entry: row.entry,
          sobreListo: row.sobre_listo,
        },
        incidencias: raw.incidents.map((item) => incidentModel(item)),
        avisos: raw.messages.map((item) => ({
          fecha: item.created_at,
          canal: item.channel || "",
          mensaje: item.message,
        })),
      };
    },
    getLoadsParaVista: async () => {
      await people();
      const loads = (await operations.getLoadsDelta()).loads;
      const assignments = JSON.parse(await methods.getAsignaciones());
      const owners = new Map(
        assignments.map((item) => [
          item.cliente.trim().toLowerCase(),
          item.csr,
        ]),
      );
      return loads.map((row) => ({
        ...row,
        csr: owners.get(row.customer.trim().toLowerCase()) || "",
      }));
    },
    getIncidenciasParaVista: (load) => operations.getIncidencias(load),
  };
  return methods;
}
