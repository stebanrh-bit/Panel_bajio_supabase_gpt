import { escapeHtml as esc } from "../content.js";
import { field } from "../dialogs.js";
import { personalDialog } from "../personal/dialog.js";
const time = (value) =>
  value
    ? new Date(value).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
      })
    : "";
/** Los campos son indicados por el usuario; Gmail no verifica ni envía nada desde el panel. */
export function previewHtml(p) {
  return `<dl><dt>Remitente indicado</dt><dd>${esc(p.from)}</dd><dt>Para</dt><dd>${esc(p.to.join(", "))}</dd><dt>CC</dt><dd>${esc(p.cc.join(", ") || "Sin CC")}</dd><dt>Asunto</dt><dd>${esc(p.subject)}</dd></dl><h3>Mensaje</h3><pre class="gmail-message">${esc(p.body)}</pre>`;
}
export function mountGmail(api) {
  const call = (action, values) => api.methods.gmailCarga(action, values);
  async function render(load, target) {
    target.classList.add("gmail-load");
    target.textContent = "Consultando correo manual…";
    try {
      const data = await call("status", { load });
      if (!target.isConnected) return;
      target.innerHTML = `<h3>Gmail manual de esta carga</h3><p>Prepara aquí el mensaje, abre el hilo y envíalo tú desde Gmail. Después registra tu confirmación.</p><p class="personal-help">El panel no accede a tu cuenta de Google ni comprueba el envío. Revisa la cuenta, los destinatarios y el texto en Gmail antes de enviarlo. WhatsApp sigue manual.</p><p>${data.thread ? `<a href="${esc(data.thread.url)}" target="_blank" rel="noopener noreferrer">Abrir hilo guardado en Gmail</a>` : "Sin hilo guardado para tu cuenta."}</p><div class="gmail-actions"><button type="button" data-gmail-link>Guardar liga del hilo</button><button type="button" data-gmail-compose ${data.thread ? "" : "disabled"}>Preparar respuesta</button><button type="button" data-gmail-refresh>Actualizar</button></div><h4>Mis registros de Gmail manual</h4>${data.items.length ? data.items.map((item) => `<article class="gmail-record"><b>${item.state === "confirmed" ? "Envío confirmado manualmente por el usuario" : "Preparado · sin confirmar"}</b> · ${esc(time(item.created_at))}<button type="button" data-gmail-review="${esc(item.id)}">Ver respuesta</button></article>`).join("") : "<p>No hay confirmaciones manuales registradas.</p>"}<p data-gmail-feedback role="status"></p>`;
      target.querySelector("[data-gmail-refresh]").onclick = () =>
        render(load, target);
      target.querySelector("[data-gmail-link]").onclick = () =>
        personalDialog(
          "Guardar hilo de Gmail",
          field(
            "url",
            "Liga del hilo",
            "url",
            data.thread?.url || "",
            'required maxlength="2000"',
          ) +
            "<p>Abre la conversación en Gmail y copia la liga de la barra de direcciones. También se acepta la liga de su ventana emergente. La liga general de la bandeja no identifica un hilo.</p>",
          async (form) => {
            await call("link", { load, url: form.get("url") });
            await render(load, target);
          },
        );
      function review(item) {
        const ready = item.state === "prepared";
        const { dialog, error } = personalDialog(
          "Revisar correo manual",
          (ready
            ? previewHtml(item.preview)
            : `<pre class="gmail-message">${esc(item.record_text)}</pre>`) +
            "<p>El envío se hace en Gmail. El panel solo registra lo que confirmas haber enviado.</p>" +
            (ready
              ? '<div class="gmail-actions"><button type="button" data-gmail-copy>Copiar mensaje</button></div>' +
                `<p><a href="${esc(item.preview.threadUrl)}" target="_blank" rel="noopener noreferrer">Abrir este hilo en Gmail</a></p>` +
                '<p>Copia el mensaje y pulsa Responder en Gmail. Revisa allí remitente, Para, CC y asunto antes de enviar.</p><label class="personal-check"><input type="checkbox" name="confirm" required> Ya envié este correo desde Gmail y quiero registrar mi confirmación manual.</label>'
              : "<p>Confirmación manual registrada; no es una verificación de Google.</p>"),
          ready
            ? async (form) => {
                if (!form.get("confirm"))
                  throw Error(
                    "Confirma que ya enviaste el correo desde Gmail.",
                  );
                const result = await call("confirm", {
                  load,
                  id: item.id,
                  confirm: true,
                });
                if (result.item.state !== "confirmed")
                  throw Error("No se pudo registrar la confirmación.");
                await render(load, target);
              }
            : null,
          "Registrar confirmación manual",
        );
        dialog
          .querySelector("[data-gmail-copy]")
          ?.addEventListener("click", async (event) => {
            const button = event.target;
            button.disabled = true;
            try {
              await navigator.clipboard.writeText(item.preview.body);
              button.textContent = "Mensaje copiado";
            } catch {
              error.textContent =
                "No se pudo copiar automáticamente. Selecciona y copia el mensaje mostrado arriba.";
            } finally {
              button.disabled = false;
            }
          });
      }
      target.querySelector("[data-gmail-compose]").onclick = () =>
        personalDialog(
          "Preparar correo manual",
          field(
            "from",
            "Remitente que usarás en Gmail",
            "email",
            "",
            'required maxlength="254"',
          ) +
            field(
              "to",
              "Para (correos separados por coma)",
              "text",
              "",
              'required maxlength="2000"',
            ) +
            field("cc", "CC (opcional)", "text", "", 'maxlength="2000"') +
            field(
              "subject",
              "Asunto del hilo",
              "text",
              "Re: Carga " + load,
              'required maxlength="300"',
            ) +
            '<label>Mensaje<textarea name="body" required maxlength="7000" rows="8"></textarea></label><p>Preparar no envía el correo ni crea un borrador en Gmail. La preparación queda disponible mientras mantengas abierta esta sesión del panel.</p>',
          async (form) => {
            const result = await call("prepare", {
              load,
              ...Object.fromEntries(form),
            });
            await render(load, target);
            review(result.item);
          },
          "Revisar mensaje",
        );
      target
        .querySelectorAll("[data-gmail-review]")
        .forEach(
          (button) =>
            (button.onclick = () =>
              review(
                data.items.find(
                  (item) => item.id === button.dataset.gmailReview,
                ),
              )),
        );
    } catch (error) {
      if (target.isConnected) target.textContent = error.message;
    }
  }
  return { render };
}
