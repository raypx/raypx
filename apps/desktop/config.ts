/** Public connection settings shared by Native and the renderer. */
export interface DesktopConnection {
  apiUrl: string;
  webUrl: string;
}

export const CONNECTION_KEY = "__raypxConnection";
export const DEFAULT_CONNECTION: Readonly<DesktopConnection> = Object.freeze({
  apiUrl: "https://raypx.pro",
  webUrl: "https://raypx.pro",
});

function hasUnsafeCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 32 || code === 127 || character === "\\") return true;
  }
  return false;
}

export function parseServerOrigin(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    raw.length > 2048 ||
    !/^https?:\/\//i.test(raw) ||
    hasUnsafeCharacter(raw)
  )
    throw new Error("Server URL must be an HTTPS origin (HTTP is allowed on loopback only)");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Server URL must be an HTTPS origin (HTTP is allowed on loopback only)");
  }
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

export function parseConnection(value: unknown): DesktopConnection {
  if (!value || typeof value !== "object" || !("apiUrl" in value) || !("webUrl" in value))
    throw new Error("Native connection settings unavailable");
  return { apiUrl: parseServerOrigin(value.apiUrl), webUrl: parseServerOrigin(value.webUrl) };
}
