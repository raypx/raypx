/**
 * Auth Guards - Role-based access control
 *
 * NOTE: Due to Better Auth using cookies that are only accessible client-side,
 * auth checks are performed in the component render cycle, not in beforeLoad.
 * This is a known limitation of the current setup.
 *
 * Auth redirects are handled using window.location.href to ensure proper
 * navigation with i18n URLs.
 */

/**
 * User roles enum
 */
export const UserRole = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "superadmin",
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

/**
 * Helper to check if user has role
 */
export function hasRole(userRole: string | null | undefined, role: UserRoleType): boolean {
  return userRole === role;
}

/**
 * Helper to check if user is admin
 */
export function isAdmin(userRole: string | null | undefined): boolean {
  return userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
}
