type Destination = { pathname: string; params: Record<string, string> };
let destination: { route: Destination; accountId: string | undefined } | undefined;

/** Only native app routes and bounded resource selectors survive a session expiry. */
export function safeDestination(
  pathname: string,
  params: Record<string, unknown>,
): Destination | null {
  if (pathname === "/account") return { pathname, params: {} };
  if (!/^\/conversation\/[^/?#]+$/.test(pathname) && pathname !== "/agent" && pathname !== "/space")
    return null;
  if (pathname.startsWith("/conversation/")) {
    try {
      const id = decodeURIComponent(pathname.slice("/conversation/".length));
      if (!id || id.length > 128 || /[/?#]/.test(id)) return null;
    } catch {
      return null;
    }
  }
  const selected: Record<string, string> = {};
  for (const key of ["spaceId", "agentId"]) {
    const value = params[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 128) selected[key] = value;
  }
  if (pathname !== "/space" && !selected.spaceId) return null;
  return { pathname, params: selected };
}
export function rememberDestination(
  pathname: string,
  params: Record<string, unknown>,
  accountId?: string,
) {
  if (accountId && pathname === "/") {
    destination = undefined;
    return;
  }
  if (!accountId && destination) return;
  const route = safeDestination(pathname, params);
  if (route) destination = { route, accountId };
}
export function takeDestination(accountId: string): Destination | null {
  const next = destination;
  destination = undefined;
  if (!next || (next.accountId && next.accountId !== accountId)) return null;
  return next.route;
}
export function clearDestination() {
  destination = undefined;
}
