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
