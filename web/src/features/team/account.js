import { escapeHtml as escape } from "../../ui/html.js";
import {
  createPanelController,
  personOptions,
  roleLabels,
} from "../../ui/panel.js";

/** Preferencias propias y cambio de contraseña mediante Supabase Auth, sin guardarla en tablas. */
export function createAccountPanel({
  container,
  service,
  people,
  userId,
  role,
  client,
  onError,
}) {
  const view = createPanelController(container, onError);
  function open() {
    return view.load(service.following, (followed) => {
      const me = people.find((person) => person.id === userId);
      container.innerHTML = `<section class="card"><h2>Mi cuenta</h2><p>${escape(me?.display_name || "Mi cuenta")} · ${roleLabels[role]}</p>
        ${
          ["admin", "csr"].includes(role)
            ? `<h3>Operadores a quienes doy seguimiento</h3><form id="following-form">
          <label>Selecciona las personas<select name="users" multiple>${personOptions(
            people.filter((person) => person.id !== userId),
            "",
            "Sin selección",
          )}</select></label>
          <button>Guardar seguimiento</button></form>`
            : ""
        }
        <h3>Cambiar mi contraseña</h3><form id="password-form">
          <label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="12" required></label>
          <label>Repetir contraseña<input name="confirmation" type="password" autocomplete="new-password" minlength="12" required></label>
          <button>Guardar contraseña</button></form><p id="account-result" role="status"></p>
      </section>`;
      const followForm = container.querySelector("#following-form");
      if (followForm) {
        const selected = new Set(
          followed
            .filter((item) => item.user_id === userId)
            .map((item) => item.followed_user),
        );
        [...followForm.elements.users.options].forEach((option) => {
          option.selected = selected.has(option.value);
        });
        followForm.onsubmit = (event) => {
          event.preventDefault();
          const users = [...event.target.elements.users.selectedOptions]
            .map((option) => option.value)
            .filter(Boolean);
          view.run(event.target.querySelector("button"), async () => {
            await service.setFollowing(users);
            if (view.mounted)
              container.querySelector("#account-result").textContent =
                "Seguimiento guardado.";
          });
        };
      }
      container.querySelector("#password-form").onsubmit = (event) => {
        event.preventDefault();
        view.run(event.target.querySelector("button"), async () => {
          const values = Object.fromEntries(new FormData(event.target));
          if (values.password !== values.confirmation)
            throw new Error("Las contraseñas deben coincidir.");
          if (values.password.length < 12)
            throw new Error("Usa una contraseña de al menos 12 caracteres.");
          const { error } = await client.auth.updateUser({
            password: values.password,
          });
          if (error) throw error;
          if (view.mounted) {
            container.querySelector("#password-form").reset();
            container.querySelector("#account-result").textContent =
              "Contraseña actualizada.";
          }
        });
      };
    });
  }
  return { open, dispose: view.dispose };
}
