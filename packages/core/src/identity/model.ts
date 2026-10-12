import type { Role } from "@voidmix/auth";

export const userStatuses = ["active", "suspended"] as const;
export type UserStatus = (typeof userStatuses)[number];

export type AuditTargetType = "user" | "system_setting";
export type AuditAction =
  | "user.status.changed"
  | "admin.created"
  | "system.settings.updated"
  | "system.mail.test.sent";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  targetUserId: string | null;
  occurredAt: Date;
  metadata: Record<string, string>;
}

export interface UserPage {
  items: User[];
  total: number;
  nextCursor: string | null;
}

export interface UserListQuery {
  query?: string;
  role?: Role;
  status?: UserStatus;
  limit: number;
  cursor?: string;
}

export interface UserAdministrationTransaction {
  runAdministration<T>(operation: (users: UserRepository) => Promise<T>): Promise<T>;
}
export interface UserRepository extends UserAdministrationTransaction {
  list(query: UserListQuery): Promise<UserPage>;
  getById(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  countActiveAdministrators(): Promise<number>;
  save(user: User): Promise<void>;
  updateStatus(id: string, status: UserStatus): Promise<User>;
  appendAudit(event: AuditEvent): Promise<void>;
  listAudit(limit: number): Promise<AuditEvent[]>;
}
