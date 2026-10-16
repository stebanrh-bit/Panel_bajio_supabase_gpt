import { readPanelSource } from "../scripts/panel_source.mjs";
import { defineConfig, minify } from "vite";
import { readFile } from "node:fs/promises";
// Fuentes comentadas; entregas comprimidas y autónomas para Google HtmlService.
export default defineConfig(({ mode }) => {
  const portal = ["client", "manager"].includes(mode) ? mode : null;
  return {
    plugins: [
      {
        name: "panel-autonomous-views",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:portal-template") return "\0portal-template";
        },
        async load(id) {
          if (id === "\0portal-template")
            return (
              "export default " +
              JSON.stringify(
                await readFile(
                  new URL(
                    `./src/original/${portal}.template.html`,
                    import.meta.url,
                  ),
                  "utf8",
                ),
              )
            );
        },
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            return portal
              ? html.replace(
                  "/src/original/main.js",
                  "/src/original/main-portal.js",
                )
              : html;
          },
        },
        async transform(source, id) {
          if (id.endsWith("/panel-source.js")) {
            const result = await minify(
              "panel-script.js",
              await readPanelSource(),
              {},
            );
            return {
              code: "export default " + JSON.stringify(result.code),
              map: null,
            };
          }
        },
      },
    ],
    define: { __PANEL_VIEW__: JSON.stringify(portal || "internal") },
    build:
      mode === "reader"
        ? {
            outDir: "dist/reader",
            emptyOutDir: true,
            minify: true,
            lib: {
              entry: "src/original/reader-worker.js",
              name: "PanelReader",
              formats: ["iife"],
              fileName: () => "lector.js",
            },
          }
        : {
            outDir: portal ? `dist/${portal}` : "dist/internal",
            emptyOutDir: true,
            minify: true,
            cssMinify: true,
          },
  };
});
