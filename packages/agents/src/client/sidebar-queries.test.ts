import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { cachedSidebarReads, workspaceQueryKey } from "./sidebar-queries.js";

it("refreshes routine projections after a successful write without caching its result", async () => {
  const cache = new QueryClient();
  const port = {
    list: vi.fn(async (_input: { spaceId: string }) => ["before"]),
    create: vi.fn(async (_input: { spaceId: string }) => ({ saved: true })),
  };
  const wrapped = cachedSidebarReads(
    port,
    cache,
    "origin",
    "account",
    "routines",
    ["list"],
    ["create"],
  );
  await wrapped.list({ spaceId: "one" });
  await wrapped.list({ spaceId: "two" });
  await wrapped.list({ spaceId: "one" });
  expect(port.list).toHaveBeenCalledTimes(2);
  const sidebarKey = workspaceQueryKey("origin", "account", "routines", "one");
  const otherAccountKey = workspaceQueryKey("origin", "other", "routines", "one");
  cache.setQueryData(sidebarKey, ["before"]);
  cache.setQueryData(otherAccountKey, ["other"]);
  expect(await wrapped.create({ spaceId: "one" })).toEqual({ saved: true });
  expect(cache.getQueryState(sidebarKey)?.isInvalidated).toBe(true);
  expect(cache.getQueryState(otherAccountKey)?.isInvalidated).toBe(false);
  port.list.mockResolvedValue(["after"]);
  expect(await wrapped.list({ spaceId: "one" })).toEqual(["after"]);
  expect(await wrapped.list({ spaceId: "two" })).toEqual(["before"]);
  expect(port.create).toHaveBeenCalledOnce();
  expect(
    cache
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data),
  ).not.toContainEqual({
    saved: true,
  });
  cache.clear();
});

it("cancels a membership read begun before Space creation and retains other origins", async () => {
  const cache = new QueryClient();
  let finish!: (value: string[]) => void;
  const port = {
    list: vi.fn(
      async (_input: { spaceId?: string }) =>
        new Promise<string[]>((resolve) => {
          finish = resolve;
        }),
    ),
    create: vi.fn(async (_input: { spaceId?: string }) => ({ created: true })),
  };
  const wrapped = cachedSidebarReads(
    port,
    cache,
    "origin",
    "account",
    "spaces",
    ["list"],
    ["create"],
  );
  const key = workspaceQueryKey("origin", "account", "spaces");
  const otherKey = workspaceQueryKey("other", "account", "spaces");
  cache.setQueryData(otherKey, ["other"]);
  const staleRead = wrapped.list({}).catch(() => null);
  await wrapped.create({});
  expect(await staleRead).toBeNull();
  finish(["stale"]);
  await Promise.resolve();
  expect(cache.getQueryData(key)).toBeUndefined();
  expect(cache.getQueryData(otherKey)).toEqual(["other"]);
  cache.clear();
});

it("propagates failed writes without replaying them or discarding valid cached reads", async () => {
  const cache = new QueryClient();
  const port = {
    list: vi.fn(async (_input: { spaceId: string }) => ["before"]),
    create: vi.fn(async (_input: { spaceId: string }) => {
      throw new Error("Unavailable");
    }),
  };
  const wrapped = cachedSidebarReads(
    port,
    cache,
    "origin",
    "account",
    "routines",
    ["list"],
    ["create"],
  );
  await wrapped.list({ spaceId: "one" });
  await expect(wrapped.create({ spaceId: "one" })).rejects.toThrow("Unavailable");
  expect(await wrapped.list({ spaceId: "one" })).toEqual(["before"]);
  expect(port.list).toHaveBeenCalledOnce();
  expect(port.create).toHaveBeenCalledOnce();
  cache.clear();
});
