/** Gmail individual. Auth, alcance de cargas y reserva de envíos permanecen en Supabase.
 * Apps Script solo aloja la interfaz y nunca ejecuta GmailApp como su propietario.
 */
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { prepareReply, rawReply, deliver } from "./domain.js";
import { googleApi } from "./google.js";
import { digest, vault } from "./crypto.js";
const env = (name: string) => Deno.env.get(name) || "";
const url = env("SUPABASE_URL"),
  options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), options);
const google = googleApi();
const callback = url + "/functions/v1/panel-gmail/callback";
const scopes =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
function checked(result: any) {
  if (result.error)
    throw Error(
      "No se completó el registro en Supabase. Actualiza y revisa el estado.",
    );
  return result.data;
}
async function connection(user: string) {
  const row = checked(
    await service
      .from("gmail_connections")
      .select("*")
      .eq("user_id", user)
      .maybeSingle(),
  );
  if (!row) throw Error("Conecta tu cuenta de Gmail primero.");
  const store = await vault(env("GMAIL_TOKEN_KEY"));
  const token = await google.token({
    client_id: env("GMAIL_CLIENT_ID"),
    client_secret: env("GMAIL_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: await store.decrypt(row.refresh_encrypted),
  });
  const profile = await google.gmail(token.access_token, "profile");
  if (profile.emailAddress.toLowerCase() !== row.email.toLowerCase())
    throw Error("La cuenta de Gmail cambió. Vuelve a conectarla.");
  return { token: token.access_token, email: profile.emailAddress };
}
async function oauthCallback(request: Request) {
  const params = new URL(request.url).searchParams,
    state = params.get("state") || "";
  if (!state || state.length > 200)
    throw Error("Autorización inválida o vencida.");
  // DELETE ... RETURNING consume el estado una sola vez, incluso con callbacks simultáneos.
  const row = checked(
    await service
      .from("gmail_oauth_states")
      .delete()
      .eq("state_hash", await digest(state))
      .gt("expires_at", new Date().toISOString())
      .select("*")
      .maybeSingle(),
  );
  if (!row || !params.get("code") || params.has("error"))
    throw Error("Autorización cancelada o vencida. Vuelve al panel.");
  const profile = checked(
    await service
      .from("profiles")
      .select("role,active")
      .eq("id", row.user_id)
      .single(),
  );
  if (!profile.active || !["admin", "csr"].includes(profile.role))
    throw Error("Cuenta sin acceso al panel.");
  const store = await vault(env("GMAIL_TOKEN_KEY"));
  const token = await google.token({
    code: params.get("code")!,
    client_id: env("GMAIL_CLIENT_ID"),
    client_secret: env("GMAIL_CLIENT_SECRET"),
    redirect_uri: callback,
    grant_type: "authorization_code",
    code_verifier: await store.decrypt(row.verifier_encrypted),
  });
  if (
    !token.refresh_token ||
    !scopes.split(" ").every((s) => token.scope?.split(" ").includes(s))
  )
    throw Error(
      "Google debe autorizar lectura y envío. Vuelve a conectar Gmail.",
    );
  const account = await google.gmail(token.access_token, "profile");
  checked(
    await service.from("gmail_connections").upsert({
      user_id: row.user_id,
      email: account.emailAddress,
      refresh_encrypted: await store.encrypt(token.refresh_token),
      updated_at: new Date().toISOString(),
    }),
  );
  // Texto fijo: nunca incluir códigos, tokens, correos o parámetros de la solicitud en el HTML.
  return new Response(
    "Gmail conectado. Cierra esta ventana y pulsa Actualizar en el panel.",
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  try {
    if (
      request.method === "GET" &&
      new URL(request.url).pathname.endsWith("/callback")
    )
      return await oauthCallback(request);
    if (request.method !== "POST")
      return reply({ error: "Método no disponible." }, 405);
    const authorization = request.headers.get("Authorization") || "";
    if (!/^Bearer \S+$/i.test(authorization))
      return reply({ error: "Inicia sesión nuevamente." }, 401);
    const client = createClient(url, env("SUPABASE_ANON_KEY"), {
      ...options,
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user)
      return reply({ error: "Inicia sesión nuevamente." }, 401);
    const user = data.user.id;
    const profile = checked(
      await client
        .from("profiles")
        .select("active,role")
        .eq("id", user)
        .single(),
    );
    if (!profile.active || !["admin", "csr"].includes(profile.role))
      return reply({ error: "Sin acceso al panel." }, 403);
    const input = await request.json(),
      action = input.action;
    const rpc = async (name: string, args: object) =>
      checked(await client.rpc(name, args));
    if (action === "connect") {
      if (!env("GMAIL_CLIENT_ID") || !env("GMAIL_CLIENT_SECRET"))
        throw Error("Falta configurar OAuth de Gmail en Supabase.");
      const store = await vault(env("GMAIL_TOKEN_KEY"));
      const state = crypto.randomUUID() + crypto.randomUUID(),
        verifier = crypto.randomUUID() + crypto.randomUUID();
      checked(
        await service.from("gmail_oauth_states").delete().eq("user_id", user),
      );
      checked(
        await service.from("gmail_oauth_states").insert({
          state_hash: await digest(state),
          user_id: user,
          verifier_encrypted: await store.encrypt(verifier),
          expires_at: new Date(Date.now() + 600000).toISOString(),
        }),
      );
      const challenge = btoa(
        String.fromCharCode(
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(verifier),
            ),
          ),
        ),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const params = new URLSearchParams({
        client_id: env("GMAIL_CLIENT_ID"),
        redirect_uri: callback,
        response_type: "code",
        scope: scopes,
        access_type: "offline",
        prompt: "consent select_account",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      return reply({
        url: "https://accounts.google.com/o/oauth2/v2/auth?" + params,
      });
    }
    if (action === "disconnect") {
      // Invalida también callbacks todavía abiertos. El usuario puede revocar el consentimiento en Google.
      checked(
        await service.from("gmail_oauth_states").delete().eq("user_id", user),
      );
      checked(
        await service.from("gmail_connections").delete().eq("user_id", user),
      );
      return reply({ ok: true });
    }
    const context = await rpc("ops_gmail_context", { p_load: input.load });
    if (action === "status") {
      const connected = checked(
        await service
          .from("gmail_connections")
          .select("email")
          .eq("user_id", user)
          .maybeSingle(),
      );
      return reply({ ...context, email: connected?.email || null });
    }
    if (action === "link")
      return reply(
        await rpc("ops_gmail_link", { p_load: input.load, p_url: input.url }),
      );
    const account = await connection(user);
    if (action === "search") {
      // Búsqueda acotada; el usuario elige el hilo y confirma destinatarios antes de enviar.
      const query = '"' + String(input.load).replace(/["\\\r\n]/g, "") + '"';
      const result = await google.gmail(
        account.token,
        "threads?maxResults=10&q=" + encodeURIComponent(query),
      );
      const items = await Promise.all(
        (result.threads || []).map(async (t: any) => {
          const thread = await google.gmail(
            account.token,
            "threads/" +
              encodeURIComponent(t.id) +
              "?format=metadata&metadataHeaders=Subject&metadataHeaders=From",
          );
          const h = thread.messages?.at(-1)?.payload?.headers || [];
          return {
            id: t.id,
            subject:
              h.find((v: any) => v.name.toLowerCase() === "subject")?.value ||
              "Sin asunto",
            from:
              h.find((v: any) => v.name.toLowerCase() === "from")?.value || "",
          };
        }),
      );
      return reply({ items });
    }
    if (action === "prepare") {
      if (!context.thread || !/^[a-f0-9]+$/i.test(context.thread.thread_id))
        throw Error("Busca y selecciona el hilo de Gmail para esta carga.");
      const thread = await google.gmail(
        account.token,
        "threads/" +
          encodeURIComponent(context.thread.thread_id) +
          "?format=metadata",
      );
      const preview = prepareReply({
        thread,
        from: account.email,
        to: input.to,
        cc: input.cc,
        body: input.body,
      });
      // Excluir References/In-Reply-To: responder al último mensaje no habilita repetir el mismo texto.
      const fingerprint = await digest(
        JSON.stringify({
          from: preview.from,
          to: [...preview.to].sort(),
          cc: [...preview.cc].sort(),
          body: preview.body,
          subject: preview.subject,
          threadId: preview.threadId,
        }),
      );
      // Upsert no modifica una reserva existente: la misma respuesta conserva su estado incluso al recargar.
      checked(
        await service
          .from("load_gmail_outbox")
          .upsert(
            { user_id: user, load: input.load, preview, fingerprint },
            { onConflict: "user_id,load,fingerprint", ignoreDuplicates: true },
          ),
      );
      const item = checked(
        await service
          .from("load_gmail_outbox")
          .select("*")
          .eq("user_id", user)
          .eq("load", input.load)
          .eq("fingerprint", fingerprint)
          .single(),
      );
      if (
        item.state === "prepared" &&
        new Date(item.expires_at).getTime() < Date.now()
      ) {
        const renewed = checked(
          await service
            .from("load_gmail_outbox")
            .update({
              expires_at: new Date(Date.now() + 1800000).toISOString(),
            })
            .eq("id", item.id)
            .eq("state", "prepared")
            .select("*")
            .maybeSingle(),
        );
        if (renewed) return reply({ item: renewed });
      }
      return reply({ item });
    }
    if (!["send", "verify"].includes(action))
      throw Error("Acción de Gmail no disponible.");
    const item = checked(
      await service
        .from("load_gmail_outbox")
        .select("*")
        .eq("id", input.id)
        .eq("user_id", user)
        .eq("load", input.load)
        .single(),
    );
    if (item.preview.from.toLowerCase() !== account.email.toLowerCase())
      throw Error("La cuenta conectada cambió. Prepara otra respuesta.");
    const complete = async (outbox: any, receipt: any) =>
      checked(
        await service
          .from("load_gmail_outbox")
          .update({
            state: "sent",
            message_id: receipt.id,
            gmail_thread_id: receipt.threadId,
            sent_at: new Date().toISOString(),
          })
          .eq("id", outbox.id)
          .eq("user_id", user)
          .in("state", ["sending", "uncertain"])
          .select("*")
          .single(),
      );
    if (action === "verify") {
      if (item.state === "sent" || item.state === "prepared")
        return reply({ item });
      const matches = await google.gmail(
        account.token,
        "messages?maxResults=2&q=" +
          encodeURIComponent(
            "in:sent rfc822msgid:panel-" + item.id + "@panel-bajio.invalid",
          ),
      );
      if (matches.messages?.length === 1) {
        const receipt = await google.gmail(
          account.token,
          "messages/" + matches.messages[0].id + "?format=metadata",
        );
        if (
          receipt.labelIds?.includes("SENT") &&
          receipt.threadId === item.preview.threadId
        )
          return reply({ item: await complete(item, receipt) });
      }
      return reply({
        item,
        notice:
          "Google todavía no confirma el envío. Se mantiene bloqueado para evitar duplicados.",
      });
    }
    if (input.confirm !== true)
      throw Error("Confirma la vista previa antes de enviar.");
    const result = await deliver({
      claim: () => rpc("ops_gmail_claim", { p_id: item.id }),
      send: (row: any) =>
        google.gmail(account.token, "messages/send", {
          threadId: row.preview.threadId,
          raw: rawReply(row.preview, row.id),
        }),
      complete,
      uncertain: async (row: any) => {
        checked(
          await service
            .from("load_gmail_outbox")
            .update({ state: "uncertain" })
            .eq("id", row.id)
            .eq("state", "sending"),
        );
      },
    });
    return reply({ item: result });
  } catch (error) {
    // No registrar cuerpos, códigos OAuth, tokens ni respuestas completas de Google.
    return reply(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se completó la operación de Gmail.",
      },
      400,
    );
  }
});
