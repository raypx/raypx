/** Use a single origin for authentication, account APIs and Web account links. */
export function serverOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS origin");
  }
  return url.origin;
}

/** SecureStore keys only support alphanumeric characters, dots, hyphens and underscores. */
export function sessionStoragePrefix(origin: string): string {
  return `raypx-mobile.${Array.from(origin, (char) => char.charCodeAt(0).toString(16)).join("")}`;
}
