type Environment = Record<string, string | undefined>;

export function validateWebEnvironment(environment: Environment) {
  if (environment.VITE_API_URL !== undefined)
    throw new Error(
      "VITE_API_URL is no longer supported; delete it and configure API_PUBLIC_URL on the Web server only for a separate API origin (shared origin needs no API address)",
    );
  for (const key of ["API_PUBLIC_URL", "PUBLIC_URL"] as const) {
    const value = environment[key];
    if (!value) continue;
    try {
      if (!/^https?:\/\/[^/?#\\\s]+$/i.test(value) || /[*@]/.test(value)) throw new Error();
      const url = new URL(value);
      if (
        environment.NODE_ENV === "production" &&
        url.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
        throw new Error();
    } catch {
      throw new Error(
        `${key} must be an exact ${environment.NODE_ENV === "production" ? "HTTPS" : "HTTP(S)"} origin without a trailing slash, path, query, fragment, credentials or wildcard`,
      );
    }
  }
}

/** Public addresses are request data, never Vite definitions or module-global SSR state. */
export function resolveWebOrigins(requestOrigin: string, environment: Environment) {
  validateWebEnvironment(environment);
  const webOrigin = new URL(requestOrigin).origin;
  let apiBaseUrl = environment.API_PUBLIC_URL || "";
  if (!apiBaseUrl && environment.NODE_ENV !== "production") {
    const api = new URL(webOrigin);
    api.port = "3002";
    apiBaseUrl = api.origin;
  }
  if (apiBaseUrl) apiBaseUrl = new URL(apiBaseUrl).origin;
  if (apiBaseUrl === webOrigin) apiBaseUrl = "";
  return { webOrigin, apiOrigin: apiBaseUrl || webOrigin, apiBaseUrl };
}
