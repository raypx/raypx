import type { AdminUser, AdminUsersClient, UserListInput } from "./types";
import { LocalizedWebError } from "../../../i18n/error-message";

export const seedUsers: readonly AdminUser[] = [
  {
    id: "owner-local",
    name: "Mina Cole",
    email: "owner@voidmix.local",
    role: "owner",
    status: "active",
    lastActive: { kind: "relative", value: -2, unit: "minute" },
    joinedAt: new Date("2026-05-18T00:00:00.000Z"),
  },
  {
    id: "admin-local",
    name: "Leo Wang",
    email: "admin@voidmix.local",
    role: "admin",
    status: "active",
    lastActive: { kind: "relative", value: -18, unit: "minute" },
    joinedAt: new Date("2026-06-04T00:00:00.000Z"),
  },
  {
    id: "user-local",
    name: "Samira Bell",
    email: "user@voidmix.local",
    role: "user",
    status: "active",
    lastActive: { kind: "relative", value: -1, unit: "hour" },
    joinedAt: new Date("2026-06-21T00:00:00.000Z"),
  },
  {
    id: "usr_suspended",
    name: "Rei Nakamura",
    email: "rei@monoform.jp",
    role: "user",
    status: "suspended",
    lastActive: { kind: "relative", value: -9, unit: "day" },
    joinedAt: new Date("2026-04-07T00:00:00.000Z"),
  },
];

function matchesInput(user: AdminUser, input: UserListInput) {
  const query = input.query?.trim().toLowerCase();
  const matchesQuery =
    !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
  return (
    matchesQuery &&
    (!input.status || user.status === input.status) &&
    (!input.role || user.role === input.role)
  );
}

export function createPreviewUsersAdapter(
  initialUsers: readonly AdminUser[] = seedUsers,
): AdminUsersClient {
  const users = initialUsers.map((user) => ({ ...user }));

  return {
    async listUsers(input) {
      const matches = users.filter((user) => matchesInput(user, input));
      const offset = Number(input.cursor ?? 0);
      const limit = input.limit ?? 50;
      const items = matches.slice(offset, offset + limit).map((user) => ({ ...user }));
      return {
        items,
        total: matches.length,
        nextCursor: offset + items.length < matches.length ? String(offset + items.length) : null,
      };
    },
    async updateUserStatus(input) {
      const user = users.find((candidate) => candidate.id === input.userId);
      if (!user) throw new LocalizedWebError("USER_NOT_FOUND");
      user.status = input.status;
      return { ...user };
    },
  };
}

export type PreviewUsersAdapter = ReturnType<typeof createPreviewUsersAdapter>;
