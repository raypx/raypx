import type { AdminUser, AdminUsersClient, UserStatus } from "./types";
import type { DirectoryStore, DirectoryNotice } from "./store";
export async function changeUserStatus(options: {
  store: DirectoryStore;
  client: AdminUsersClient;
  users: readonly AdminUser[];
  status: UserStatus;
  reload: () => Promise<void>;
  single?: boolean;
}) {
  const { store, client, status, reload } = options;
  const targets = options.users.filter((user) => user.role !== "owner" && user.status !== status);
  if (!targets.length) {
    store.getState().setNotice({
      code: options.users.some((user) => user.role !== "owner")
        ? "selectedAlready"
        : "ownerCannotChange",
      values: { status },
    });
    return;
  }
  const ids = targets.map((user) => user.id);
  const token = store.getState().begin(ids);
  if (token === null) return;
  const results = await Promise.allSettled(
    targets.map((user) => client.updateUserStatus({ userId: user.id, status })),
  );
  const succeeded = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - succeeded;
  const notice: DirectoryNotice = options.single
    ? {
        code: failed ? "userUpdateFailed" : "userStatusChanged",
        values: { name: targets[0]!.name, status },
      }
    : {
        code: failed ? "usersPartiallyUpdated" : "usersUpdated",
        values: { succeeded, failed, count: succeeded, status },
      };
  if (store.getState().isCurrent(token)) {
    try {
      await reload();
    } catch {
      store.getState().finish(token, ids, { ...notice, refreshFailed: true });
      return;
    }
  }
  store.getState().finish(token, ids, notice);
}
