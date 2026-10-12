export const roles = ["user", "admin", "owner"] as const;
export type Role = (typeof roles)[number];

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
