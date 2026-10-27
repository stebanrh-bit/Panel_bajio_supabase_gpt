/** El JWT de Supabase viaja en el SDK; los tokens de Google nunca llegan al navegador. */
export function gmailMethods(ctx) {
  return {
    async gmailCarga(action, values = {}) {
      ctx.staff(true);
      const { data, error } = await ctx.safe(
        ctx.client.functions.invoke("panel-gmail", {
          body: { ...values, action },
        }),
      );
      if (error) {
        let message =
          "No se pudo acceder a Gmail. Revisa la instalación de SQL 021 y panel-gmail.";
        try {
          message = (await error.context.json()).error || message;
        } catch {}
        throw Error(message);
      }
      if (data?.error) throw Error(data.error);
      return data;
    },
  };
}
