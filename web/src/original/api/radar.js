import { googleMapsCall } from "../../features/radar/service.js";

/** Consultas por origen/llave. Una ruta inversa nunca reemplaza una medición de este sentido. */
export function radarMethods(ctx) {
  const places = (keys) =>
    keys.length
      ? ctx.rpc("ops_places_by_keys", { p_keys: [...new Set(keys)] })
      : Promise.resolve([]);
  const data = (row) => ({
    key: row.route_key,
    millas: Number(row.google_miles ?? row.miles),
    horas: Number(row.google_hours ?? row.hours),
    fuente: row.google_miles == null ? "osm" : "google",
    calculadaEn: row.google_at || row.created_at,
    googleEstado:
      row.google_state || (row.google_miles == null ? "pending" : "ok"),
    osm: row.google_miles == null ? undefined : Number(row.miles),
  });
  return {
    getCoordenadas: async (keys = []) => {
      ctx.staff();
      if (!Array.isArray(keys))
        throw Error("Indica las ciudades de esta búsqueda.");
      const records = [];
      for (let i = 0; i < keys.length; i += 200)
        records.push(...(await places(keys.slice(i, i + 200))));
      return {
        ok: true,
        items: Object.fromEntries(
          records
            .filter((row) => row.kind === "city")
            .map((row) => [row.place_key, [row.latitude, row.longitude]]),
        ),
      };
    },
    guardarCoordenadas: async (list) => {
      ctx.staff(true);
      return {
        ok: true,
        guardadas: await ctx.rpc("ops_original_places", {
          p_places: list.slice(0, 200).map((row) => ({
            key: row.key,
            kind: "city",
            text: [row.ciudad, row.estado].filter(Boolean).join(", "),
            lat: row.lat,
            lon: row.lon,
          })),
        }),
      };
    },
    getDirecciones: async (keys) => {
      ctx.staff();
      return {
        ok: true,
        items: Object.fromEntries(
          (await places(keys)).map((row) => [
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
      const records = await ctx.rows(
        "original_routes",
        (query) => query.eq("origin_key", origin),
        "route_key",
      );
      return {
        ok: true,
        items: Object.fromEntries(
          records.map((row) => [row.destination_key, data(row)]),
        ),
      };
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
      const page = await ctx.page("original_routes", {
        filter: (query) =>
          query.or("origin_key.like.dir:*,destination_key.like.dir:*"),
        order: "created_at",
        limit: 50,
      });
      const records = page.records;
      const points = await places([
        ...new Set(
          records.flatMap((row) => [row.origin_key, row.destination_key]),
        ),
      ]);
      const labels = new Map(
        points.map((row) => [
          row.place_key,
          row.searched_text || row.formatted_address,
        ]),
      );
      return {
        ok: true,
        items: records.map((row) => ({
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
        throw Error("Recalcular millas requiere permisos de administración.");
      const route = (
        await ctx.rows(
          "original_routes",
          (query) => query.eq("route_key", key),
          "route_key",
        )
      )[0];
      if (!route) throw Error("Ese trayecto no está guardado.");
      const points = await places([route.origin_key, route.destination_key]);
      const point = (key) => {
        const row = points.find((item) => item.place_key === key);
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
          calculadaEn: new Date().toISOString(),
        },
      };
    },
    getRadarExcel: async () => {
      ctx.staff();
      const row = (
        await ctx.rows(
          "original_radar",
          (query) => query.eq("singleton", true),
          "singleton",
        )
      )[0];
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
