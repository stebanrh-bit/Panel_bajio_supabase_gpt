import { fetchAll, unwrap } from "../../data/supabase.js";
/** Puente de Google: el token se envía al servidor para verificar permisos, nunca se guarda. */
export function googleMapsCall(client, name, args) {
  return new Promise((resolve, reject) => {
    if (!globalThis.google?.script?.run)
      return reject(
        new Error(
          "La consulta de mapas está disponible al abrir el sitio desde Google Apps Script.",
        ),
      );
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (error || !data.session)
          return reject(new Error("Inicia sesión para consultar mapas."));
        const runner = globalThis.google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler((error) =>
            reject(
              new Error(error.message || "Google no pudo consultar el mapa."),
            ),
          );
        runner[name](data.session.access_token, ...args);
      })
      .catch(reject);
  });
}
export function createRadarService(client) {
  return {
    async list() {
      const [loads, sources, places, reserved] = await Promise.all([
        fetchAll(() =>
          client.from("loads").select("*").eq("archived", false).order("load"),
        ),
        unwrap(
          client
            .from("radar_sources")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id")
            .limit(1),
          "SQL 007",
        ),
        fetchAll(
          () => client.from("geo_places").select("*").order("place_key"),
          "SQL 007",
        ),
        fetchAll(
          () => client.from("reserved_loads").select("*").order("id"),
          "SQL 004",
        ),
      ]);
      return { loads, source: sources[0] || null, places, reserved };
    },
    geocode: (address) => googleMapsCall(client, "panelGeocode", [address]),
    road: (origin, destination) =>
      googleMapsCall(client, "panelRoadDistance", [origin, destination]),
    savePlace: (place) =>
      unwrap(
        client.rpc("ops_save_place", {
          p_label: place.label,
          p_latitude: place.latitude,
          p_longitude: place.longitude,
        }),
        "SQL 007",
      ),
    saveSource: (name, records) =>
      unwrap(
        client.rpc("ops_save_radar_source", {
          p_file_name: name,
          p_records: records,
        }),
        "SQL 007",
      ),
  };
}
