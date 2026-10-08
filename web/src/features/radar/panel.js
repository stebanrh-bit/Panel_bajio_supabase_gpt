import { escapeHtml as escape } from "../../ui/html.js";
import { createPanelController } from "../../ui/panel.js";
import { customerKey } from "../overview/rules.js";
import { parseLoadFile } from "../imports/parser.js";
import { straightMiles, placeLabel, mapsUrl } from "./rules.js";

/** Compara puntos de recolección y permite verificar carretera para cada candidato. */
export function createRadarPanel({
  container,
  service,
  role,
  onOpenLoad,
  onError,
}) {
  const view = createPanelController(container, onError);
  let data,
    origin = null,
    originText = "",
    results = [];
  const writable = ["admin", "csr"].includes(role);
  function open() {
    return view.load(service.list, (rows) => {
      data = rows;
      render();
    });
  }
  function render() {
    container.innerHTML = `<section class="card"><h2>Radar de regreso cargado</h2><p>Busca cargas por cercanía a una ciudad. La distancia inicial es en línea recta; verifica la carretera de cada candidato antes de planear el viaje.</p>
      <form id="radar-search"><div class="grid"><label>Punto de partida<input name="origin" required maxlength="300" placeholder="Laredo, Texas, USA" value="${escape(originText)}"></label>
        <label>Radio (millas)<input name="radius" type="number" min="1" max="3000" value="300" required></label>
        <label>Fuente<select name="source"><option value="active">Cargas activas</option>${data.source ? `<option value="file">Archivo compartido: ${escape(data.source.file_name)}</option>` : ""}</select></label></div><button>Buscar cercanía</button></form>
      <p>Se ubican hasta 25 lugares distintos por búsqueda. Usa direcciones precisas y conserva las coordenadas compartidas para futuras búsquedas.</p><p id="radar-progress" aria-live="polite"></p>
      <div id="radar-results"></div>
      ${writable ? '<h3>Compartir archivo de referencia</h3><p>Este archivo solo alimenta el radar; no crea cargas operativas. Usa los mismos encabezados Load, City O. y State O.</p><form id="radar-file"><label>Archivo .xlsx o .csv<input name="file" type="file" accept=".xlsx,.csv" required></label><button>Compartir con el equipo</button></form>' : ""}</section>`;
    container.querySelector("#radar-search").onsubmit = (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      view.run(event.target.querySelector("button"), async () => {
        originText = values.origin.trim();
        origin = await findPlace(originText);
        const records =
          values.source === "file" ? data.source.records : data.loads;
        const places = [
            ...new Set(records.map(placeLabel).filter(Boolean)),
          ].slice(0, 25),
          positions = new Map();
        let failures = 0;
        for (const [index, label] of places.entries()) {
          if (!view.mounted) return;
          container.querySelector("#radar-progress").textContent =
            `Ubicando ${index + 1} de ${places.length}…`;
          try {
            positions.set(label, await findPlace(label));
          } catch {
            failures++;
          }
        }
        if (!view.mounted) return;
        results = records
          .map((record) => {
            const position = positions.get(placeLabel(record));
            return {
              record,
              position,
              miles: position ? straightMiles(origin, position) : null,
              road: null,
            };
          })
          .filter(
            (item) =>
              item.miles === null || item.miles <= Number(values.radius),
          )
          .sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity));
        container.querySelector("#radar-progress").textContent =
          `${results.length} candidatos dentro del radio o sin distancia. ${failures} lugares no se pudieron ubicar. Las ubicaciones fuera de los primeros 25 requieren otra búsqueda.`;
        renderResults();
      });
    };
    container
      .querySelector("#radar-file")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const file = event.target.elements.file.files[0];
        view.run(event.target.querySelector("button"), async () => {
          const records = await parseLoadFile(file);
          await service.saveSource(file.name, records);
          await open();
        });
      });
  }
  async function findPlace(label) {
    const cached = data.places.find(
      (place) => place.place_key === customerKey(label),
    );
    if (cached) return cached;
    const found = await service.geocode(label);
    if (writable) {
      const saved = await service.savePlace(found);
      data.places.push(saved);
    }
    return found;
  }
  function renderResults() {
    const section = container.querySelector("#radar-results");
    section.innerHTML = `<div class="scroll"><table><thead><tr><th>Carga</th><th>Recolección</th><th>Destino</th><th>Distancia</th><th>Apartado</th><th></th></tr></thead><tbody>${
      results
        .map((item, index) => {
          const reserved = data.reserved.find(
            (record) =>
              record.load === item.record.load &&
              !["usado", "liberado"].includes(record.state),
          );
          return `<tr><td>${escape(item.record.load)}<small class="block">${escape(item.record.customer)}</small></td><td>${escape(placeLabel(item.record))}</td><td>${escape(item.record.dest_city)}</td>
        <td>${item.road ? `${item.road.miles.toFixed(1)} mi carretera · ${Math.round(item.road.minutes)} min` : item.miles === null ? "Sin coordenadas" : item.miles.toFixed(1) + " mi línea recta"}</td><td>${reserved ? "Apartado activo" : "Disponible para revisar"}</td>
        <td>${item.position ? `<button data-road="${index}">Verificar carretera</button>` : ""}<a href="${mapsUrl(originText, placeLabel(item.record))}" target="_blank" rel="noopener noreferrer">Abrir mapa</a>
        ${data.loads.some((row) => row.load === item.record.load) ? `<button data-radar-load="${escape(item.record.load)}">Abrir carga</button>` : ""}</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="6">No hay candidatos con este radio.</td></tr>'
    }</tbody></table></div>`;
    section
      .querySelectorAll("[data-radar-load]")
      .forEach(
        (button) =>
          (button.onclick = () => onOpenLoad(button.dataset.radarLoad)),
      );
    section.querySelectorAll("[data-road]").forEach(
      (button) =>
        (button.onclick = () =>
          view.run(button, async () => {
            const item = results[Number(button.dataset.road)];
            const road = await service.road(origin, item.position);
            if (view.mounted) {
              item.road = road;
              renderResults();
            }
          })),
    );
  }
  return { open, dispose: view.dispose };
}
