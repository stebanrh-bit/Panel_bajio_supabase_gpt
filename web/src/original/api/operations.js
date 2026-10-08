import { unwrap } from "../../data/supabase.js";
import { createPendingLoadsService } from "../../features/pending-loads/service.js";
import { createReservedLoadsService } from "../../features/reserved-loads/service.js";
import { createShiftsService } from "../../features/shifts/service.js";
import { prepareIncident } from "../../features/incidents/rules.js";
import {
  json,
  date,
  severity,
  loadModel,
  commentModel,
  incidentModel,
  pendingModel,
  taskModel,
  reservedModel,
  communicationModel,
  communicationSla,
} from "./models.js";

/** Operación diaria: cada escritura conserva la versión que el usuario leyó. */
export function operationMethods(ctx) {
  const {
    client,
    rows,
    rpc,
    safe,
    remember,
    previous,
    saved,
    personName: name,
  } = ctx;
  const pending = guarded(createPendingLoadsService(client));
  const reserved = guarded(createReservedLoadsService(client));
  const shifts = guarded(createShiftsService(client));
  function guarded(service) {
    return Object.fromEntries(
      Object.entries(service).map(([method, call]) => [
        method,
        (...args) => safe(call(...args)),
      ]),
    );
  }
  async function listLoads() {
    ctx.staff();
    const [loads, incidents] = await Promise.all([
      rows("loads", (query) => query.eq("archived", false), "load"),
      rows("incidents", (query) => query.is("deleted_at", null)),
    ]);
    remember("loads", loads, "load");
    const counts = new Map();
    incidents.forEach((row) =>
      counts.set(row.load, (counts.get(row.load) || 0) + 1),
    );
    return loads.map((row) =>
      loadModel({ ...row, incidenciasCount: counts.get(row.load) || 0 }, name),
    );
  }
  async function updateLoad(load, values) {
    ctx.staff(true);
    return ctx.serial(`load:${load}`, async () => {
      const old = previous("loads", load);
      const records = await safe(
        unwrap(
          client
            .from("loads")
            .update(values)
            .eq("load", load)
            .eq("updated_at", old.updated_at)
            .eq("archived", false)
            .select("*"),
        ),
      );
      if (records.length !== 1)
        throw Error(
          "La carga cambió o no puedes editarla. Actualiza antes de guardar.",
        );
      return {
        ok: true,
        ...loadModel(saved("loads", records[0], "load"), name),
      };
    });
  }
  async function loadRpc(load, method, extra = {}) {
    ctx.staff(true);
    return ctx.serial(`load:${load}`, async () => {
      const old = previous("loads", load);
      const result = await rpc(method, {
        p_load: load,
        p_version: old.updated_at,
        ...extra,
      });
      const record = Array.isArray(result) ? result[0] : result;
      if (!record) throw Error("La carga cambió. Actualiza antes de guardar.");
      return { ok: true, ...loadModel(saved("loads", record, "load"), name) };
    });
  }
  const methods = {
    getLoadsDelta: async () =>
      ctx.profile
        ? { ok: true, full: true, ts: Date.now(), loads: await listLoads() }
        : { ok: false, full: true, ts: 0, loads: [] },
    getComments: async (load) => {
      if (!ctx.profile) return json([]);
      ctx.staff();
      const records = ctxHasPending(load)
        ? await pending.comments(load)
        : await rows(
            "comments",
            (query) => query.eq("load", load),
            "created_at",
          );
      return json(records.reverse().map((row) => commentModel(row, name)));
    },
    addComment: async (load, text) => {
      ctx.staff(true);
      const body = String(text || "").trim();
      if (!body || body.length > 10000)
        throw Error("Escribe un comentario de hasta 10000 caracteres.");
      if (ctxHasPending(load)) await pending.addComment(load, body);
      else await safe(unwrap(client.from("comments").insert({ load, body })));
      // Agregar un comentario también revisa el tránsito: leer la versión devuelta por el servidor.
      const record = ctxHasPending(load)
        ? null
        : await safe(
            unwrap(client.from("loads").select("*").eq("load", load).single()),
          );
      if (record) saved("loads", record, "load");
      return {
        ok: true,
        ts: new Date().toISOString(),
        usuario: ctx.profile.display_name,
        recordatorio_fecha: record?.recordatorio_fecha || "",
      };
    },
    getUltimosComentarios: async () => {
      if (!ctx.profile) return json({});
      ctx.staff();
      const records = await rows("comments", (query) => query, "created_at");
      return json(
        Object.fromEntries(
          records.map((row) => [row.load, commentModel(row, name)]),
        ),
      );
    },
    getIncidencias: async (load) => {
      if (!ctx.profile) return json([]);
      ctx.staff();
      return json(
        (
          await rows(
            "incidents",
            (query) => query.eq("load", load).is("deleted_at", null),
            "created_at",
          )
        )
          .reverse()
          .map((row) => incidentModel(row, name)),
      );
    },
    addIncidencia: async (load, category, legacyLevel, description, action) => {
      ctx.staff(true);
      const values = prepareIncident({
        category,
        severity: severity[legacyLevel],
        description,
        action_taken: action,
      });
      const record = await unwrap(
        client
          .from("incidents")
          .insert({ load, ...values })
          .select("*")
          .single(),
      );
      return { ok: true, id: record.id, fecha: record.created_at };
    },
    removeIncidencia: async (id) => {
      await rpc("ops_remove_incident", { p_id: id });
      return { ok: true };
    },
    getHistorialLoad: async (load) => {
      ctx.staff();
      const items = (
        await rows(
          "load_history",
          (query) => query.eq("load", load),
          "changed_at",
        )
      )
        .reverse()
        .flatMap((row) =>
          Object.keys(row.after_data || {})
            .filter(
              (field) =>
                !["updated_at", "updated_by", "created_at"].includes(field) &&
                String(row.before_data?.[field] ?? "") !==
                  String(row.after_data[field] ?? ""),
            )
            .map((field) => ({
              id: `${row.id}:${field}`,
              load,
              timestamp: row.changed_at,
              campo: field,
              valor_anterior: row.before_data?.[field] ?? "",
              valor_nuevo: row.after_data[field],
              usuario: name(row.actor),
            })),
        );
      return { ok: true, items };
    },
    getComunicaciones: async (load) => {
      ctx.staff();
      return {
        ok: true,
        items: (
          await rows(
            "communications",
            (query) => query.eq("load", load),
            "created_at",
          )
        )
          .reverse()
          .map((row) => communicationModel(row, name)),
      };
    },
    getComunicacionesPorCliente: async (customer) => {
      ctx.staff();
      const loads = await rows(
        "loads",
        (query) => query.eq("customer", customer),
        "load",
      );
      const ids = new Set(loads.map((row) => row.load));
      return {
        ok: true,
        items: (await rows("communications", (query) => query, "created_at"))
          .filter((row) => ids.has(row.load))
          .reverse()
          .map((row) => communicationModel(row, name)),
      };
    },
    getSlaComunicacion: async () => {
      if (!ctx.profile) return { ok: true, pairs: [] };
      ctx.staff();
      return {
        ok: true,
        pairs: communicationSla(
          await rows(
            "communications",
            (query) =>
              query.gte(
                "created_at",
                new Date(Date.now() - 30 * 86400000).toISOString(),
              ),
            "created_at",
          ),
        ),
      };
    },
    markClientNotified: (load) =>
      loadRpc(load, "confirm_client_notice", {
        p_channel: "Otro",
        p_notice_type: "Actualización operativa",
      }),
    registrarComunicacionCliente: async (load, channel, message) => {
      const result = await loadRpc(load, "confirm_client_notice", {
        p_channel: channel === "Email" ? "Correo" : channel || "Otro",
        p_notice_type: String(message || "Actualización operativa").slice(
          0,
          200,
        ),
      });
      return {
        ...result,
        canal: channel || "Otro",
        notified_at: result.client_notified_at,
      };
    },
    saveStatus: (load, status) => updateLoad(load, { status }),
    saveStatusConRecordatorio: (load, status, when) =>
      updateLoad(load, { status, recordatorio_fecha: date(when) }),
    saveRecordatorio: (load, when) =>
      updateLoad(load, { recordatorio_fecha: date(when) }),
    saveNextReview: (load, when, note) =>
      updateLoad(load, {
        next_review_at: date(when),
        next_review_note: String(note || "").trim(),
      }),
    clearNextReview: (load) =>
      updateLoad(load, { next_review_at: "", next_review_note: "" }),
    confirmarCruceUsa: (load, confirmed, when) =>
      updateLoad(
        load,
        confirmed
          ? { cruce_confirmado: "true" }
          : { cruce_confirmado: "false", cruce_usa_fecha: date(when) },
      ),
    saveDocItem: (load, field, value) => {
      if (!["bol", "doda", "entry", "sobre_listo"].includes(field))
        throw Error("Documento no válido.");
      return updateLoad(load, { [field]: value ? "true" : "false" });
    },
    guardarMasivo: async (loads, action, value) => {
      ctx.staff(true);
      const fields = {
        status: "status",
        pod: "pod_sent",
        pod_sent: "pod_sent",
        recargos: "recargos_vg",
        recargos_vg: "recargos_vg",
        color: "color",
        bol: "bol",
        doda: "doda",
        entry: "entry",
        sobre_listo: "sobre_listo",
      };
      const field = fields[action];
      if (!field) throw Error("Acción masiva no válida.");
      await rpc("ops_bulk_loads", {
        p_items: loads.map((load) => ({
          load,
          updated_at: previous("loads", load).updated_at,
        })),
        p_values: {
          [field]: typeof value === "boolean" ? String(value) : value,
        },
      });
      await listLoads();
      return { ok: true, hechos: loads, fallas: [] };
    },
    getPendientes: async () => {
      if (!ctx.profile) return json([]);
      ctx.staff();
      const records = remember("pending_loads", await pending.list("pending"));
      return json(records.map((row) => pendingModel(row, name)));
    },
    addPendiente: async (customer, origin, destination, estimated, note) => {
      ctx.staff(true);
      const record = saved(
        "pending_loads",
        await pending.create({
          customer: String(customer || "").trim(),
          origin: String(origin || "").trim(),
          destination: String(destination || "").trim(),
          estimated_date: date(estimated) || null,
          note: String(note || "").trim(),
        }),
      );
      return { ok: true, id: record.id, creado_en: record.created_at };
    },
    removePendiente: async (id) => {
      ctx.staff(true);
      await pending.cancel(previous("pending_loads", id));
      return { ok: true };
    },
    vincularPendiente: async (id, load) => {
      ctx.staff(true);
      const old = previous("pending_loads", id);
      const comments = await pending.comments(id);
      await pending.link(old, load);
      return {
        ok: true,
        load,
        comentariosMovidos: comments.length + (old.note ? 1 : 0),
      };
    },
    getApartados: async () => {
      if (!ctx.profile) return { ok: true, items: [] };
      ctx.staff();
      const records = remember("reserved_loads", await reserved.list());
      const history = await rows(
        "reserved_load_history",
        (query) => query,
        "changed_at",
      );
      return {
        ok: true,
        items: records
          .filter((row) => !row.hidden)
          .map((row) =>
            reservedModel(
              row,
              name,
              history.filter((item) => item.reserved_id === row.id),
            ),
          ),
      };
    },
    guardarApartado: async (input) => {
      ctx.staff(true);
      const values = {
        load: input.load,
        csr_owner: input.csr_dueno || "",
        origin: input.origen || "",
        destination: input.destino || "",
        own_load: input.mi_carga || "",
        note: input.nota || "",
        review_hours: Number(input.frecuencia_horas) || 3,
        crossing_at: date(input.fecha_cruce),
        delivery_at: date(input.fecha_entrega),
        own_load_at: date(input.fecha_mi_carga),
      };
      const record = saved(
        "reserved_loads",
        await reserved.save(
          values,
          input.id ? previous("reserved_loads", input.id) : null,
        ),
      );
      return {
        ok: true,
        apartado: reservedModel(
          record,
          name,
          await reserved.history(record.id),
        ),
      };
    },
    cambiarEstadoApartado: async (id, state, note) => {
      ctx.staff(true);
      const record = saved(
        "reserved_loads",
        await reserved.changeState(previous("reserved_loads", id), state, note),
      );
      return {
        ok: true,
        apartado: reservedModel(record, name, await reserved.history(id)),
      };
    },
    revisarApartado: async (id, note) => {
      ctx.staff(true);
      const record = saved(
        "reserved_loads",
        await reserved.review(previous("reserved_loads", id), note),
      );
      return {
        ok: true,
        apartado: reservedModel(record, name, await reserved.history(id)),
      };
    },
    eliminarApartado: async (id) => {
      ctx.staff(true);
      await rpc("ops_hide_reserved", {
        p_id: id,
        p_version: previous("reserved_loads", id).updated_at,
      });
      return { ok: true };
    },
    getBitacoraTurno: async () => {
      if (!ctx.profile) return json([]);
      ctx.staff();
      return json(
        remember("shift_tasks", await shifts.list())
          .filter((row) => row.state !== "cancelled")
          .map((row) => taskModel(row, name)),
      );
    },
    getBitacoraHistorico: async () => {
      ctx.staff();
      return {
        ok: true,
        items: remember("shift_tasks", await shifts.list())
          .filter((row) => row.state !== "cancelled")
          .map((row) => taskModel(row, name)),
      };
    },
    addBitacoraTurno: async (
      note,
      loads,
      assignee,
      color,
      follow,
      _author,
      _password,
      csr,
    ) => {
      ctx.staff(true);
      const records = await shifts.save({
        note,
        loads: (Array.isArray(loads) ? loads : [loads]).filter(Boolean),
        assigned_to: ctx.personId(assignee),
        assigned_csr: ctx.personId(csr),
        color: color || "",
        follow_up_at: date(follow),
      });
      records.forEach((row) => saved("shift_tasks", row));
      return {
        ok: true,
        id: records[0].id,
        ids: records.map((row) => row.id),
        turno: records[0].shift,
        creado_en: records[0].created_at,
      };
    },
    editarBitacoraTurno: async (id, note, load, color, follow) => {
      ctx.staff(true);
      const old = previous("shift_tasks", id);
      const records = await shifts.save(
        { ...old, note, load, color, follow_up_at: date(follow) },
        old,
      );
      records.forEach((row) => saved("shift_tasks", row));
      return { ok: true };
    },
    resolverBitacoraTurno: async (id, resolved) => {
      ctx.staff(true);
      saved(
        "shift_tasks",
        await shifts.setState(
          previous("shift_tasks", id),
          resolved ? "resolved" : "open",
        ),
      );
      return { ok: true };
    },
    removeBitacoraTurno: async (id) => {
      ctx.staff(true);
      saved(
        "shift_tasks",
        await shifts.setState(previous("shift_tasks", id), "cancelled"),
      );
      return { ok: true };
    },
    getCierresTurnoRecibidos: async () => {
      if (!ctx.profile) return { ok: true, items: [] };
      ctx.staff();
      return {
        ok: true,
        items: (await shifts.closures())
          .slice(0, 30)
          .map((row) => ({
            id: row.id,
            csr: name(row.created_by),
            creado_en: row.created_at,
            texto: row.body,
          })),
      };
    },
    enviarCierreTurno: async (body) => {
      ctx.staff(true);
      const record = await shifts.saveClosure(body);
      return { ok: true, id: record.id, creado_en: record.created_at };
    },
  };
  function ctxHasPending(id) {
    try {
      previous("pending_loads", id);
      return true;
    } catch {
      return false;
    }
  }
  for (const [method, field] of Object.entries({
    saveTruck: "truck",
    saveTrailer: "trailer",
    saveTrackingLink: "tracking_link",
    saveLoadColor: "color",
  }))
    methods[method] = (load, value) =>
      updateLoad(load, { [field]: String(value || "").trim() });
  for (const [method, field] of Object.entries({
    savePickupAppt: "pickup_appt",
    saveDeliveryAppt: "delivery_appt",
    saveSalidaMexico: "salida_mexico_fecha",
    saveCruceUsa: "cruce_usa_fecha",
  }))
    methods[method] = (load, value) =>
      updateLoad(load, { [field]: date(value) });
  for (const [method, field] of Object.entries({
    savePodSent: "pod_sent",
    saveRecargosVg: "recargos_vg",
  }))
    methods[method] = (load, value) =>
      updateLoad(load, { [field]: value ? "true" : "false" });
  return methods;
}
