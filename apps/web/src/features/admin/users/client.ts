import { createApiUsersAdapter } from "./api-adapter";
import type { AdminUsersClient } from "./types";
export type * from "./types";
export const adminUsersClient: AdminUsersClient = {
  listUsers: (input, signal) => createApiUsersAdapter().listUsers(input, signal),
  updateUserStatus: (input) => createApiUsersAdapter().updateUserStatus(input),
};
