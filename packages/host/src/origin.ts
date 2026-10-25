/** Connection origins never contain credentials, paths or non-loopback HTTP. */
export function serverOrigin(raw: unknown): string {
  let unsafe = false;
  if (typeof raw === "string")
    for (const character of raw)
      if (character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === "\\") {
        unsafe = true;
        break;
      }
  if (typeof raw !== "string" || raw.length > 2048 || !/^https?:\/\//i.test(raw) || unsafe)
    throw new Error("Server URL must be an HTTPS origin (HTTP is allowed on loopback only)");
  const url = new URL(raw);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Server URL must be an HTTPS origin without credentials, path, query or fragment",
    );
  return url.origin;
}
