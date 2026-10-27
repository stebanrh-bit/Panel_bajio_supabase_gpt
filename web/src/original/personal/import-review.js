import { escapeHtml as esc } from "../content.js";
import { personalDialog } from "./dialog.js";
const labels = {
  customer: "Cliente",
  origin_address: "Dirección origen",
  dest_address: "Dirección destino",
  pickup_actual: "Pickup real",
  pickup_delta_min: "Retraso Pickup (min)",
  delivery_actual: "Entrega real",
  delivery_delta_min: "Retraso entrega (min)",
  doc_status: "Documentación",
  exportacion: "Exportación",
  importacion: "Importación",
  pedimentos: "Pedimentos",
  loaded_miles: "Millas cargadas",
  empty_miles: "Millas vacías",
  rpm: "Tarifa por milla",
  charges: "Cargos",
  salida_mexico_fecha: "Salida planta histórica",
  cruce_usa_fecha: "Cruce histórico",
  status: "Estatus inicial",
  origin_city: "Origen",
  origin_state: "Estado origen",
  dest_city: "Destino",
  dest_state: "Estado destino",
  pickup_appt: "Pickup",
  delivery_appt: "Entrega",
  truck: "Truck",
  trailer: "Trailer",
  work_order: "Work order",
  bol: "BOL",
  doda: "DODA",
  entry: "Entry",
  sobre_listo: "Sobre listo",
  regresos: "Regresos",
  tracking_link: "Seguimiento",
  eta_note: "Nota",
};
/** La vista previa conserva por defecto la unidad manual; cada reemplazo es una selección explícita. */
export async function reviewImport(api, ensure, records, fileName) {
  await ensure();
  const rows = [
    ...new Map(
      records
        .filter((r) => String(r.load || "").trim())
        .map((r) => [
          String(r.load).trim(),
          { ...r, load: String(r.load).trim() },
        ]),
    ).values(),
  ];
  let preview = await api.methods.previewImport(rows, fileName),
    result = null;
  return new Promise((resolve) => {
    const table = () =>
      `<p><b>${esc(fileName)}</b> · ${rows.length} cargas únicas. Desmarca las que no quieras importar.</p><p>Los campos manuales se conservan. Marca «Usar del archivo» solo si quieres sustituirlos.</p><div class="personal-import-table"><table><thead><tr><th>Importar</th><th>Load / cliente</th><th>Cambios del archivo</th><th>Truck / Trailer manual</th></tr></thead><tbody>${preview.items.map((item) => `<tr data-import-row="${esc(item.load)}"><td><input type="checkbox" data-import-include ${item.validation_error ? "disabled" : "checked"} aria-label="Importar ${esc(item.load)}"></td><td><b>${esc(item.load)}</b><small>${esc(item.customer || "")}</small><span>${item.new ? "Nueva" : "Existente"}</span></td><td>${item.validation_error ? `<p class="personal-error">${esc(item.validation_error)}</p>` : ""}<details><summary>${(item.differences || []).length} cambios</summary>${(item.differences || []).map((d) => `<p><b>${esc(labels[d.field] || d.field)}</b>: ${esc(String(d.before ?? "") || "Vacío")} → ${esc(String(d.after ?? "") || "Vacío")}</p>`).join("") || "<p>Sin cambios en los campos mostrados.</p>"}</details></td><td>${(item.protected || []).map((d) => `<label class="personal-check"><input type="checkbox" data-import-replace="${esc(d.field)}"> Usar ${esc(labels[d.field])} del archivo</label><small>Actual: ${esc(d.before)} → Archivo: ${esc(d.after)}</small>`).join("") || "Sin reemplazos manuales"}</td></tr>`).join("")}</tbody></table></div><p class="personal-import-count" role="status"></p><button type="button" data-import-refresh>Actualizar vista previa</button>`;
    const { dialog, form, error } = personalDialog(
      "Revisar importación",
      table(),
      async () => {
        const selected = [...dialog.querySelectorAll("[data-import-row]")]
          .filter((tr) => tr.querySelector("[data-import-include]").checked)
          .map((tr) => ({
            ...rows.find((r) => r.load === tr.dataset.importRow),
            _replace_manual: [
              ...tr.querySelectorAll("[data-import-replace]:checked"),
            ].map((c) => c.dataset.importReplace),
          }));
        if (!selected.length) throw Error("Selecciona al menos una carga.");
        const original = new Map(preview.items.map((r) => [r.load, r.version]));
        const checked = await api.methods.previewImport(selected, fileName);
        if (checked.items.some((r) => r.version !== original.get(r.load)))
          throw Error(
            "Una carga cambió mientras revisabas. Pulsa Actualizar vista previa y comprueba los valores.",
          );
        if (checked.items.some((r) => r.validation_error))
          throw Error(
            "Hay fechas que necesitan corrección. Actualiza la vista previa o excluye esas cargas.",
          );
        result = await api.methods.importLoads(selected);
      },
      "Importar seleccionadas",
    );
    const count = () => {
      const selected = dialog.querySelectorAll(
        "[data-import-include]:checked",
      ).length;
      dialog.querySelector(".personal-import-count").textContent =
        selected +
        " de " +
        rows.length +
        " cargas seleccionadas. Se guardará el archivo «" +
        fileName +
        "» en el historial.";
    };
    dialog.addEventListener("change", count);
    dialog.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-import-refresh]");
      if (!button) return;
      button.disabled = true;
      try {
        preview = await api.methods.previewImport(rows, fileName);
        dialog.querySelector(".personal-body").innerHTML = table();
        count();
        error.textContent =
          "Vista previa actualizada; revisa de nuevo las selecciones.";
      } catch (err) {
        error.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    });
    dialog.addEventListener("close", () => resolve(result), { once: true });
    count();
  });
}
