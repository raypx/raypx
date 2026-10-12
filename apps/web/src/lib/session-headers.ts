/** Forward only Better Auth cookies to the configured API, never inbound host/auth headers. */
export function sessionHeaders(headers: Headers): Record<string, string> {
  const cookie = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^(?:__Secure-)?better-auth[.-][^=]+=/.test(part))
    .join("; ");
  return cookie ? { cookie } : {};
}
