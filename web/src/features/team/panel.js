import { escapeHtml as escape } from "../../ui/html.js";
import {
  createPanelController,
  personOptions,
  personName,
  roleLabels,
  formatDate,
} from "../../ui/panel.js";

/** Administración de cuentas existentes, clientes y acceso al portal. */
export function createTeamPanel({
  container,
  service,
  loads,
  userId,
  role,
  onError,
}) {
  const view = createPanelController(container, onError);
  let people = [],
    assignments = [],
    access = [];
  const admin = role === "admin";
  function open() {
    return view.load(
      () =>
        Promise.all([
          service.people(),
          service.assignments(),
          admin ? service.portalAccess() : [],
          admin ? service.events() : [],
        ]),
      (data) => {
        [people, assignments, access] = data;
        render(data[3]);
      },
    );
  }
  function render(events) {
    container.innerHTML = `
      <section class="card"><div class="toolbar"><h2>Equipo y clientes</h2><button id="team-refresh">Actualizar</button></div>
        <h3>Personas</h3><div class="scroll"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Acceso</th><th></th></tr></thead><tbody>
          ${people
            .map(
              (
                person,
              ) => `<tr><td>${escape(personName(people, person.id))}</td><td>${roleLabels[person.role]}</td>
            <td>${person.active ? "Activo" : "Desactivado"}</td><td>${admin ? `<button data-edit-person="${escape(person.id)}">Editar cuenta</button>` : ""}</td></tr>`,
            )
            .join("")}
        </tbody></table></div>
        ${admin ? "<p>Las cuentas nuevas se crean en Authentication → Users del proyecto Supabase. Aquí asignas su nombre, rol y acceso.</p>" : ""}
        <h3>Clientes asignados</h3><ul>${
          assignments
            .map(
              (
                item,
              ) => `<li>${escape(item.customer)} → ${escape(personName(people, item.owner_id))}
          ${admin ? `<button data-edit-assignment="${escape(item.customer_key)}">Reasignar</button><button data-remove-assignment="${escape(item.customer_key)}">Quitar asignación</button>` : ""}</li>`,
            )
            .join("") || "<li>Sin asignaciones.</li>"
        }</ul>
        ${admin ? '<button id="assignment-new">Asignar cliente</button>' : ""}
        ${admin ? `<h3>Acceso al portal de clientes</h3><ul>${access.map((item) => `<li>${escape(personName(people, item.user_id))} · ${escape(item.customer)} · ${item.active ? "Activo" : "Desactivado"}</li>`).join("") || "<li>Sin accesos configurados.</li>"}</ul><button id="portal-configure">Configurar acceso</button>` : ""}
      </section><section id="team-detail"></section>
      ${
        admin
          ? `<section class="card"><h2>Actividad administrativa</h2><ul>${
              events
                .map(
                  (
                    item,
                  ) => `<li>${escape({ profile_saved: "Cuenta actualizada", customer_assigned: "Asignación de cliente actualizada", portal_access_saved: "Acceso al portal actualizado" }[item.action] || item.action)}
        <small class="block">${escape(formatDate(item.created_at))} · ${escape(personName(people, item.actor))}</small></li>`,
                )
                .join("") || "<li>Sin actividad.</li>"
            }</ul></section>`
          : ""
      }
    `;
    container.querySelector("#team-refresh").onclick = open;
    container
      .querySelectorAll("[data-edit-person]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            editPerson(
              people.find((person) => person.id === button.dataset.editPerson),
            )),
      );
    container
      .querySelectorAll("[data-edit-assignment]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            editAssignment(
              assignments.find(
                (item) => item.customer_key === button.dataset.editAssignment,
              ),
            )),
      );
    container.querySelectorAll("[data-remove-assignment]").forEach(
      (button) =>
        (button.onclick = () =>
          view.run(button, async () => {
            const record = assignments.find(
              (item) => item.customer_key === button.dataset.removeAssignment,
            );
            await service.assign(record.customer, null, record);
            await open();
          })),
    );
    container
      .querySelector("#assignment-new")
      ?.addEventListener("click", () => editAssignment());
    container
      .querySelector("#portal-configure")
      ?.addEventListener("click", editPortal);
  }
  function form(html, save) {
    view.invalidate();
    const section = container.querySelector("#team-detail");
    section.innerHTML = `<div class="card"><form>${html}<button>Guardar</button></form></div>`;
    section.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      view.run(event.target.querySelector("button"), async () => {
        await save(values);
        await open();
      });
    };
    section.scrollIntoView({ behavior: "smooth" });
  }
  function editPerson(person) {
    form(
      `<h2>Editar cuenta</h2><label>Nombre<input name="display_name" required maxlength="200" value="${escape(person.display_name)}"></label>
      <label>Correo de contacto<input name="contact_email" type="email" maxlength="320" value="${escape(person.contact_email)}"></label>
      <p>El correo de contacto no cambia el correo con el que inicia sesión.</p>
      <label>Rol<select name="role">${Object.entries(roleLabels)
        .map(
          ([key, label]) =>
            `<option value="${key}" ${key === person.role ? "selected" : ""}>${label}</option>`,
        )
        .join("")}</select></label>
      <label>Acceso<select name="active"><option value="true">Activo</option><option value="false" ${!person.active ? "selected" : ""}>Desactivado</option></select></label>
      ${person.id === userId ? "<p>Tu cuenta debe conservar el rol de administración y acceso activo.</p>" : ""}`,
      (values) =>
        service.saveProfile(person, {
          ...values,
          active: values.active === "true",
        }),
    );
  }
  function editAssignment(previous = null) {
    const customers = [
      ...new Set(loads.map((load) => load.customer).filter(Boolean)),
    ];
    form(
      `<h2>Asignar cliente a operador</h2><label>Cliente<input name="customer" required maxlength="500" list="team-customers" value="${escape(previous?.customer)}" ${previous ? "readonly" : ""}></label>
      <datalist id="team-customers">${customers.map((customer) => `<option value="${escape(customer)}"></option>`).join("")}</datalist>
      <label>Operador<select name="owner" required>${personOptions(people, previous?.owner_id)}</select></label>`,
      (values) =>
        service.assign(values.customer.trim(), values.owner, previous),
    );
  }
  function editPortal() {
    form(
      `<h2>Acceso al portal</h2><label>Cuenta de cliente<select name="user" required>${personOptions(
        people.filter((person) => person.role === "client"),
        "",
        "Selecciona la cuenta…",
        false,
      )}</select></label>
      <label>Nombre exacto del cliente<input name="customer" required maxlength="500"></label>
      <label>Acceso<select name="active"><option value="true">Activo</option><option value="false">Desactivado</option></select></label>`,
      (values) =>
        service.setPortal(
          values.user,
          values.customer.trim(),
          values.active === "true",
        ),
    );
  }
  return { open, dispose: view.dispose };
}
