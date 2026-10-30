import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { expect, it } from "vite-plus/test";
import { createSnapshotReader } from "../../src/snapshot";

async function fixture() {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/tasks/$taskId",
    loader: () => ({ privateBody: "private-loader-value" }),
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: ["/tasks/private-route-value?token=private-search-value"],
    }),
  });
  await router.load();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let locale = "en";
  const read = createSnapshotReader({
    router,
    queryClient,
    surface: "web",
    preferences: () => ({
      locale,
      localePreference: "system",
      theme: "system",
      resolvedTheme: "light",
    }),
  });
  return {
    router,
    queryClient,
    read,
    setLocale: (value: string) => {
      locale = value;
    },
  };
}
it("projects useful metadata without URL values, query keys/hashes, payloads or exceptions", async () => {
  const { read, queryClient } = await fixture();
  const payload: Record<string, unknown> = { credential: "private-query-value" };
  payload.circular = payload;
  queryClient.setQueryData(["tasks", 7, "task", "private-account-value", "/private/file"], payload);
  queryClient.setQueryData(["private-unknown-key"], "private-response");
  const query = queryClient.getQueryCache().getAll()[0]!;
  query.setState({ error: new Error("private-error-message"), status: "error" });
  const snapshot = read();
  expect(snapshot.route.matches.at(-1)).toEqual({
    template: "/tasks/$taskId",
    status: "success",
    parameterNames: ["taskId"],
  });
  expect(snapshot.route.searchNames).toEqual(["token"]);
  expect(snapshot.queries[0]).toMatchObject({
    id: "query-1",
    label: "tasks/task",
    status: "error",
    observers: 0,
  });
  expect(snapshot.queries[1]?.label).toBe("query-2");
  const json = JSON.stringify(snapshot);
  for (const secret of [
    "private-",
    "/private/file",
    "queryHash",
    "credential",
    "circular",
    "stack",
  ])
    expect(json).not.toContain(secret);
  queryClient.clear();
});
it("reflects query lifecycle, observers, invalidation and current preferences", async () => {
  const { queryClient, router, read, setLocale } = await fixture();
  expect(read().queries).toEqual([]);
  queryClient.setQueryData(["account"], { id: "private-account-value" });
  const observer = new QueryObserver(queryClient, { queryKey: ["account"], enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  const first = read().queries[0]!;
  expect(first).toMatchObject({
    id: "query-1",
    label: "account",
    observers: 1,
    fetchStatus: "idle",
  });
  expect(first.updatedAt).not.toBeNull();
  await queryClient.invalidateQueries({ refetchType: "none" });
  expect(read().queries[0]?.stale).toBe(true);
  setLocale("zh");
  expect(read().preferences.locale).toBe("zh");
  expect(read().queries[0]?.id).toBe(first.id);
  const nextReader = createSnapshotReader({
    router,
    queryClient,
    surface: "web",
    preferences: () => read().preferences,
  });
  expect(nextReader().queries[0]?.id).toBe(first.id);
  unsubscribe();
  queryClient.removeQueries();
  expect(read().queries).toEqual([]);
});
