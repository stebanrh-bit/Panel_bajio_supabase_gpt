import { googleMapsCall } from "../../features/radar/service.js";

/** Conserva las llaves y la caché compartida de ciudades, direcciones y trayectos del original. */
export function radarMethods(ctx) {
  const places = () =>
    ctx.rows("original_places", (query) => query, "place_key");
  const routes = () =>
    ctx.rows("original_routes", (query) => query, "route_key");
  const data = (row) => ({
    key: row.route_key,
    millas: Number(row.google_miles ?? row.miles),
    horas: Number(row.google_hours ?? row.hours),
    fuente: row.google_miles == null ? "osm" : "google",
    osm: row.google_miles == null ? undefined : Number(row.miles),
  });
  return {
    getCoordenadas: async () => {
      ctx.staff();
      return {
        ok: true,
        items: Object.fromEntries(
          (await places())
            .filter((row) => row.kind === "city")
            .map((row) => [row.place_key, [row.latitude, row.longitude]]),
        ),
      };
    },
    guardarCoordenadas: async (list) => {
      ctx.staff(true);
      const result = await ctx.rpc("ops_original_places", {
        p_places: list
          .slice(0, 200)
          .map((row) => ({
            key: row.key,
            kind: "city",
            text: [row.ciudad, row.estado].filter(Boolean).join(", "),
            lat: row.lat,
            lon: row.lon,
          })),
      });
      return { ok: true, guardadas: result };
    },
    getDirecciones: async (keys) => {
      ctx.staff();
      return {
        ok: true,
        items: Object.fromEntries(
          (await places())
            .filter((row) => keys.includes(row.place_key))
            .map((row) => [
              row.place_key,
              {
                texto: row.searched_text,
                direccion: row.formatted_address,
                lat: row.latitude,
                lon: row.longitude,
              },
            ]),
        ),
      };
    },
    guardarDireccion: async (row) => {
      ctx.staff(true);
      const count = await ctx.rpc("ops_original_places", {
        p_places: [
          {
            key: row.key,
            kind: "address",
            text: row.texto,
            formatted: row.direccion,
            lat: row.lat,
            lon: row.lon,
          },
        ],
      });
      return { ok: true, guardada: count > 0 };
    },
    getDistancias: async (origin) => {
      ctx.staff();
      const result = {};
      for (const row of await routes()) {
        if (row.origin_key === origin) result[row.destination_key] = data(row);
        else if (row.destination_key === origin && !result[row.origin_key])
          result[row.origin_key] = data(row);
      }
      return { ok: true, items: result };
    },
    guardarDistancias: async (list) => {
      ctx.staff(true);
      return {
        ok: true,
        guardadas: await ctx.rpc("ops_original_routes", {
          p_routes: list.slice(0, 300),
        }),
      };
    },
    getBusquedasDirecciones: async () => {
      ctx.staff();
      const [points, distances] = await Promise.all([places(), routes()]);
      const labels = new Map(
        points.map((row) => [
          row.place_key,
          row.searched_text || row.formatted_address,
        ]),
      );
      return {
        ok: true,
        items: distances
          .filter(
            (row) =>
              row.origin_key.startsWith("dir:") ||
              row.destination_key.startsWith("dir:"),
          )
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .slice(0, 50)
          .map((row) => ({
            ...data(row),
            origen: row.origin_key,
            destino: row.destination_key,
            origenTxt: labels.get(row.origin_key) || row.origin_key,
            destinoTxt: labels.get(row.destination_key) || row.destination_key,
            recta: row.straight_miles,
            por: ctx.personName(row.created_by),
            en: row.created_at,
          })),
      };
    },
    recalcularMillasGoogle: async (key) => {
      ctx.staff(true);
      if (ctx.profile.role !== "admin")
        throw Error("Solo un supervisor puede recalcular las millas.");
      const [points, distances] = await Promise.all([places(), routes()]);
      const route = distances.find((row) => row.route_key === key);
      if (!route) throw Error("Ese trayecto no está guardado.");
      const point = (placeKey) => {
        const row = points.find((item) => item.place_key === placeKey);
        if (!row)
          throw Error("No están guardadas las coordenadas del trayecto.");
        return { latitude: row.latitude, longitude: row.longitude };
      };
      const result = await googleMapsCall(ctx.client, "panelRoadDistance", [
        point(route.origin_key),
        point(route.destination_key),
      ]);
      await ctx.rpc("ops_original_google_route", {
        p_key: key,
        p_miles: result.miles,
        p_hours: result.minutes / 60,
      });
      return {
        ok: true,
        dato: {
          millas: result.miles,
          horas: result.minutes / 60,
          fuente: "google",
        },
      };
    },
    getRadarExcel: async () => {
      ctx.staff();
      const records = await ctx.rows(
        "original_radar",
        (query) => query.eq("singleton", true),
        "singleton",
      );
      const row = records[0];
      return {
        ok: true,
        excel: row?.visible
          ? {
              nombre: row.file_name,
              cargado_en: row.updated_at,
              por: ctx.personName(row.updated_by),
              v: 2,
              filas: row.records,
            }
          : null,
      };
    },
    guardarRadarExcel: async (input) => {
      ctx.staff(true);
      const row = await ctx.rpc("ops_original_radar", {
        p_name: input.nombre || "Excel VanGuard",
        p_records: input.filas,
        p_visible: true,
      });
      return {
        ok: true,
        nombre: row.file_name,
        total: row.records.length,
        cargado_en: row.updated_at,
        por: ctx.personName(row.updated_by),
      };
    },
    quitarRadarExcel: async () => {
      ctx.staff(true);
      await ctx.rpc("ops_original_radar", {
        p_name: "",
        p_records: [],
        p_visible: false,
      });
      return { ok: true };
    },
  };
}
