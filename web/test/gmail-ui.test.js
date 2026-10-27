import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mountGmail, previewHtml } from "../src/original/gmail/ui.js";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("Gmail UI: revisar todos los campos, confirmar y bloquear doble clic; mensajes escapados", async () => {
  const win = new Window();
  const originals = {};
  for (const name of ["window", "document", "FormData"]) {
    originals[name] = globalThis[name];
    globalThis[name] = win[name] || win.document;
  }
  let sends = 0,
    state = "prepared";
  const preview = {
    from: "ana@example.com",
    to: ["cliente@example.com"],
    cc: ["cc@example.com"],
    subject: "Re: Carga 123",
    body: "<script>alert(1)</script>",
  };
  const item = () => ({
    id: "simulado",
    state,
    preview,
    created_at: "2026-10-27T18:00:00Z",
  });
  const api = {
    methods: {
      gmailCarga: async (action, args) => {
        if (action === "status")
          return { email: preview.from, thread: null, items: [item()] };
        if (action === "send") {
          assert.equal(args.confirm, true);
          sends++;
          await tick();
          state = "sent";
          return { item: item() };
        }
        throw Error("Acción no simulada: " + action);
      },
    },
  };
  try {
    const target = win.document.createElement("section");
    win.document.body.append(target);
    await mountGmail(api).render("123", target);
    target.querySelector("[data-gmail-review]").click();
    const dialog = win.document.querySelector("dialog"),
      form = dialog.querySelector("form");
    for (const text of [
      preview.from,
      ...preview.to,
      ...preview.cc,
      preview.body,
    ])
      assert.ok(dialog.textContent.includes(text));
    assert.equal(dialog.querySelectorAll("script").length, 0);
    assert.match(previewHtml(preview), /&lt;script&gt;/);
    const submit = () =>
      form.dispatchEvent(
        new win.Event("submit", { cancelable: true, bubbles: true }),
      );
    submit();
    await tick();
    assert.equal(sends, 0);
    form.querySelector('[name="confirm"]').checked = true;
    submit();
    submit();
    await tick();
    await tick();
    assert.equal(sends, 1);
    assert.match(target.textContent, /Envío confirmado por Gmail/);
    target.querySelector("[data-gmail-review]").click();
    assert.equal(
      win.document.querySelector('dialog button[type="submit"]'),
      null,
    );
  } finally {
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
    await win.happyDOM.close();
  }
});
