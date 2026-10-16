import { readFile } from "node:fs/promises";
/** Ensamblar los mismos fragmentos que usa Vite para pruebas y entrega. */
export async function readPanelSource() {
  const base = new URL("../web/src/original/", import.meta.url);
  const files = JSON.parse(
    await readFile(new URL("panel.parts.json", base), "utf8"),
  );
  if (files.some((path) => !/^panel\/[\w]+\.js$/.test(path)))
    throw Error("Manifiesto de interfaz no válido.");
  return (
    await Promise.all(
      files.map((path) => readFile(new URL(path, base), "utf8")),
    )
  ).join("");
}
