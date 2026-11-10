export type SocialProvider = "google" | "github";

/** Public account fields only. These types never infer server/database internals. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  /** Better Auth Admin plugin roles, not a browser-assigned authorization claim. */
  role?: string;
  banned?: boolean;
  image?: string | null;
}
export interface AuthSession {
  user: AuthUser;
  session: { id: string; userId: string; expiresAt: Date; createdAt?: Date };
}

/** Normalize explicit trusted origins; malformed/opaque entries never grant access. */
export function normalizeTrustedOrigins(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.flatMap((value) => {
        try {
          const url = new URL(value.trim());
          if (url.username || url.password || url.hostname.includes("*")) return [];
          if (url.protocol === "views:" && url.hostname === "main") return ["views://main"];
          return ["http:", "https:"].includes(url.protocol) && url.origin !== "null"
            ? [url.origin]
            : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

/**
 * The in-app destination to resume after authentication, or `/` when `value` is not
 * one of the application's own pages. Only the pathname is matched; search and hash
 * are kept. Never execute an intent carried by the result.
 */
export function resumablePath(value: unknown, pages: ReadonlySet<string>): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return "/";
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    // Control characters, spaces and backslashes are how browsers get talked off-origin.
    if (code <= 32 || code === 92 || code === 127) return "/";
  }
  try {
    const url = new URL(value, "https://return.invalid");
    if (url.origin !== "https://return.invalid" || !pages.has(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
