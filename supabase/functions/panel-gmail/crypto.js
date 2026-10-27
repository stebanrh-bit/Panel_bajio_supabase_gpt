/** Cifrado autenticado: la clave vive en secretos de Edge, nunca en SQL ni HTML. */
const bytes = (text) => new TextEncoder().encode(text);
const encode = (data) => btoa(String.fromCharCode(...data));
const decode = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export async function digest(text) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(text)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function vault(secret) {
  const raw = decode(secret);
  if (raw.length !== 32) throw Error("Configura la clave de cifrado de Gmail.");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return {
    async encrypt(text) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        bytes(text),
      );
      return encode(iv) + "." + encode(new Uint8Array(cipher));
    },
    async decrypt(text) {
      const [iv, cipher] = text.split(".");
      return new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: decode(iv) },
          key,
          decode(cipher),
        ),
      );
    },
  };
}
