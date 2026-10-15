/** Una carga reúne sus avisos y sus dos plazos, sin alterar ninguno de sus datos. */
export function attentionGroups(rows, priorities, reminders) {
  const groups = new Map();
  function group(row) {
    const key = String(row.load);
    if (!groups.has(key))
      groups.set(key, { row, reasons: [], bucket: "scheduled", reminders: [] });
    return groups.get(key);
  }
  for (const item of priorities) {
    const entry = group(item.rec);
    entry.reasons = item.reasons;
    entry.bucket = item.bucket;
  }
  for (const reminder of reminders) {
    const entry = group(reminder.row);
    entry.reminders.push(reminder);
    if (reminder.needsAction && entry.bucket === "scheduled")
      entry.bucket = "review";
  }
  for (const row of rows) {
    if (!row.client_notify_pending) continue;
    const entry = group(row);
    if (entry.bucket === "scheduled") entry.bucket = "review";
  }
  const rank = { now: 0, review: 1, monitor: 2, scheduled: 3 };
  return [...groups.values()].sort((a, b) => {
    const priority = rank[a.bucket] - rank[b.bucket];
    if (priority) return priority;
    const earliest = (entry) => Math.min(...entry.reminders.map((r) => r.time));
    return (
      earliest(a) - earliest(b) ||
      String(a.row.load).localeCompare(String(b.row.load))
    );
  });
}

/** Fechas de lectura en español; los campos editables conservan el formato ISO original. */
export function formatMoment(value, dateOnly = false) {
  if (!value) return "—";
  const plainDate =
    typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date =
    value instanceof Date
      ? value
      : plainDate
        ? new Date(
            Number(plainDate[1]),
            Number(plainDate[2]) - 1,
            Number(plainDate[3]),
          )
        : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(dateOnly
      ? {}
      : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  }).format(date);
}

/** Solo notifica una espera local; nunca guarda datos ni reintenta una escritura. */
export function pendingChange(id, waiting) {
  window.dispatchEvent(
    new CustomEvent("panel:save", {
      detail: { id: "queued:" + id, phase: waiting ? "start" : "cancel" },
    }),
  );
}

const mountedDocuments = new WeakMap();

/** Mejoras comunes: controles originales conservan sus nodos y manejadores. */
export function mountUsability(doc) {
  if (mountedDocuments.has(doc)) return mountedDocuments.get(doc);
  const win = doc.defaultView;
  doc.body.classList.add("panel-internal");
  let labelId = 0;
  let overlayStack = [];
  let inertNodes = new Map();
  let refreshing = false;
  let lastTrigger = null;
  doc.addEventListener(
    "click",
    (event) => {
      let node = event.target.closest("button,summary,a,[role=button]");
      if (!node) return;
      if (node.closest(".ux-account-actions"))
        node = doc.querySelector("#ux-account-menu > summary");
      lastTrigger = { node, id: node.id, data: { ...node.dataset } };
    },
    true,
  );
  const returnTarget = (trigger) => {
    if (!trigger) return null;
    if (trigger.node?.isConnected && visible(trigger.node)) return trigger.node;
    const byId = trigger.id && doc.getElementById(trigger.id);
    if (byId && visible(byId)) return byId;
    const entries = Object.entries(trigger.data || {});
    return entries.length
      ? [...doc.querySelectorAll("button,summary,a,[role=button]")].find(
          (node) =>
            entries.every(([key, value]) => node.dataset[key] === value) &&
            visible(node),
        )
      : null;
  };

  const visible = (node) => {
    if (
      !node ||
      node.closest("[hidden], [inert], details:not([open]) > :not(summary)")
    )
      return false;
    const style = win.getComputedStyle(node);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      !!node.getClientRects().length
    );
  };
  const focusables = (root) =>
    [
      ...root.querySelectorAll(
        'button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"])',
      ),
    ].filter(visible);

  function labelFields() {
    doc
      .querySelectorAll(
        "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),select,textarea",
      )
      .forEach((field) => {
        if (field.labels?.length || field.getAttribute("aria-labelledby"))
          return;
        const container = field.closest(
          ".field,.review-field,.comm-field,.tracking-field",
        );
        const caption = container?.querySelector(".k,.field-label,label");
        if (caption && !caption.contains(field)) {
          caption.id ||= "ux-field-label-" + ++labelId;
          field.setAttribute("aria-labelledby", caption.id);
          return;
        }
        const name =
          field.getAttribute("aria-label") ||
          field.getAttribute("placeholder") ||
          field.title;
        if (!name) return;
        field.setAttribute("aria-label", name);
        // En los formularios estáticos el rótulo permanece al escribir.
        if (
          field.parentElement.matches(".csr-form,.comments-form,.identity-form")
        ) {
          field.id ||= "ux-field-" + ++labelId;
          const label = doc.createElement("label");
          label.className = "ux-form-field";
          const text = doc.createElement("span");
          text.textContent = name;
          field.before(label);
          label.append(text, field);
        }
      });
  }

  function restoreBackground() {
    for (const [node, wasInert] of inertNodes) node.inert = wasInert;
    inertNodes.clear();
  }

  function syncDialogs() {
    // El último diálogo abierto gana, también cuando se abre una confirmación anidada.
    const open = [
      ...doc.querySelectorAll(
        ".modal-backdrop.show,.who-drawer-backdrop.show,.workspace-backdrop.show",
      ),
    ];
    const removed = overlayStack.filter(
      (entry) => !open.includes(entry.overlay),
    );
    const previousTop = overlayStack.at(-1);
    overlayStack = overlayStack.filter((entry) => open.includes(entry.overlay));
    for (const overlay of open) {
      if (!overlayStack.some((entry) => entry.overlay === overlay))
        overlayStack.push({
          overlay,
          returnFocus: lastTrigger || { node: doc.activeElement },
          originalZIndex: overlay.style.zIndex,
        });
    }
    const top = overlayStack.at(-1);
    if (top === previousTop) return;
    for (const entry of removed) {
      entry.overlay.style.zIndex = entry.originalZIndex;
      entry.overlay.setAttribute("aria-hidden", "true");
    }
    overlayStack.forEach((entry, index) => {
      entry.overlay.style.zIndex = String(1500 + index * 10);
      entry.overlay.setAttribute("aria-hidden", "false");
    });
    restoreBackground();
    if (top) {
      // Inhabilita hermanos de cada ancestro sin volver inerte el propio diálogo.
      let branch = top.overlay;
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (
            sibling === branch ||
            ["SCRIPT", "STYLE"].includes(sibling.tagName)
          )
            continue;
          inertNodes.set(sibling, sibling.inert);
          sibling.inert = true;
        }
        if (branch.parentElement === doc.body) break;
        branch = branch.parentElement;
      }
      const nestedReturn = returnTarget(removed.at(-1)?.returnFocus);
      if (
        !top.overlay.contains(doc.activeElement) ||
        (nestedReturn && top.overlay.contains(nestedReturn))
      ) {
        const target =
          nestedReturn && top.overlay.contains(nestedReturn)
            ? nestedReturn
            : focusables(top.overlay)[0] || top.overlay;
        if (target === top.overlay) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    } else if (removed.length) {
      returnTarget(removed[0].returnFocus)?.focus({ preventScroll: true });
    }
  }

  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Tab") return;
      syncDialogs();
      const top = overlayStack.at(-1);
      if (!top) return;
      const items = focusables(top.overlay);
      const first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        top.overlay.focus();
        return;
      }
      if (
        !top.overlay.contains(doc.activeElement) ||
        (!event.shiftKey && doc.activeElement === last) ||
        (event.shiftKey && doc.activeElement === first)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    },
    true,
  );
  doc.addEventListener("focusin", (event) => {
    const top = overlayStack.at(-1);
    if (top && !top.overlay.contains(event.target))
      focusables(top.overlay)[0]?.focus();
  });

  function administration() {
    const box = doc.querySelector("#csr-backdrop .modal-box");
    if (!box || box.querySelector(".ux-admin-tabs")) return;
    const groups = [
      ["people", "Personas", ["csr-new-nombre"]],
      ["customers", "Clientes y asignaciones", ["csr-asig-csr", "pc-nombre"]],
      [
        "access",
        "Accesos",
        ["csr-pw-current", "vista-pw-nueva", "bloqueos-lista"],
      ],
      ["imports", "Importaciones", ["deshacer-import-box"]],
      ["history", "Bitácora", ["admin-bitacora-lista"]],
    ];
    const nav = doc.createElement("nav");
    nav.className = "ux-admin-tabs";
    nav.setAttribute("aria-label", "Secciones de administración");
    const sections = [];
    for (const [key, label, ids] of groups) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "ws-btn";
      button.dataset.adminSection = key;
      button.textContent = label;
      nav.append(button);
      for (const id of ids) {
        const section = doc.getElementById(id)?.closest(".csr-section");
        if (section) sections.push({ key, section });
      }
      button.addEventListener("click", () => {
        for (const item of sections) item.section.hidden = item.key !== key;
        nav
          .querySelectorAll("button")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      });
    }
    box.querySelector(".modal-head").after(nav);
    nav.firstElementChild.click();
  }

  function accountMenu() {
    const chip = doc.getElementById("session-chip");
    if (!chip) return;
    let menu = doc.getElementById("ux-account-menu");
    if (!menu) {
      menu = doc.createElement("details");
      menu.id = "ux-account-menu";
      const summary = doc.createElement("summary");
      summary.setAttribute("aria-label", "Mi cuenta");
      const actions = doc.createElement("div");
      actions.className = "ux-account-actions";
      chip.before(menu);
      menu.append(summary, actions);
      summary.append(chip);
      for (const id of ["session-change-pw-btn", "session-logout-btn"]) {
        const button = doc.getElementById(id);
        if (button) {
          actions.append(button);
          button.addEventListener("click", () => (menu.open = false));
        }
      }
      const role = doc.createElement("span");
      role.id = "session-chip-role";
      chip.append(role);
    }
    if (menu.hidden !== chip.hidden) menu.hidden = chip.hidden;
    const role = doc.getElementById("session-chip-role");
    if (role.textContent !== chip.title) role.textContent = chip.title;
  }

  function secondaryControls() {
    const toolbar = doc.querySelector("#page-operation .toolbar");
    if (toolbar && !doc.getElementById("ux-advanced-filters")) {
      const details = doc.createElement("details");
      details.id = "ux-advanced-filters";
      const summary = doc.createElement("summary");
      summary.textContent = "Más filtros y opciones";
      const content = doc.createElement("div");
      content.className = "ux-advanced-content";
      details.append(summary, content);
      toolbar.after(details);
      for (const node of toolbar.querySelectorAll(
        '[data-filter="cruce-hoy"],[data-filter="cruce-semana"],[data-filter="cancelada"],#masivo-btn,#densidad-btn',
      ))
        content.append(node);
      const views = doc.getElementById("vistas-bar");
      if (views) content.append(views);
    }
  }

  const pending = new Set(),
    failed = new Map();
  const feedback = doc.createElement("div");
  feedback.id = "ux-save-feedback";
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  feedback.hidden = true;
  doc.querySelector("header.top")?.after(feedback);
  function showSaveState() {
    feedback.replaceChildren();
    feedback.hidden = !pending.size && !failed.size && !feedback.dataset.saved;
    feedback.dataset.state = failed.size
      ? "error"
      : pending.size
        ? "saving"
        : "saved";
    const message = doc.createElement("span");
    message.textContent = failed.size
      ? "No se guardó un cambio: " +
        [...failed.values()].at(-1) +
        " Revisa el campo y vuelve a guardar."
      : pending.size
        ? "Guardando cambios… Espera la confirmación."
        : "Cambios guardados.";
    feedback.append(message);
    if (failed.size) {
      const dismiss = doc.createElement("button");
      dismiss.type = "button";
      dismiss.className = "ws-btn";
      dismiss.textContent = "Entendido";
      dismiss.addEventListener("click", () => {
        failed.clear();
        delete feedback.dataset.saved;
        showSaveState();
      });
      feedback.append(dismiss);
    }
  }
  win.addEventListener("panel:save", ({ detail }) => {
    if (detail.phase === "reset") {
      pending.clear();
      failed.clear();
      delete feedback.dataset.saved;
    } else if (detail.phase === "start") pending.add(detail.id);
    else {
      pending.delete(detail.id);
      if (detail.phase === "error")
        failed.set(
          detail.id,
          detail.message || "No se pudo completar la operación.",
        );
      if (detail.phase === "success") feedback.dataset.saved = "true";
    }
    showSaveState();
  });

  doc.getElementById("ux-admin-import")?.addEventListener("click", () => {
    // El botón original mantiene la comprobación administrativa y la selección del archivo.
    doc.getElementById("csr-close").click();
    doc.getElementById("excel-import-btn").click();
  });
  const timezone = doc.getElementById("home-timezone");
  if (timezone) {
    const zoneName = new Intl.DateTimeFormat("es-MX", { timeZoneName: "long" })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    timezone.textContent =
      "Fechas y horas de tu dispositivo: " + zoneName + ".";
  }

  function refresh() {
    if (refreshing) return;
    refreshing = true;
    labelFields();
    administration();
    accountMenu();
    secondaryControls();
    syncDialogs();
    // La confirmación debe poder leerse también dentro de un diálogo modal activo.
    const overlay = overlayStack.at(-1)?.overlay;
    const box = overlay?.querySelector(
      ".modal-box,.workspace-panel,.who-drawer",
    );
    if (box) {
      const heading = box.querySelector(".modal-head,.workspace-head");
      const needsPlacement = heading
        ? feedback.previousElementSibling !== heading
        : feedback.parentElement !== box;
      if (needsPlacement) {
        if (inertNodes.has(feedback)) {
          feedback.inert = inertNodes.get(feedback);
          inertNodes.delete(feedback);
        }
        if (heading) heading.after(feedback);
        else box.prepend(feedback);
      }
    } else if (!box) {
      const header = doc.querySelector("header.top");
      if (header && feedback.previousElementSibling !== header)
        header.after(feedback);
    }
    refreshing = false;
  }
  const observer = new win.MutationObserver(refresh);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "title"],
  });
  refresh();
  const result = {
    refresh,
    disconnect() {
      observer.disconnect();
      restoreBackground();
    },
  };
  mountedDocuments.set(doc, result);
  return result;
}
