/** Las tareas usan hora del centro de México, independientemente del huso del equipo. */
const taskClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function wallTime(value) {
  const p = Object.fromEntries(
    taskClock
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Una fecha heredada sin hora significa medianoche de México, nunca medianoche UTC. */
export function taskFollowUpISO(value) {
  if (!value) return "";
  // El calendario entrega objetos Date ya interpretados. Conservar su instante evita
  // volver a analizar Date.toString(), cuyo formato depende del navegador.
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      throw Error("Indica una fecha y hora válidas.");
    return value.toISOString();
  }
  const text = String(value).trim();
  if (/(Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    const instant = new Date(text);
    if (!Number.isFinite(instant.getTime()))
      throw Error("Indica una fecha y hora válidas.");
    return instant.toISOString();
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!match) throw Error("Indica una fecha y hora válidas.");
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const requested = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const nominal = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  if (new Date(nominal).toISOString().slice(0, 19) !== requested)
    throw Error("Indica una fecha y hora válidas.");
  let candidate = nominal;
  for (let i = 0; i < 3; i++) {
    const difference = nominal - Date.parse(wallTime(candidate) + "Z");
    candidate += difference;
    if (!difference) break;
  }
  if (wallTime(candidate) !== requested)
    throw Error("Esa hora no existe en la zona del centro de México.");
  return new Date(candidate).toISOString();
}

export function taskFollowUpInput(value) {
  if (!value) return "";
  try {
    return wallTime(taskFollowUpISO(value)).slice(0, 16);
  } catch {
    return "";
  }
}

export function taskReminderDue(task, now = Date.now()) {
  if (!task || task.resuelto || task.cancelado || !task.fecha_seguimiento)
    return false;
  try {
    return Date.parse(taskFollowUpISO(task.fecha_seguimiento)) <= now;
  } catch {
    return false;
  }
}
