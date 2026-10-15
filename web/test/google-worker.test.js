import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import vm from "node:vm";
import { radarMethods } from "../src/original/api/radar.js";
const code = await readFile(
  new URL("../../google-apps-script/Code-sitio.gs", import.meta.url),
  "utf8",
);
const token = "panel_maps_" + "private-test".repeat(6);
const job = (id) => ({
  route_key: id,
  claim_id: "claim-" + id,
  origin_lat: 27,
  origin_lon: -99,
  destination_lat: 30,
  destination_lon: -97,
});

function worker({
  jobs = [job("A")],
  outcomes = ["OK"],
  busy = false,
  fail = "",
  stepTime = 0,
  activeUser = "owner@local.test",
  effectiveUser = "owner@local.test",
} = {}) {
  const properties = new Map([["PANEL_MAPS_WORKER_TOKEN", token]]),
    logs = [],
    calls = [],
    triggers = [];
  let mapsCalls = 0,
    released = 0,
    clock = 0;
  const props = {
    getProperty: (name) => properties.get(name) || null,
    setProperty: (name, value) => {
      properties.set(name, value);
    },
  };
  const context = vm.createContext({
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length ? args : [clock]));
      }
      static now() {
        return clock;
      }
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => activeUser }),
      getEffectiveUser: () => ({ getEmail: () => effectiveUser }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => !busy,
        releaseLock: () => {
          released++;
        },
      }),
    },
    PropertiesService: { getScriptProperties: () => props },
    Utilities: {
      getUuid: randomUUID,
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_, value) => [
        ...createHash("sha256").update(value).digest(),
      ],
    },
    Logger: { log: (text) => logs.push(text) },
    ScriptApp: {
      getProjectTriggers: () => [...triggers],
      deleteTrigger: (trigger) => triggers.splice(triggers.indexOf(trigger), 1),
      newTrigger: (handler) => {
        const builder = {
          timeBased: () => builder,
          everyHours: (hours) => {
            assert.equal(hours, 1);
            return builder;
          },
          create: () => triggers.push({ getHandlerFunction: () => handler }),
        };
        return builder;
      },
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        const name = url.split("/").at(-1),
          input = JSON.parse(options.payload);
        assert.equal(input.p_token, properties.get("PANEL_MAPS_WORKER_TOKEN"));
        assert.ok(!options.headers.Authorization);
        calls.push({ name, input });
        const result =
          name === "ops_google_worker_claim"
            ? jobs
            : name === "ops_google_worker_complete"
              ? true
              : { pending: jobs.length, completed: 0, no_route: 0 };
        return {
          getResponseCode: () => (fail === name ? 503 : 200),
          getContentText: () => JSON.stringify(result),
        };
      },
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => {} }),
    },
    Maps: {
      DirectionFinder: { Mode: { DRIVING: "driving" } },
      newDirectionFinder: () => {
        const outcome = outcomes[Math.min(mapsCalls++, outcomes.length - 1)];
        const builder = {
          setOrigin: () => builder,
          setDestination: () => builder,
          setMode: () => builder,
          getDirections: () => {
            clock += stepTime;
            if (outcome instanceof Error) throw outcome;
            return {
              status: outcome,
              routes:
                outcome === "OK"
                  ? [
                      {
                        legs: [
                          {
                            distance: { value: 1609.344 },
                            duration: { value: 60 },
                          },
                          {
                            distance: { value: 3218.688 },
                            duration: { value: 120 },
                          },
                        ],
                      },
                    ]
                  : [],
            };
          },
        };
        return builder;
      },
    },
  });
  vm.runInContext(code, context);
  return {
    context,
    properties,
    logs,
    calls,
    triggers,
    stats: () => ({ mapsCalls, released }),
  };
}

test("proceso Google: guarda todos los tramos y solo cuenta escrituras confirmadas", () => {
  const w = worker();
  const result = w.context.procesarMillasGoogle_();
  assert.equal(result.completed, 1);
  assert.equal(result.status, "ok");
  assert.equal(w.calls[1].input.p_miles, 3);
  assert.equal(w.calls[1].input.p_hours, 0.05);
  assert.equal(w.calls[1].input.p_claim, "claim-A");
  assert.equal(w.stats().released, 1);
  assert.ok(!w.logs.join("").includes(token));
  assert.ok(!w.properties.get("PANEL_MAPS_LAST_RUN").includes(token));
  const failed = worker({ fail: "ops_google_worker_complete" });
  const failure = failed.context.procesarMillasGoogle_();
  assert.equal(failure.completed, 0);
  assert.equal(failure.deferred, 1);
  assert.equal(failure.status, "connection_error");
  assert.equal(failed.stats().released, 1);
});

test("proceso Google: cuota detiene el lote; sin ruta y errores transitorios se distinguen", () => {
  for (const quota of [
    "OVER_QUERY_LIMIT",
    new Error("Service invoked too many times for one day: route."),
  ]) {
    const w = worker({ jobs: [job("A"), job("B")], outcomes: [quota, "OK"] });
    const result = w.context.procesarMillasGoogle_();
    assert.equal(result.status, "quota");
    assert.equal(result.deferred, 1);
    assert.equal(w.stats().mapsCalls, 1);
    assert.equal(w.calls[1].input.p_outcome, "quota");
  }
  const w = worker({
    jobs: [job("A"), job("B")],
    outcomes: ["ZERO_RESULTS", "UNKNOWN_ERROR"],
  });
  const result = w.context.procesarMillasGoogle_();
  assert.equal(result.noRoute, 1);
  assert.equal(result.retry, 1);
  assert.deepEqual(
    w.calls.slice(1).map((row) => row.input.p_outcome),
    ["no_route", "retry"],
  );
});

test("proceso Google: ejecución ocupada, presupuesto de tiempo y conexión sin validar no consumen cuota extra", () => {
  const busy = worker({ busy: true });
  assert.equal(busy.context.procesarMillasGoogle_().status, "running");
  assert.equal(busy.calls.length, 0);
  const slow = worker({
    jobs: [job("A"), job("B"), job("C")],
    stepTime: 130000,
  });
  const result = slow.context.procesarMillasGoogle_();
  assert.equal(result.completed, 2);
  assert.equal(result.status, "time_limit");
  assert.equal(result.deferred, 1);
  const failed = worker({ fail: "ops_google_worker_status" });
  assert.throws(
    () => failed.context.activarMillasGoogle_(),
    /Supabase no aceptó/,
  );
  assert.equal(failed.triggers.length, 0);
  assert.equal(failed.stats().mapsCalls, 0);
  assert.throws(
    () => failed.context.googleMilesRpc_("profiles"),
    /no permitida/,
  );
});

test("configuración Google: vínculo solo con hash, preparación repetible y un activador por hora", () => {
  const w = worker({ jobs: [] });
  w.properties.delete("PANEL_MAPS_WORKER_TOKEN");
  w.context.prepararMillasGoogle_();
  const secret = w.properties.get("PANEL_MAPS_WORKER_TOKEN");
  assert.ok(secret.length >= 64);
  const sql = w.logs.at(-1);
  assert.ok(sql.includes(createHash("sha256").update(secret).digest("hex")));
  assert.ok(!sql.includes(secret));
  w.context.prepararMillasGoogle_();
  assert.equal(w.properties.get("PANEL_MAPS_WORKER_TOKEN"), secret);
  w.context.activarMillasGoogle_();
  w.context.activarMillasGoogle_();
  assert.equal(w.triggers.length, 1);
  const state = w.context.estadoMillasGoogle_();
  assert.equal(state.triggers, 1);
  assert.ok(!JSON.stringify(state).includes(secret));
  w.context.desactivarMillasGoogle_();
  assert.equal(w.triggers.length, 0);
  assert.equal(w.properties.get("PANEL_MAPS_WORKER_TOKEN"), secret);
});

test("radar: prefiere el resultado Google guardado y conserva OSM cuando no hay ruta", async () => {
  let checked = false;
  const methods = radarMethods({
    staff() {
      checked = true;
    },
    rows: async (table) => {
      assert.equal(table, "original_routes");
      return [
        {
          route_key: "a>b",
          origin_key: "a",
          destination_key: "b",
          miles: 100,
          hours: 2,
          google_miles: 90,
          google_hours: 1.5,
          google_state: "ok",
        },
        {
          route_key: "a>c",
          origin_key: "a",
          destination_key: "c",
          miles: 200,
          hours: 4,
          google_miles: null,
          google_state: "no_route",
        },
      ];
    },
  });
  const result = await methods.getDistancias("a");
  assert.equal(checked, true);
  assert.equal(result.items.b.millas, 90);
  assert.equal(result.items.b.horas, 1.5);
  assert.equal(result.items.b.fuente, "google");
  assert.equal(result.items.b.osm, 100);
  assert.equal(result.items.c.millas, 200);
  assert.equal(result.items.c.fuente, "osm");
  assert.equal(result.items.c.googleEstado, "no_route");
});

test("selector Google: accesos visibles verifican identidad antes de preparar o ejecutar el proceso", () => {
  const names = [
    "prepararMillasGoogle",
    "activarMillasGoogle",
    "estadoMillasGoogle",
    "procesarMillasGoogle",
    "desactivarMillasGoogle",
  ];
  for (const activeUser of ["", "otra-cuenta@local.test"]) {
    const denied = worker({ activeUser });
    for (const name of names)
      assert.throws(() => denied.context[name](), /Abre el editor/);
    assert.equal(denied.calls.length, 0);
    assert.equal(denied.logs.length, 0);
    assert.equal(denied.triggers.length, 0);
    assert.equal(denied.stats().mapsCalls, 0);
  }
  const allowed = worker({ jobs: [] });
  assert.equal(allowed.context.prepararMillasGoogle().configured, true);
  allowed.context.activarMillasGoogle();
  assert.equal(allowed.context.estadoMillasGoogle().triggers, 1);
  assert.equal(allowed.context.procesarMillasGoogle().status, "ok");
  allowed.context.desactivarMillasGoogle();
  assert.equal(allowed.triggers.length, 0);
});
