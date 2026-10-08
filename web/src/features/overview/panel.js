import { escapeHtml as escape } from "../../ui/html.js";
import { createPanelController, personName } from "../../ui/panel.js";
import { fetchAll } from "../../data/supabase.js";
import { attentionFor, marked } from "../../load-rules.js";
import { customerKey, dayKey, calendarEvents, indicators } from "./rules.js";

export function createOverviewService(client) {
  const list = (table) =>
    fetchAll(
      () => client.from(table).select("*").order("id"),
      "la actualización completa",
    );
  return {
    async list() {
      const [loads, assignments, following, communications, reserved] =
        await Promise.all([
          fetchAll(() =>
            client
              .from("loads")
              .select("*,incidents(count)")
              .eq("archived", false)
              .order("load"),
          ),
          fetchAll(() =>
            client
              .from("customer_assignments")
              .select("*")
              .order("customer_key"),
          ),
          fetchAll(() =>
            client
              .from("load_followers")
              .select("*")
              .order("load")
              .order("user_id"),
          ),
          list("communications"),
          list("reserved_loads"),
        ]);
      return {
        loads: loads.map((row) => ({
          ...row,
          incidenciasCount: row.incidents?.[0]?.count || 0,
        })),
        assignments,
        following,
        communications,
        reserved,
      };
    },
  };
}

/** Una misma fuente alimenta jornada, calendario e indicadores; gerencia conserva lectura. */
export function createOverviewPanel({
  container,
  service,
  people,
  userId,
  mode = "home",
  onOpenLoad,
  onError,
}) {
  const view = createPanelController(container, onError);
  let data,
    month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let person = "",
    customer = "",
    onlyFollowed = false;
  function open() {
    return view.load(service.list, (result) => {
      data = result;
      render();
    });
  }
  function filteredLoads() {
    return data.loads.filter((load) => {
      const assignment = data.assignments.find(
        (item) => item.customer_key === customerKey(load.customer),
      );
      return (
        (!person || assignment?.owner_id === person) &&
        (!customer || load.customer === customer) &&
        (!onlyFollowed ||
          data.following.some(
            (item) => item.load === load.load && item.user_id === userId,
          ))
      );
    });
  }
  function render() {
    const loads = filteredLoads(),
      stats = indicators(
        loads,
        data.communications.filter((event) =>
          loads.some((load) => load.load === event.load),
        ),
      );
    container.innerHTML = `<section class="card"><div class="toolbar"><h2>${{ home: "Mi jornada", calendar: "Calendario operativo", metrics: "Indicadores de operación" }[mode]}</h2><button id="overview-refresh">Actualizar</button></div>
      <div class="grid"><label>Operador asignado<select id="overview-person"><option value="">Todo el equipo</option>${people
        .filter((row) => ["csr", "admin"].includes(row.role))
        .map(
          (row) =>
            `<option value="${escape(row.id)}" ${person === row.id ? "selected" : ""}>${escape(personName(people, row.id))}</option>`,
        )
        .join("")}</select></label>
        <label>Cliente<select id="overview-customer"><option value="">Todos</option>${[
          ...new Set(data.loads.map((row) => row.customer)),
        ]
          .filter(Boolean)
          .sort()
          .map(
            (value) =>
              `<option ${customer === value ? "selected" : ""}>${escape(value)}</option>`,
          )
          .join("")}</select></label>
        <label class="checkbox"><input id="overview-followed" type="checkbox" ${onlyFollowed ? "checked" : ""}>Solo cargas que sigo</label></div><div id="overview-content"></div></section>`;
    container.querySelector("#overview-refresh").onclick = open;
    container.querySelector("#overview-person").onchange = (event) => {
      person = event.target.value;
      render();
    };
    container.querySelector("#overview-customer").onchange = (event) => {
      customer = event.target.value;
      render();
    };
    container.querySelector("#overview-followed").onchange = (event) => {
      onlyFollowed = event.target.checked;
      render();
    };
    const content = container.querySelector("#overview-content");
    if (mode === "calendar") renderCalendar(content, loads);
    else {
      content.innerHTML = `<div class="kpis">${Object.entries({
        "Cargas activas": stats.active,
        "Requieren atención": stats.attention,
        "Pendientes de avisar": stats.notifications,
        "Entregas hoy": stats.today,
        "POD pendientes": stats.missingPod,
      })
        .map(
          ([label, value]) =>
            `<div class="kpi"><strong>${value}</strong><span>${label}</span></div>`,
        )
        .join("")}</div>
        ${
          mode === "metrics"
            ? `<h3>Cumplimiento de citas y comunicación</h3><p>Entregas a tiempo: ${stats.onTimeDelivery === null ? "Sin datos" : stats.onTimeDelivery.toFixed(1) + "%"} (${stats.deliverySamples} cargas con desfase registrado; a tiempo = desfase menor o igual a 0 minutos).</p>
        <p>Tiempo medio desde pendiente de aviso hasta aviso registrado: ${stats.sla.average === null ? "Sin avisos medidos" : stats.sla.average.toFixed(1) + " minutos"} (${stats.sla.samples} episodios).</p><p>Estos indicadores corresponden a las cargas activas del filtro y a los eventos registrados; no certifican mensajes enviados fuera del panel.</p>`
            : ""
        }
        <h3>Atención y avisos</h3><ul>${
          loads
            .filter(
              (row) => attentionFor(row) || marked(row.client_notify_pending),
            )
            .map(
              (row) =>
                `<li><strong>${escape(row.load)} · ${escape(row.customer)}</strong><p>${escape(attentionFor(row) || "Pendiente de avisar al cliente")}</p><button data-overview-load="${escape(row.load)}">Abrir carga</button></li>`,
            )
            .join("") || "<li>Sin pendientes de atención con este filtro.</li>"
        }</ul>`;
    }
    container
      .querySelectorAll("[data-overview-load]")
      .forEach(
        (button) =>
          (button.onclick = () => onOpenLoad(button.dataset.overviewLoad)),
      );
  }
  function renderCalendar(content, loads) {
    const events = calendarEvents(
      loads,
      data.reserved.filter((record) => !person || record.created_by === person),
    );
    const first = new Date(month.getFullYear(), month.getMonth(), 1),
      last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const days = Array.from(
      { length: last.getDate() },
      (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1),
    );
    content.innerHTML = `<div class="toolbar"><button id="month-previous">Mes anterior</button><h3>${escape(month.toLocaleDateString("es", { month: "long", year: "numeric" }))}</h3><button id="month-next">Mes siguiente</button></div>
      <p>Fechas en ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}.</p><div class="calendar-grid">${Array.from({ length: (first.getDay() + 6) % 7 }, () => '<div class="calendar-empty"></div>').join("")}${days
        .map(
          (
            day,
          ) => `<div class="calendar-day"><strong>${day.getDate()} · ${escape(day.toLocaleDateString("es", { weekday: "short" }))}</strong>
        ${events
          .filter((event) => dayKey(event.date) === dayKey(day))
          .map((event) =>
            event.kind === "load"
              ? `<button data-overview-load="${escape(event.load)}">${escape(event.label)} · ${escape(event.load)}<small class="block">${escape(event.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</small></button>`
              : `<p>${escape(event.label)} · ${escape(event.load)}</p>`,
          )
          .join("")}</div>`,
        )
        .join("")}</div>`;
    content.querySelector("#month-previous").onclick = () => {
      month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
      render();
    };
    content.querySelector("#month-next").onclick = () => {
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      render();
    };
  }
  return { open, dispose: view.dispose };
}
