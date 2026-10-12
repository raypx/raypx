import { describe, expect, it, vi } from "vite-plus/test";
import { createDirectoryStore } from "./store";
import { changeUserStatus } from "./operations";
import { createPreviewUsersAdapter, seedUsers } from "./preview-adapter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("directory state lifetime", () => {
  it("isolates page stores and clears selection on filter/page changes", () => {
    const a = createDirectoryStore(),
      b = createDirectoryStore();
    a.getState().select("one", true);
    expect([...b.getState().selectedIds]).toEqual([]);
    const token = a.getState().begin(["one"])!;
    a.getState().resetSelection();
    expect([...a.getState().selectedIds]).toEqual([]);
    expect(a.getState().finish(token, ["one"], { code: "userStatusChanged" })).toBe(false);
    expect(a.getState().notice).toBeNull();
    expect(a.getState().pendingIds.size).toBe(0);
  });
  it("does not refresh or change feedback after unmount/account replacement", async () => {
    const store = createDirectoryStore(),
      next = createDirectoryStore();
    const pending = deferred<(typeof seedUsers)[number]>();
    const reload = vi.fn();
    const client = { listUsers: vi.fn(), updateUserStatus: vi.fn(() => pending.promise) };
    const operation = changeUserStatus({
      store,
      client,
      users: [seedUsers[2]!],
      status: "suspended",
      reload,
    });
    store.getState().dispose();
    pending.resolve({ ...seedUsers[2]!, status: "suspended" });
    await operation;
    expect(reload).not.toHaveBeenCalled();
    expect(next.getState().notice).toBeNull();
    expect(store.getState().notice).toBeNull();
  });
  it("keeps explicit target status and reports partial batch failures", async () => {
    const store = createDirectoryStore(),
      adapter = createPreviewUsersAdapter();
    const reload = vi.fn();
    const updateUserStatus = vi.fn(
      async (input: Parameters<typeof adapter.updateUserStatus>[0]) => {
        if (input.userId === "admin-local") throw new Error("denied");
        return adapter.updateUserStatus(input);
      },
    );
    await changeUserStatus({
      store,
      client: { ...adapter, updateUserStatus },
      users: seedUsers,
      status: "suspended",
      reload,
    });
    expect(updateUserStatus.mock.calls.map(([input]) => input)).toEqual([
      { userId: "admin-local", status: "suspended" },
      { userId: "user-local", status: "suspended" },
    ]);
    expect(store.getState().notice).toMatchObject({
      code: "usersPartiallyUpdated",
      values: { succeeded: 1, failed: 1 },
    });
    expect(store.getState().pendingIds.size).toBe(0);
    expect(reload).toHaveBeenCalledOnce();
  });
  it("rejects overlapping writes and old completions after reactivation", () => {
    const store = createDirectoryStore();
    const token = store.getState().begin(["a"])!;
    expect(store.getState().begin(["a"])).toBeNull();
    store.getState().dispose();
    store.getState().activate();
    expect(store.getState().finish(token, ["a"], { code: "userStatusChanged" })).toBe(false);
    expect(store.getState().notice).toBeNull();
  });
  it.each([false, true])(
    "clears pending writes when refresh fails after filter change=%s",
    async (changed) => {
      const store = createDirectoryStore();
      await changeUserStatus({
        store,
        client: createPreviewUsersAdapter(),
        users: [seedUsers[2]!],
        status: "suspended",
        reload: async () => {
          if (changed) store.getState().resetSelection();
          throw new Error("refresh failed");
        },
      });
      expect(store.getState().pendingIds.size).toBe(0);
      if (changed) expect(store.getState().notice).toBeNull();
      else
        expect(store.getState().notice).toMatchObject({
          code: "usersUpdated",
          refreshFailed: true,
          values: { succeeded: 1 },
        });
    },
  );
});
