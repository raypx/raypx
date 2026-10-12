import type { ApiClient } from "@voidmix/client";
import { createWebApiClient } from "../../../lib/api-client";

import type { AdminUser, AdminUsersClient, UserRole, UserStatus } from "./types";

type ApiUser = {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
};

export function toAdminUser(user: ApiUser): AdminUser {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
    role: user.role,
    status: user.status,
    // Keep display values locale-neutral; UserRow formats them at render time.
    lastActive: { kind: "unknown" },
    joinedAt: user.createdAt,
  };
}

export function createApiUsersAdapter(api: ApiClient = createWebApiClient()): AdminUsersClient {
  return {
    async listUsers(input, signal) {
      const { query, ...filters } = input;
      const page = await api.admin.users.list(
        { ...filters, ...(query?.trim() ? { query: query.trim() } : {}), limit: input.limit ?? 50 },
        { signal },
      );
      return { ...page, items: page.items.map(toAdminUser) };
    },
    async updateUserStatus(input) {
      return toAdminUser(await api.admin.users.updateStatus(input));
    },
  };
}

export type ApiUsersAdapter = ReturnType<typeof createApiUsersAdapter>;
