import { csvCell, escapeHtml as esc } from "../content.js";
import { lifecycle } from "../load-views/rules.js";
import { personalDialog } from "./dialog.js";
const headers = [
  "Load",
  "Cliente",
  "Origen",
  "Destino",
  "Pickup",
  "Entrega",
  "Truck",
  "Trailer",
  "Estatus",
  "Condición",
  "Comentarios",
  "Pendiente puntual",
];
/** Misma estructura para vista y reporte completo: sin secciones gerenciales ni filas ocultas por sorpresa. */
export function operationCsv(rows) {
  const lines = [headers];
  for (const r of rows)
    lines.push([
      r.load,
      r.customer,
      [r.origin_city, r.origin_state].filter(Boolean).join(", "),
      [r.dest_city, r.dest_state].filter(Boolean).join(", "),
      r.pickup_appt,
      r.delivery_appt,
      r.truck,
      r.trailer,
      r.status,
      {
        open: "Abierta",
        closed: "Cancelada/finalizada",
        delivered: "Entregada con POD",
      }[lifecycle(r)],
      r.latest_comment || "",
      r.punctual_pending ? r.punctual_note : "",
    ]);
  return "\ufeff" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function exportSnapshot(visible, all, name) {
  const views = structuredClone(visible),
    full = structuredClone(all);
  return personalDialog(
    "Exportar cargas",
    `<p>Elige el alcance. El archivo conserva las mismas columnas del listado.</p><label class="personal-check"><input type="radio" name="scope" value="view" checked> Vista actual «${esc(name)}»: ${views.length} cargas</label><label class="personal-check"><input type="radio" name="scope" value="full"> Reporte completo de mis clientes: ${full.length} cargas</label><p>Abiertas: ${full.filter((r) => lifecycle(r) === "open").length} · Entregadas con POD: ${full.filter((r) => lifecycle(r) === "delivered").length} · Canceladas: ${full.filter((r) => lifecycle(r) === "closed").length}</p>`,
    (data) => {
      const rows = data.get("scope") === "full" ? full : views;
      if (!rows.length) throw Error("No hay cargas en el alcance elegido.");
      const url = URL.createObjectURL(
          new Blob([operationCsv(rows)], { type: "text/csv;charset=utf-8;" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "cargas_" +
        (data.get("scope") === "full" ? "completas" : "vista") +
        "_" +
        new Date().toISOString().slice(0, 10) +
        ".csv";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    "Descargar CSV",
  );
}
