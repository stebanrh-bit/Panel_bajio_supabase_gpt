import { escapeHtml as escape } from "../../ui/html.js";
import { createPanelController, personName } from "../../ui/panel.js";
import { fetchAll } from "../../data/supabase.js";
import { attentionFor, marked } from "../../load-rules.js";
import { homeMarkup } from "./home.js";
import { customerKey, dayKey, calendarEvents, indicators } from "./rules.js";

export function createOverviewService(client) {
  const list = (table) =>
    fetchAll(
      () => client.from(table).select("*").order("id"),
      "la actualización completa",
    );
  return {
    async list() {
      const [
        loads,
        assignments,
        following,
        communications,
        reserved,
        pending,
        tasks,
        closures,
      ] = await Promise.all([
        fetchAll(() =>
          client
            .from("loads")
            .select("*,incidents(count)")
            .eq("archived", false)
            .order("load"),
        ),
        fetchAll(() =>
          client.from("customer_assignments").select("*").order("customer_key"),
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
        list("pending_loads"),
        list("shift_tasks"),
        list("shift_closures"),
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
        pending,
        tasks,
        closures,
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
  onNavigate,
  onError,
}) {
  const view = createPanelController(container, onError);
  let data,
    week = new Date();
  week.setHours(0, 0, 0, 0);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  let homeTab = "now",
    priority = "",
    search = "";
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
        [
          load.load,
          load.customer,
          load.trailer,
          load.truck,
          load.origin_city,
          load.dest_city,
        ].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase()
            .includes(search),
        ) &&
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
    container.innerHTML = `<section class="${mode === "home" ? "home-command" : "card"}"><div class="home-command-head"><div class="home-command-title"><h1>${{ home: "Mi operación", calendar: "Calendario de la semana", metrics: "Indicadores de operación" }[mode]}</h1><p>${mode === "home" ? "Lo que requiere tu atención ahora" : "Consulta las cargas del filtro seleccionado."}</p></div>${mode === "home" ? `<label class="home-global-search"><input id="home-search" type="search" placeholder="Buscar load, cliente, trailer…" aria-label="Buscar en mi operación" value="${escape(search)}"></label>` : ""}<button id="overview-refresh">Actualizar</button></div>
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
    else if (mode === "home") {
      content.innerHTML = homeMarkup(loads, data, {
        tab: homeTab,
        priority,
        userId,
      });
      content.querySelectorAll("[data-home-tab]").forEach(
        (button) =>
          (button.onclick = () => {
            homeTab = button.dataset.homeTab;
            render();
          }),
      );
      content.querySelectorAll("[data-home-priority]").forEach(
        (button) =>
          (button.onclick = () => {
            priority =
              priority === button.dataset.homePriority
                ? ""
                : button.dataset.homePriority;
            render();
          }),
      );
      content
        .querySelectorAll("[data-home-module]")
        .forEach(
          (button) =>
            (button.onclick = () => onNavigate(button.dataset.homeModule)),
        );
      container.querySelector("#home-search").oninput = (event) => {
        search = event.target.value.toLocaleLowerCase();
        const position = event.target.selectionStart;
        render();
        const input = container.querySelector("#home-search");
        input.focus();
        input.setSelectionRange(position, position);
      };
    } else {
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
    const days = Array.from(
      { length: 7 },
      (_, index) =>
        new Date(week.getFullYear(), week.getMonth(), week.getDate() + index),
    );
    content.innerHTML = `<div class="toolbar"><button id="week-previous">← Semana anterior</button><h3>${escape(days[0].toLocaleDateString("es-MX"))} — ${escape(days[6].toLocaleDateString("es-MX"))}</h3><button id="week-today">Esta semana</button><button id="week-next">Semana siguiente →</button></div>
      <p>Fechas en ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}.</p><div class="calendar-grid">${days
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
    content.querySelector("#week-previous").onclick = () => {
      week.setDate(week.getDate() - 7);
      render();
    };
    content.querySelector("#week-next").onclick = () => {
      week.setDate(week.getDate() + 7);
      render();
    };
    content.querySelector("#week-today").onclick = () => {
      week = new Date();
      week.setHours(0, 0, 0, 0);
      week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
      render();
    };
  }
  return { open, dispose: view.dispose };
}
