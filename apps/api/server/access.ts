import { accessForAssignedRoles, accessForRole, type AccountAccess } from "@raypx/account/access";
import type { AuthSession } from "@raypx/auth/types";

export type AccessPolicy = (auth: AuthSession | null) => AccountAccess;

/** Never accept a role, email or permission supplied in an RPC input. */
export function createAccessPolicy(): AccessPolicy {
  return (auth) => {
    if (
      !auth?.user.emailVerified ||
      auth.user.banned ||
      auth.session.userId !== auth.user.id ||
      !(auth.session.expiresAt.getTime() > Date.now())
    )
      return accessForRole("guest", null);
    return accessForAssignedRoles(auth.user.role, auth.user.id);
  };
}
