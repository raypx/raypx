export type UserRole = "owner" | "admin" | "user";
export type UserStatus = "active" | "suspended";
export type AdminUsersError = "directoryLoadFailed";

export type AdminLastActive =
  | { kind: "unknown" }
  | { kind: "connected" }
  | { kind: "relative"; value: number; unit: "second" | "minute" | "hour" | "day" };

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastActive: AdminLastActive;
  joinedAt: Date | null;
}

export interface UserListInput {
  limit?: number;
  cursor?: string;
  query?: string;
  status?: UserStatus;
  role?: UserRole;
}

export interface AdminUsersClient {
  listUsers(input: UserListInput, signal?: AbortSignal): Promise<AdminUsersPage>;
  updateUserStatus(input: { userId: string; status: UserStatus }): Promise<AdminUser>;
}

export interface AdminUsersPage {
  items: readonly AdminUser[];
  total: number;
  nextCursor: string | null;
}
