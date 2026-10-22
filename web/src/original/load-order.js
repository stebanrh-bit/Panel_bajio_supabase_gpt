/** Orden personal del listado. Los identificadores siguen siendo los números reales de carga. */
const sessionOrders = new Map();

function uniqueIds(values) {
  return Array.isArray(values)
    ? [
        ...new Set(
          values.filter(
            (value) => typeof value === "string" && value.length > 0,
          ),
        ),
      ]
    : [];
}

export function readOrder(storage, user) {
  if (!user) return [];
  const key = "bajio_orden_cargas_" + user;
  try {
    const order = uniqueIds(JSON.parse(storage.getItem(key) || "[]"));
    return sessionOrders.get(key) || order;
  } catch {
    return sessionOrders.get(key) || [];
  }
}

/** Devuelve si pudo persistir; la sesión conserva el orden incluso con almacenamiento bloqueado. */
export function saveOrder(storage, user, values) {
  if (!user) return false;
  const key = "bajio_orden_cargas_" + user,
    order = uniqueIds(values);
  sessionOrders.set(key, order);
  try {
    storage.setItem(key, JSON.stringify(order));
    sessionOrders.delete(key);
    return true;
  } catch {
    return false;
  }
}

/** Las cargas nuevas se añaden al final; los registros originales nunca se modifican. */
export function orderedRecords(records, ids) {
  const positions = new Map(uniqueIds(ids).map((id, index) => [id, index]));
  return [...records].sort(
    (a, b) =>
      (positions.get(String(a.load)) ?? positions.size) -
      (positions.get(String(b.load)) ?? positions.size),
  );
}

/** Reordenar solo los huecos visibles evita desplazar cargas escondidas por un filtro. */
export function moveVisible(order, visible, source, target, after = false) {
  const ids = uniqueIds(order),
    shown = new Set(uniqueIds(visible));
  const moving = ids.filter((id) => shown.has(id));
  if (source === target || !moving.includes(source) || !moving.includes(target))
    return ids;
  moving.splice(moving.indexOf(source), 1);
  moving.splice(moving.indexOf(target) + (after ? 1 : 0), 0, source);
  let index = 0;
  return ids.map((id) => (shown.has(id) ? moving[index++] : id));
}

/** Arrastre con ratón o dedo desde el número; flechas/Home/End ofrecen acceso por teclado.
 * Solo informa la intención. El panel aplica sus filtros, numeración y guardado después. */
export function mountRowReordering(body, { onMove, announce }) {
  const doc = body.ownerDocument,
    win = doc.defaultView;
  let drag = null,
    frame = 0;
  const rows = () =>
    [...body.querySelectorAll("tr.t-row")].filter(
      (row) => row.style.display !== "none",
    );
  const id = (row) => row?.dataset.load;

  function clearTarget() {
    body
      .querySelectorAll(".load-drop-before,.load-drop-after")
      .forEach((row) =>
        row.classList.remove("load-drop-before", "load-drop-after"),
      );
  }
  function findTarget() {
    clearTarget();
    if (!drag?.active) return;
    const row = doc.elementFromPoint(drag.x, drag.y)?.closest("tr.t-row");
    drag.target = null;
    if (
      !row ||
      row.parentNode !== body ||
      row === drag.row ||
      row.style.display === "none"
    )
      return;
    const bounds = row.getBoundingClientRect();
    drag.target = row;
    drag.after = drag.y > bounds.top + bounds.height / 2;
    row.classList.add(drag.after ? "load-drop-after" : "load-drop-before");
  }
  function scrollDrag() {
    if (!drag?.active) return;
    const distance = drag.y < 80 ? -12 : drag.y > win.innerHeight - 80 ? 12 : 0;
    if (distance) {
      win.scrollBy(0, distance);
      findTarget();
    }
    frame = win.requestAnimationFrame(scrollDrag);
  }
  function finish(commit) {
    if (!drag) return;
    const state = drag;
    drag = null;
    win.cancelAnimationFrame(frame);
    clearTarget();
    state.row.classList.remove("load-dragging");
    state.ghost?.remove();
    if (state.handle.hasPointerCapture(state.pointer))
      state.handle.releasePointerCapture(state.pointer);
    if (
      commit &&
      state.active &&
      state.target?.isConnected &&
      state.row.isConnected
    )
      onMove(id(state.row), id(state.target), state.after);
    else if (state.active)
      announce("Movimiento cancelado. El orden no cambió.");
  }
  body.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-load-order]");
    if (!handle || !event.isPrimary || event.button !== 0) return;
    finish(false);
    handle.focus({ preventScroll: true });
    drag = {
      handle,
      row: handle.closest("tr.t-row"),
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
    handle.setPointerCapture(event.pointerId);
  });
  body.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (
      !drag.active &&
      Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6
    )
      return;
    event.preventDefault();
    if (!drag.active) {
      drag.active = true;
      drag.row.classList.add("load-dragging");
      drag.ghost = doc.createElement("div");
      drag.ghost.className = "load-order-ghost";
      drag.ghost.setAttribute("aria-hidden", "true");
      drag.ghost.textContent = "Carga " + id(drag.row);
      doc.body.append(drag.ghost);
      scrollDrag();
    }
    drag.ghost.style.left =
      Math.min(drag.x + 12, Math.max(0, win.innerWidth - 212)) + "px";
    drag.ghost.style.top = drag.y + 12 + "px";
    findTarget();
  });
  body.addEventListener("pointerup", (event) => {
    if (drag?.pointer === event.pointerId) finish(true);
  });
  body.addEventListener("pointercancel", () => finish(false));
  body.addEventListener("lostpointercapture", () => finish(false));
  body.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      finish(false);
      return;
    }
    const handle = event.target.closest("[data-load-order]");
    if (!handle || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    const visible = rows(),
      source = handle.closest("tr.t-row"),
      position = visible.indexOf(source);
    const destination =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? visible.length - 1
          : position + (event.key === "ArrowUp" ? -1 : 1);
    if (
      destination >= 0 &&
      destination < visible.length &&
      destination !== position
    )
      onMove(id(source), id(visible[destination]), destination > position);
  });
  // Un clic en el número no debe abrir el expediente ni seleccionar la carga en modo masivo.
  body.addEventListener("click", (event) => {
    if (event.target.closest("[data-load-order]")) {
      event.stopPropagation();
      announce(
        "Arrastra el número para mover la carga, o usa las flechas arriba y abajo del teclado.",
      );
    }
  });
  win.addEventListener("blur", () => finish(false));
}
