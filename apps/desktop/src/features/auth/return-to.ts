const paths = new Set([
  "/",
  "/tasks",
  "/approvals",
  "/account",
  "/settings",
  "/automations",
  "/terminal",
  "/welcome",
]);

export function desktopReturnTo(input: unknown): string {
  if (typeof input !== "string" || !input.startsWith("/") || input.length > 2048) return "/";
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    if (code <= 32 || code === 92 || code === 127) return "/";
  }
  try {
    const url = new URL(input, "https://desktop.invalid");
    return url.origin === "https://desktop.invalid" && paths.has(url.pathname)
      ? url.pathname + url.search + url.hash
      : "/";
  } catch {
    return "/";
  }
}
