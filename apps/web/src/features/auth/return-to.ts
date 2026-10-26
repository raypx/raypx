const destinations = new Set(["/", "/tasks", "/approvals", "/settings", "/admin/settings"]);

/** Only application pages may be resumed after authentication. Never execute an intent here. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return "/";
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 32 || code === 92 || code === 127) return "/";
  }
  try {
    const url = new URL(value, "https://return.invalid");
    return url.origin === "https://return.invalid" && destinations.has(url.pathname)
      ? url.pathname + url.search + url.hash
      : "/";
  } catch {
    return "/";
  }
}
