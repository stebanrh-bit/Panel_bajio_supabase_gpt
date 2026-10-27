/** Transporte inyectable: las pruebas sustituyen fetch y nunca llegan a Gmail. */
export function googleApi(fetcher = fetch) {
  async function request(url, options = {}) {
    const response = await fetcher(url, {
      ...options,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw Error(
        "Google no aceptó la operación. Revisa la conexión de Gmail.",
      );
    return response.json();
  }
  return {
    token: (values) =>
      request("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams(values),
      }),
    gmail: (token, path, body) =>
      request("https://gmail.googleapis.com/gmail/v1/users/me/" + path, {
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
      }),
  };
}
