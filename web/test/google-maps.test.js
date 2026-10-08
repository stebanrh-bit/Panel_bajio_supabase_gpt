import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("Google valida sesión y rol antes de mapas; carretera suma todos los tramos", async () => {
  let permitted = false,
    fetches = 0,
    mapsCalls = 0;
  const context = vm.createContext({
    UrlFetchApp: {
      fetch: () => {
        fetches++;
        return {
          getResponseCode: () => 200,
          getContentText: () =>
            JSON.stringify(
              fetches % 2
                ? { id: "user-1" }
                : [{ role: permitted ? "csr" : "client", active: true }],
            ),
        };
      },
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => {} }),
    },
    Maps: {
      DirectionFinder: { Mode: { DRIVING: "driving" } },
      newDirectionFinder: () => {
        mapsCalls++;
        const builder = {
          setOrigin: () => builder,
          setDestination: () => builder,
          setMode: () => builder,
          getDirections: () => ({
            status: "OK",
            routes: [
              {
                legs: [
                  { distance: { value: 1609.344 }, duration: { value: 60 } },
                  { distance: { value: 3218.688 }, duration: { value: 120 } },
                ],
              },
            ],
          }),
        };
        return builder;
      },
    },
  });
  vm.runInContext(
    await readFile(
      new URL("../../google-apps-script/Code-sitio.gs", import.meta.url),
      "utf8",
    ),
    context,
  );
  const token = "TOKEN-DE-PRUEBA-NO-REAL",
    a = { latitude: 27, longitude: -99 },
    b = { latitude: 32, longitude: -96 };
  assert.throws(() => context.panelRoadDistance(token, a, b), /acceso a mapas/);
  assert.equal(mapsCalls, 0);
  permitted = true;
  const result = context.panelRoadDistance(token, a, b);
  assert.equal(result.miles, 3);
  assert.equal(result.minutes, 3);
  assert.equal(mapsCalls, 1);
  assert.throws(
    () => context.panelRoadDistance(token, { latitude: 91, longitude: 0 }, b),
    /inválidas/,
  );
  assert.equal(mapsCalls, 1);
});
