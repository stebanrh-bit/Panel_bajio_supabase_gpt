import { routeDirection } from "../personal/domain.js";

/** Misma comparación de ciudades y estados que ops_instruction_key en Supabase. */
export function instructionKey(value) {
  const accents = "áéíóúüñÁÉÍÓÚÜÑ",
    plain = "aeiouunAEIOUUN";
  return String(value ?? "")
    .trim()
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (letter) => plain[accents.indexOf(letter)])
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const customerNameKey = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
// El cliente usa ops_customer_key: conserva acentos y puntuación, excepto sus alias explícitos.
const customerKey = (value, aliases) => {
  const alias = aliases.find(
    (item) => customerNameKey(item.alias) === customerNameKey(value),
  );
  return customerNameKey(alias?.canonical_name ?? value);
};

/** La vista previa explica coincidencias; el RPC conserva la decisión y los permisos finales. */
export function findInstructionMatches(items, record, aliases = []) {
  const matching = items.filter(
    (item) =>
      (!item.customer ||
        customerKey(item.customer, aliases) ===
          customerKey(record.customer_original ?? record.customer, aliases)) &&
      ["origin_city", "origin_state", "dest_city", "dest_state"].every(
        (field) =>
          instructionKey(item[field]) === instructionKey(record[field]),
      ),
  );
  const approved = matching.filter((item) => item.state === "approved");
  const specific = approved.filter((item) => item.customer);
  return {
    // Un instructivo específico tiene prioridad sobre la ruta general, igual que en SQL.
    approved: specific.length ? specific : approved,
    unpublished: matching.filter((item) =>
      ["draft", "paused"].includes(item.state),
    ),
  };
}

/** Una ruta de importación nueva no debe abrir por defecto las etapas de exportación. */
export function instructionFlow(record = {}) {
  return (
    record.flow ||
    record.instruction_plan?.flow ||
    record.instruction_context?.flow ||
    (routeDirection(record).code === "SB" ? "import" : "export")
  );
}
