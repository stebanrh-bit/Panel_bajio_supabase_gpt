import { gmailLink, manualPreview, manualRecord } from "./manual.js";
const LABEL = "Hilo Gmail (manual)";
/** Reutiliza SQL 020: enlaces de documentos e historial manual. No necesita OAuth ni Edge. */
export function gmailMethods(ctx) {
  let epoch = ctx.epoch;
  const drafts = new Map();
  async function context(load) {
    ctx.staff(true);
    const loads = await ctx.rows("loads", (q) => q.eq("load", load), "load");
    if (!loads.length || loads[0].archived)
      throw Error("La carga no está disponible para tu cuenta.");
    const [links, records] = await Promise.all([
      ctx.rows(
        "load_document_links",
        (q) =>
          q
            .eq("load", load)
            .eq("created_by", ctx.profile.id)
            .eq("label", LABEL)
            .is("deleted_at", null),
        "created_at",
      ),
      ctx.rows(
        "communications",
        (q) =>
          q
            .eq("load", load)
            .eq("actor", ctx.profile.id)
            .eq("channel", "Correo")
            .eq("notice_type", "Gmail manual"),
        "created_at",
      ),
    ]);
    return { load: loads[0], thread: links.at(-1) || null, records };
  }
  const confirmed = (row) => ({
    id: row.id,
    state: "confirmed",
    created_at: row.created_at,
    record_text: row.manual_message,
  });
  return {
    async gmailCarga(action, values = {}) {
      ctx.staff(true);
      if (epoch !== ctx.epoch) {
        drafts.clear();
        epoch = ctx.epoch;
      }
      const load = String(values.load || "");
      const data = await context(load);
      if (action === "status") {
        return {
          thread: data.thread,
          items: [...drafts.values()]
            .filter(
              (x) =>
                x.load === load &&
                !data.records.some(
                  (row) => row.manual_message === manualRecord(x.preview),
                ),
            )
            .concat(data.records.slice(-30).reverse().map(confirmed)),
        };
      }
      if (action === "link") {
        const url = gmailLink(values.url),
          row = data.thread;
        await ctx.rpc("ops_save_document_link", {
          p_load: load,
          p_id: row?.id || null,
          p_version: row?.updated_at || null,
          p_kind: "other",
          p_label: LABEL,
          p_url: url,
        });
        return { ok: true };
      }
      if (action === "prepare") {
        if (!data.thread) throw Error("Guarda primero la liga del hilo.");
        const preview = manualPreview(values, data.thread.url),
          text = manualRecord(preview);
        const prior = data.records.find((row) => row.manual_message === text);
        if (prior) return { item: confirmed(prior) };
        const old = [...drafts.values()].find(
          (x) => x.load === load && manualRecord(x.preview) === text,
        );
        // Solo se renueva una preparación todavía sin confirmar; no crea borradores en Gmail.
        const item = {
          ...old,
          id: old?.id || crypto.randomUUID(),
          load,
          preview,
          state: "prepared",
          version: data.load.updated_at,
          created_at: new Date().toISOString(),
        };
        drafts.set(item.id, item);
        return { item };
      }
      if (action === "confirm") {
        if (values.confirm !== true)
          throw Error("Confirma que ya enviaste el correo desde Gmail.");
        return ctx.serial(`gmail-manual:${load}`, async () => {
          const current = await context(load),
            draft = drafts.get(values.id);
          const saved = current.records.find((row) => row.id === values.id);
          if (saved) return { item: confirmed(saved) };
          if (!draft || draft.load !== load)
            throw Error(
              "La preparación ya no está disponible. Revisa el historial y prepara otra vez si hace falta.",
            );
          const text = manualRecord(draft.preview),
            prior = current.records.find((row) => row.manual_message === text);
          if (prior) {
            return { item: confirmed(prior) };
          }
          const result = await ctx.rpc("ops_record_manual_notice", {
            p_load: load,
            p_version: draft.version,
            p_channel: "Correo",
            p_type: "Gmail manual",
            p_message: text,
          });
          const record = Array.isArray(result) ? result[0] : result;
          if (!record)
            throw Error(
              "La carga cambió. Actualiza antes de registrar la confirmación.",
            );
          ctx.saved("loads", record, "load");
          return {
            item: {
              id: draft.id,
              state: "confirmed",
              record_text: text,
              created_at: record.client_notified_at,
            },
          };
        });
      }
      throw Error(
        "Gmail está en modo manual. Envía el correo directamente desde Gmail.",
      );
    },
  };
}
