import { escapeHtml as esc } from "../content.js";
import { field } from "../dialogs.js";
import { personalDialog } from "../personal/dialog.js";
const stateLabels = {
  prepared: "Preparado",
  sending: "Pendiente de verificar",
  uncertain: "Pendiente de verificar",
  sent: "Envío confirmado por Gmail",
};
const time = (value) =>
  value
    ? new Date(value).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
      })
    : "";
/** Vista previa inmutable: editar el mensaje siempre requiere preparar y revisar otra respuesta. */
export function previewHtml(p) {
  return `<dl><dt>Remitente</dt><dd>${esc(p.from)}</dd><dt>Para</dt><dd>${esc(p.to.join(", "))}</dd><dt>CC</dt><dd>${esc(p.cc.join(", ") || "Sin CC")}</dd><dt>Asunto</dt><dd>${esc(p.subject)}</dd></dl><h3>Mensaje</h3><pre class="gmail-message">${esc(p.body)}</pre>`;
}
export function mountGmail(api) {
  const call = (action, values) => api.methods.gmailCarga(action, values);
  async function render(load, target) {
    target.classList.add("gmail-load");
    target.textContent = "Consultando Gmail…";
    try {
      const data = await call("status", { load });
      if (!target.isConnected) return;
      target.innerHTML = `<h3>Gmail de esta carga</h3><p>${data.email ? "Cuenta conectada: <b>" + esc(data.email) + "</b>" : "Conecta el Gmail desde el que deseas responder."}</p><p class="personal-help">Cada usuario conecta su propia cuenta. Preparar una respuesta no envía el correo. WhatsApp conserva su envío manual.</p><div class="gmail-actions"><button type="button" data-gmail-connect>${data.email ? "Cambiar cuenta" : "Conectar mi Gmail"}</button><button type="button" data-gmail-refresh>Actualizar</button>${data.email ? '<button type="button" data-gmail-disconnect>Desconectar</button>' : ""}</div><p>${data.thread ? `<a href="${esc(data.thread.url)}" target="_blank" rel="noopener noreferrer">Abrir hilo guardado en Gmail</a>` : "Sin hilo guardado para tu cuenta."}</p><div class="gmail-actions"><button type="button" data-gmail-link>Guardar liga del hilo</button>${data.email ? '<button type="button" data-gmail-search>Buscar hilo por carga</button><button type="button" data-gmail-compose>Preparar respuesta</button>' : ""}</div><h4>Respuestas de mi cuenta</h4>${data.items.length ? data.items.map((item) => `<article class="gmail-record"><b>${esc(stateLabels[item.state])}</b> · ${esc(time(item.sent_at || item.created_at))}<p>${esc(item.preview.subject)} · Para: ${esc(item.preview.to.join(", "))}</p><button type="button" data-gmail-review="${esc(item.id)}">Ver respuesta</button>${["sending", "uncertain"].includes(item.state) ? `<button type="button" data-gmail-verify="${esc(item.id)}">Verificar envío</button>` : ""}</article>`).join("") : "<p>No hay respuestas registradas.</p>"}<p data-gmail-feedback role="status"></p>`;
      const feedback = target.querySelector("[data-gmail-feedback]");
      const run = async (button, task) => {
        button.disabled = true;
        try {
          await task();
        } catch (error) {
          if (target.isConnected) feedback.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      };
      target.querySelector("[data-gmail-refresh]").onclick = () =>
        render(load, target);
      target.querySelector("[data-gmail-connect]").onclick = (event) => {
        // Abrir durante el gesto evita bloqueos de ventanas; ningún token se pone en la URL.
        const popup = window.open("about:blank", "_blank");
        if (popup) popup.opener = null;
        run(event.target, async () => {
          try {
            const result = await call("connect", {});
            if (popup) popup.location = result.url;
            else {
              const link = document.createElement("a");
              link.href = result.url;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = "Abrir autorización de Google";
              feedback.replaceChildren(link);
            }
          } catch (error) {
            popup?.close();
            throw error;
          }
        });
      };
      target
        .querySelector("[data-gmail-disconnect]")
        ?.addEventListener("click", (event) =>
          run(event.target, async () => {
            await call("disconnect", {});
            await render(load, target);
          }),
        );
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
            "<p>Abre el hilo en tu Gmail y copia la liga completa. Si Gmail usa una liga abreviada, selecciona después el hilo con Buscar hilo por carga.</p>",
          async (form) => {
            await call("link", { load, url: form.get("url") });
            await render(load, target);
          },
        );
      target
        .querySelector("[data-gmail-search]")
        ?.addEventListener("click", (event) =>
          run(event.target, async () => {
            const result = await call("search", { load });
            const { dialog } = personalDialog(
              "Seleccionar hilo de Gmail",
              result.items.length
                ? result.items
                    .map(
                      (item, i) =>
                        `<article class="gmail-record"><b>${esc(item.subject)}</b><p>${esc(item.from)}</p><button type="button" data-thread="${i}">Usar este hilo</button></article>`,
                    )
                    .join("")
                : "<p>No se encontraron hilos con el número de esta carga.</p>",
              null,
            );
            dialog.querySelectorAll("[data-thread]").forEach(
              (button) =>
                (button.onclick = () =>
                  run(button, async () => {
                    await call("link", {
                      load,
                      url:
                        "https://mail.google.com/mail/u/0/#all/" +
                        result.items[Number(button.dataset.thread)].id,
                    });
                    dialog.querySelector("[data-personal-close]").click();
                    await render(load, target);
                  })),
            );
          }),
        );
      function review(item) {
        const ready = item.state === "prepared";
        personalDialog(
          "Revisar respuesta antes de enviar",
          previewHtml(item.preview) +
            `<p>${esc(stateLabels[item.state])}</p>` +
            (ready
              ? '<label class="personal-check"><input type="checkbox" name="confirm" required> Confirmo remitente, destinatarios, CC y mensaje. Enviar esta respuesta.</label>'
              : ""),
          ready
            ? async (form) => {
                if (!form.get("confirm"))
                  throw Error("Confirma la revisión del correo.");
                try {
                  const result = await call("send", {
                    load,
                    id: item.id,
                    confirm: true,
                  });
                  if (result.item.state !== "sent")
                    throw Error(
                      "Respuesta bloqueada. Verifica el envío desde el historial.",
                    );
                } finally {
                  await render(load, target);
                }
              }
            : null,
          "Confirmar y enviar",
        );
      }
      target
        .querySelector("[data-gmail-compose]")
        ?.addEventListener("click", () =>
          personalDialog(
            "Preparar respuesta de Gmail",
            field(
              "to",
              "Para (correos separados por coma)",
              "text",
              "",
              'required maxlength="2000"',
            ) +
              field("cc", "CC (opcional)", "text", "", 'maxlength="2000"') +
              '<label>Mensaje<textarea name="body" required maxlength="20000" rows="8"></textarea></label><p>El asunto y la referencia se toman del último mensaje del hilo. Podrás revisar todo antes de enviar.</p>',
            async (form) => {
              const result = await call("prepare", {
                load,
                to: form.get("to"),
                cc: form.get("cc"),
                body: form.get("body"),
              });
              await render(load, target);
              review(result.item);
            },
            "Preparar y revisar",
          ),
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
      target.querySelectorAll("[data-gmail-verify]").forEach(
        (button) =>
          (button.onclick = () =>
            run(button, async () => {
              const result = await call("verify", {
                load,
                id: button.dataset.gmailVerify,
              });
              await render(load, target);
              if (result.notice && target.isConnected)
                target.querySelector("[data-gmail-feedback]").textContent =
                  result.notice;
            })),
      );
    } catch (error) {
      if (target.isConnected) target.textContent = error.message;
    }
  }
  return { render };
}
