export const roles = ["user", "admin", "owner"] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "admin.users.read",
  "admin.users.write",
  "admin.audit.read",
  "admin.runs.read",
  "admin.usage.read",
] as const;
export type Permission = (typeof permissions)[number];

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface Session {
  user: SessionUser;
  expiresAt: Date;
}

const adminPermissions = [
  "admin.users.read",
  "admin.users.write",
  "admin.audit.read",
  "admin.runs.read",
  "admin.usage.read",
] as const satisfies readonly Permission[];

const grants: Record<Role, ReadonlySet<Permission>> = {
  user: new Set(),
  admin: new Set(adminPermissions),
  owner: new Set(adminPermissions),
};

export function hasPermission(session: Session | null, permission: Permission): boolean {
  return session !== null && grants[session.user.role].has(permission);
}
