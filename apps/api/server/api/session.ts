import type { Role, Session } from "@voidmix/auth";

import type { ApiAuth } from "./auth/config.js";

const validRoles = new Set<Role>(["user", "admin", "owner"]);

export type SessionResolver = (request: Request) => Promise<Session | null>;

/**
 * Test-only authentication adapter. Production composes the Better Auth
 * resolver through createApiRuntime.
 */
export function createHeaderSessionResolver(): SessionResolver {
  return async (request) => {
    const id = request.headers.get("x-voidmix-user-id");
    if (!id) return null;

    const requestedRole = request.headers.get("x-voidmix-role") ?? "user";
    const role: Role = validRoles.has(requestedRole as Role) ? (requestedRole as Role) : "user";

    return {
      user: {
        id,
        email: request.headers.get("x-voidmix-email") ?? `${id}@example.invalid`,
        displayName: request.headers.get("x-voidmix-display-name") ?? id,
        role,
      },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
  };
}

type BetterAuthSession = Awaited<ReturnType<ApiAuth["api"]["getSession"]>>;

export function toVoidmixSession(value: BetterAuthSession): Session | null {
  if (!value) return null;
  const user = value.user as typeof value.user & { role?: unknown; status?: unknown };
  if (!validRoles.has(user.role as Role) || user.status === "suspended") return null;

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.name,
      role: user.role as Role,
    },
    expiresAt: value.session.expiresAt,
  };
}

export function createBetterAuthSessionResolver(auth: ApiAuth): SessionResolver {
  return async (request) =>
    toVoidmixSession(
      await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } }),
    );
}
