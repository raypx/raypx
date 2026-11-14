import type { AuthSession } from "@raypx/core/auth";
export function testSession(userId = "user-a"): AuthSession {
  return {
    user: {
      id: userId,
      email: `${userId}@example.com`,
      name: userId,
      emailVerified: true,
      role: "member",
    },
    session: {
      id: `session-${userId}`,
      userId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  };
}
