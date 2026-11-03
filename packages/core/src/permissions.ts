/** Pure vocabulary shared by the auth ACL and wire schemas. */
export const authRoleNames = ["member", "admin"] as const;
export type AuthRole = (typeof authRoleNames)[number];

export const applicationPermissions = [
  "users.read",
  "users.roles.update",
  "projects.read",
  "tasks.read",
  "approvals.read",
  "automations.manage",
  "memory.manage",
  "account.manage",
  "configuration.read",
  "configuration.update",
] as const;
