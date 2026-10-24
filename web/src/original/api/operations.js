import config from "../config.js";
import { unwrap } from "../../data/supabase.js";
import { createPendingLoadsService } from "../../features/pending-loads/service.js";
import { createReservedLoadsService } from "../../features/reserved-loads/service.js";
import { createShiftsService } from "../../features/shifts/service.js";
import { prepareIncident } from "../../features/incidents/rules.js";
import { loadHistoryItems } from "../history.js";
import { taskFollowUpISO } from "../task-time.js";
import { validateLogisticsSignals } from "../logistics-signals.js";
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
  /** Páginas fijadas a una revisión: un cambio de una sola carga no vuelve a descargar todo. */
  async function syncLoads(after = 0) {
    ctx.staff();
    const known = ctx.records("loads").map((row) => row.load);
    const updated = [];
    let cursor = "",
      watermark = null,
      result;
    do {
      result = await rpc("ops_loads_delta", {
        p_after: Number(after) || 0,
        p_known: known,
        p_cursor: cursor,
        p_until: watermark,
        p_limit: 500,
      });
      watermark = result.revision;
      updated.push(...result.items);
      cursor = result.next;
    } while (cursor);
    if (!after) remember("loads", updated, "load");
    else {
      updated.forEach((row) => saved("loads", row, "load"));
      ctx.forget("loads", result.removed || []);
    }
    const models = updated.map((row) => loadModel(row, name));
    return {
      ok: true,
      full: !after,
      ts: Number(watermark),
      loads: !after ? models : undefined,
      updated: models,
      currentLoads: ctx.records("loads").map((row) => row.load),
      removed: result.removed || [],
    };
  }
  async function listLoads() {
    await syncLoads();
    return ctx.records("loads").map((row) => loadModel(row, name));
  }
  async function reasonFor(effect, supplied) {
    const reason =
      supplied || (await globalThis.window?.panelDialogs?.reason(effect));
    if (!reason || reason.trim().length < 3)
      throw Error(
        "Acción cancelada. El motivo debe tener al menos 3 caracteres.",
      );
    return reason.trim();
  }
  async function updateLoad(load, values) {
    if (/^cancelado\.?$/i.test(values.status || ""))
      values.cancel_reason = await reasonFor(
        "Cancelar esta carga conserva su expediente y la quita de los viajes activos.",
        values.cancel_reason,
      );
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
  async function loadRpc(load, method, extra = {}, validate = () => {}) {
    ctx.staff(true);
    return ctx.serial(`load:${load}`, async () => {
      const old = previous("loads", load);
      validate(old);
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
    getInstructivosRuta: async () => {
      ctx.staff();
      const items = await ctx.rows(
        "route_instruction_templates",
        (q) => q,
        "updated_at",
      );
      ctx.remember("route_instruction_templates", items);
      const routes = [
        ...new Map(
          ctx
            .records("loads")
            .map((row) => [
              JSON.stringify([
                row.customer,
                row.origin_city,
                row.origin_state,
                row.dest_city,
                row.dest_state,
              ]),
              Object.fromEntries(
                [
                  "load",
                  "customer",
                  "origin_city",
                  "origin_state",
                  "dest_city",
                  "dest_state",
                ].map((key) => [key, row[key] || ""]),
              ),
            ]),
        ).values(),
      ];
      return { ok: true, items, routes, admin: ctx.profile.role === "admin" };
    },
    guardarInstructivoRuta: async (
      id,
      version,
      values,
      applyMissing = false,
    ) => {
      ctx.staff(true);
      const row = await rpc("ops_save_route_instruction", {
        p_id: id || null,
        p_version: version || null,
        p_values: values,
        p_apply_missing: applyMissing,
      });
      return { ok: true, record: saved("route_instruction_templates", row) };
    },
    instruccionCarga: (load, action, values = {}, version) =>
      loadRpc(load, "ops_load_instruction_action", {
        p_action: action,
        p_values: values,
        ...(version ? { p_version: version } : {}),
      }),
    setSenalamientosCarga: (load, values, original) =>
      loadRpc(
        load,
        "ops_set_load_signals",
        {
          p_signals: validateLogisticsSignals(values),
        },
        (old) => {
          // Conservar el borrador si otro usuario cambió estas marcas. La versión de la carga
          // se toma de la caché confirmada, que también incluye nuestros guardados de otros campos.
          if (
            original &&
            JSON.stringify(old.logistics_signals || []) !==
              JSON.stringify(validateLogisticsSignals(original))
          )
            throw Error(
              "Los señalamientos cambiaron. Cierra esta ventana y vuelve a abrirlos antes de guardar.",
            );
        },
      ),
    // El RPC valida permisos y versión; la nota y la resolución se guardan juntas.
    setPendientePuntual: (load, active, note) =>
      loadRpc(load, "ops_set_punctual_pending", {
        p_active: active,
        p_note: note,
      }),
    getDetalleCarga: async (load) => {
      ctx.staff();
      const old = previous("loads", load);
      const record = await safe(
        unwrap(
          client
            .from("loads")
            .select("*")
            .eq("load", load)
            .eq("archived", false)
            .single(),
        ),
      );
      if (Date.parse(record.updated_at) !== Date.parse(old.updated_at))
        throw Error(
          "La carga cambió. Actualiza antes de abrir su detalle completo.",
        );
      return { ok: true, record: loadModel({ ...old, ...record }, name) };
    },
    getLoadsDelta: async (after = 0) =>
      ctx.profile
        ? syncLoads(after)
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
      const records = await rpc("ops_latest_comments");
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
    getHistorialLoad: async (load, _name, _password, offset = 0) => {
      ctx.staff();
      const page = await ctx.page("load_history", {
        filter: (query) => query.eq("load", load),
        order: "changed_at",
        offset,
      });
      return {
        ok: true,
        items: loadHistoryItems(page.records, load, name),
        nextOffset: page.next,
      };
    },
    getHistorialApartado: async (id, offset = 0) => {
      ctx.staff();
      const page = await ctx.page("reserved_load_history", {
        filter: (query) => query.eq("reserved_id", id),
        order: "changed_at",
        offset,
      });
      return {
        ok: true,
        items: reservedModel({}, name, page.records).historial,
        nextOffset: page.next,
      };
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
      const items = [];
      for (let offset = 0; ; offset += 500) {
        const page = await rpc("ops_customer_communications", {
          p_customer: customer,
          p_offset: offset,
          p_limit: 500,
        });
        items.push(...page.map((row) => communicationModel(row, name)));
        if (page.length < 500) return { ok: true, items };
      }
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
      const reason =
        field === "status" && /^cancelado\.?$/i.test(value)
          ? await reasonFor(
              "Cancelar las cargas seleccionadas conserva sus expedientes y las retira de los viajes activos.",
            )
          : null;
      await rpc("ops_bulk_loads", {
        p_items: loads.map((load) => ({
          load,
          updated_at: previous("loads", load).updated_at,
        })),
        p_values: {
          ...(reason ? { cancel_reason: reason } : {}),
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
    removePendiente: async (id, _name, _password, reason) => {
      ctx.staff(true);
      await rpc("ops_cancel_pending_reason", {
        p_id: id,
        p_version: previous("pending_loads", id).updated_at,
        p_reason: await reasonFor(
          "Cancelar esta solicitud la retira de Pendientes y conserva su historial.",
          reason,
        ),
      });
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
      return {
        ok: true,
        items: records
          .filter((row) => !row.hidden)
          .map((row) => reservedModel(row, name, [])),
      };
    },
    guardarApartado: async (input) => {
      ctx.staff(true);
      const oldDetails = input.id ? previous("reserved_loads", input.id) : {};
      const values = {
        load: input.load,
        csr_owner: input.csr_dueno || "",
        origin: input.origen || "",
        destination: input.destino || "",
        own_load: input.mi_carga || "",
        related_load: input.related_load ?? oldDetails.related_load ?? null,
        free_reference: input.free_reference ?? oldDetails.free_reference ?? "",
        vg_contact_id: input.vg_contact_id ?? oldDetails.vg_contact_id ?? null,
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
        apartado: reservedModel(record, name, []),
      };
    },
    cambiarEstadoApartado: async (id, state, note) => {
      ctx.staff(true);
      const record = saved(
        "reserved_loads",
        await reserved.changeState(
          previous("reserved_loads", id),
          state,
          state === "liberado"
            ? await reasonFor(
                "Liberar el apartado detiene sus revisiones. Podrás reabrirlo desde Cerrados.",
                note,
              )
            : note,
        ),
      );
      return {
        ok: true,
        apartado: reservedModel(record, name, []),
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
        apartado: reservedModel(record, name, []),
      };
    },
    eliminarApartado: async (id, _name, _password, reason) => {
      ctx.staff(true);
      await rpc("ops_hide_reserved_reason", {
        p_reason: await reasonFor(
          "Retirar este apartado lo oculta del panel. Su historial se conserva.",
          reason,
        ),
        p_id: id,
        p_version: previous("reserved_loads", id).updated_at,
      });
      return { ok: true };
    },
    getBitacoraTurno: async () => {
      if (!ctx.profile) return json([]);
      ctx.staff();
      return json(
        remember("shift_tasks", await shifts.list({ states: ["open"] })).map(
          (row) => taskModel(row, name),
        ),
      );
    },
    getBitacoraHistorico: async (
      _name,
      _password,
      since = null,
      until = null,
      offset = 0,
      state = null,
    ) => {
      ctx.staff();
      const page = await ctx.page("shift_tasks", {
        filter: (query) => {
          let q = query.in(
            "state",
            state
              ? {
                  abiertos: ["open"],
                  resueltos: ["resolved"],
                  cancelados: ["cancelled"],
                }[state] || ["open", "resolved", "cancelled"]
              : ["open", "resolved", "cancelled"],
          );
          if (since) q = q.gte("created_at", date(since));
          if (until) q = q.lte("created_at", date(until));
          return q;
        },
        order: "created_at",
        offset,
        limit: 100,
      });
      return {
        ok: true,
        items: page.records.map((row) =>
          taskModel(saved("shift_tasks", row), name),
        ),
        nextOffset: page.next,
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
        follow_up_at: taskFollowUpISO(follow),
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
        { ...old, note, load, color, follow_up_at: taskFollowUpISO(follow) },
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
    removeBitacoraTurno: async (id, _name, _password, reason) => {
      ctx.staff(true);
      saved(
        "shift_tasks",
        await shifts.setState(
          previous("shift_tasks", id),
          "cancelled",
          await reasonFor(
            "Cancelar esta tarea la retira del turno y conserva su historial.",
            reason,
          ),
        ),
      );
      return { ok: true };
    },
    getCierresTurnoRecibidos: async () => {
      if (!ctx.profile) return { ok: true, items: [] };
      ctx.staff();
      return {
        ok: true,
        items: (await shifts.closures()).map((row) => ({
          id: row.id,
          csr: name(row.created_by),
          creado_en: row.created_at,
          texto: row.body,
        })),
      };
    },
    enviarCierreTurno: async (body, _name, _password, details) => {
      ctx.staff(true);
      if (!details)
        details = await globalThis.window?.panelDialogs?.closure(
          ctx.records("profiles"),
        );
      if (!details) throw Error("Cierre cancelado.");
      const record = await shifts.saveClosure(
        body,
        details.critical,
        details.responsible,
        details.nextAction,
      );
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
