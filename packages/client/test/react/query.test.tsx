// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { checkHealth } from "../../src/health.js";
import { getSession } from "../../src/session.js";
import { useHealthCheck } from "../../src/react/health.js";
import { ClientProvider } from "../../src/react/provider.js";
import { createQueryClient, sessionQueryOptions } from "../../src/react/query.js";
import { useSession } from "../../src/react/session.js";
import { createClientWrapper, deferred } from "./helpers.js";

vi.mock("../../src/session.js", () => ({ getSession: vi.fn<typeof getSession>() }));
vi.mock("../../src/health.js", () => ({ checkHealth: vi.fn<typeof checkHealth>() }));
beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(checkHealth).mockReset();
});
afterEach(cleanup);

test("session and health consumers deduplicate through one provider's cache", async () => {
  const session = deferred<Awaited<ReturnType<typeof getSession>>>();
  const health = deferred<Awaited<ReturnType<typeof checkHealth>>>();
  vi.mocked(getSession).mockReturnValue(session.promise);
  vi.mocked(checkHealth).mockReturnValue(health.promise);
  const provider = createClientWrapper();
  const first = renderHook(() => ({ session: useSession(), health: useHealthCheck() }), {
    wrapper: provider.wrapper,
  });
  const second = renderHook(() => ({ session: useSession(), health: useHealthCheck() }), {
    wrapper: provider.wrapper,
  });
  expect(getSession).toHaveBeenCalledOnce();
  expect(checkHealth).toHaveBeenCalledOnce();
  await act(async () => {
    session.resolve({ user: null });
    health.resolve({ status: "ok", service: "raypx-api" });
  });
  await waitFor(() => expect(first.result.current.session.status).toBe("success"));
  await waitFor(() => expect(second.result.current.health.status).toBe("connected"));
  const third = renderHook(() => useSession(), { wrapper: provider.wrapper });
  expect(third.result.current.data).toEqual({ user: null });
  expect(getSession).toHaveBeenCalledOnce();
});

test("unmounting one consumer retains shared work until its last consumer leaves", () => {
  const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession).mockReturnValue(pending.promise);
  const provider = createClientWrapper();
  const first = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const second = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const signal = vi.mocked(getSession).mock.calls[0]?.[0]?.signal;
  expect(signal).toBeInstanceOf(AbortSignal);
  first.unmount();
  expect(signal?.aborted).toBe(false);
  second.unmount();
  expect(signal?.aborted).toBe(true);
});

test("request-scoped clients isolate the same session key and render only their own preloaded user", async () => {
  const alice = {
    user: {
      id: "alice",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      image: null,
    },
  };
  const bob = {
    user: { id: "bob", name: "Bob", email: "bob@example.com", emailVerified: true, image: null },
  };
  const firstRead = deferred<Awaited<ReturnType<typeof getSession>>>();
  const secondRead = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession)
    .mockReturnValueOnce(firstRead.promise)
    .mockReturnValueOnce(secondRead.promise);
  const first = createQueryClient();
  const second = createQueryClient();
  const requests = [first.query(sessionQueryOptions()), second.query(sessionQueryOptions())];
  expect(getSession).toHaveBeenCalledTimes(2);
  firstRead.resolve(alice);
  secondRead.resolve(bob);
  await Promise.all(requests);
  function Account() {
    return <output>{useSession().data?.user?.name}</output>;
  }
  const firstHtml = renderToString(
    <ClientProvider client={first}>
      <Account />
    </ClientProvider>,
  );
  const secondHtml = renderToString(
    <ClientProvider client={second}>
      <Account />
    </ClientProvider>,
  );
  expect(firstHtml).toContain("Alice");
  expect(firstHtml).not.toContain("Bob");
  expect(secondHtml).toContain("Bob");
  expect(secondHtml).not.toContain("Alice");
  expect(getSession).toHaveBeenCalledTimes(2);
  const mounted = renderHook(() => useSession(), {
    wrapper: ({ children }) => <ClientProvider client={first}>{children}</ClientProvider>,
  });
  expect(mounted.result.current.data).toEqual(alice);
  expect(getSession).toHaveBeenCalledTimes(2);
  first.clear();
  second.clear();
});

test("session cancel pauses and retry settles only the new shared query", async () => {
  const stale = deferred<Awaited<ReturnType<typeof getSession>>>();
  const current = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession).mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
  const { result } = renderHook(() => useSession(), { wrapper: createClientWrapper().wrapper });
  const oldSignal = vi.mocked(getSession).mock.calls[0]?.[0]?.signal;
  act(() => result.current.cancel());
  expect(oldSignal?.aborted).toBe(true);
  expect(result.current.status).toBe("idle");
  act(() => result.current.retry());
  await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
  await act(async () => current.resolve({ user: null }));
  await waitFor(() => expect(result.current.status).toBe("success"));
  await act(async () => stale.reject(new Error("late")));
  expect(result.current.data).toEqual({ user: null });
  expect(result.current.error).toBeUndefined();
});

test("cancelling one enabled consumer leaves the shared request available to another", async () => {
  const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession).mockReturnValue(pending.promise);
  const provider = createClientWrapper();
  const first = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const second = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const signal = vi.mocked(getSession).mock.calls[0]?.[0]?.signal;
  act(() => first.result.current.cancel());
  expect(first.result.current.status).toBe("idle");
  expect(second.result.current.status).toBe("loading");
  expect(signal?.aborted).toBe(false);
  expect(getSession).toHaveBeenCalledOnce();
  await act(async () => pending.resolve({ user: null }));
  await waitFor(() => expect(second.result.current.status).toBe("success"));
  expect(first.result.current.status).toBe("idle");
  expect(second.result.current.data).toEqual({ user: null });
});

test("a disabled observer does not prevent the sole enabled consumer from aborting", () => {
  const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession).mockReturnValue(pending.promise);
  const provider = createClientWrapper();
  const enabled = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const disabled = renderHook(() => useSession({ enabled: false }), { wrapper: provider.wrapper });
  const signal = vi.mocked(getSession).mock.calls[0]?.[0]?.signal;
  act(() => enabled.result.current.cancel());
  expect(signal?.aborted).toBe(true);
  expect(enabled.result.current.status).toBe("idle");
  expect(disabled.result.current).toMatchObject({ status: "idle", data: undefined });
  expect(getSession).toHaveBeenCalledOnce();
});

test("cancelling the last enabled consumer aborts after the first has paused", () => {
  const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession).mockReturnValue(pending.promise);
  const provider = createClientWrapper();
  const first = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const second = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const signal = vi.mocked(getSession).mock.calls[0]?.[0]?.signal;
  act(() => first.result.current.cancel());
  expect(signal?.aborted).toBe(false);
  act(() => second.result.current.cancel());
  expect(signal?.aborted).toBe(true);
  expect(first.result.current.status).toBe("idle");
  expect(second.result.current.status).toBe("idle");
  expect(getSession).toHaveBeenCalledOnce();
});

test("resuming a paused consumer joins another consumer's pending request", async () => {
  const pending = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession).mockReturnValue(pending.promise);
  const provider = createClientWrapper();
  const first = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const second = renderHook(() => useSession(), { wrapper: provider.wrapper });
  const signal = vi.mocked(getSession).mock.calls[0]?.[0]?.signal;
  act(() => first.result.current.cancel());
  act(() => first.result.current.retry());
  expect(first.result.current.status).toBe("loading");
  expect(signal?.aborted).toBe(false);
  expect(getSession).toHaveBeenCalledOnce();
  await act(async () => pending.resolve({ user: null }));
  await waitFor(() => expect(first.result.current.status).toBe("success"));
  expect(second.result.current.data).toEqual({ user: null });
});

test("an aborted scope's late session result cannot overwrite another scope's confirmed session", async () => {
  const stale = deferred<Awaited<ReturnType<typeof getSession>>>();
  const current = deferred<Awaited<ReturnType<typeof getSession>>>();
  const oldSession = {
    user: { id: "old", name: "Old", email: "old@example.com", emailVerified: true, image: null },
  };
  const newSession = {
    user: { id: "new", name: "New", email: "new@example.com", emailVerified: true, image: null },
  };
  vi.mocked(getSession).mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
  const provider = createClientWrapper();
  const old = renderHook(() => useSession({ key: "old" }), { wrapper: provider.wrapper });
  const next = renderHook(() => useSession({ key: "new" }), { wrapper: provider.wrapper });
  old.unmount();
  expect(vi.mocked(getSession).mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
  await act(async () => current.resolve(newSession));
  await waitFor(() => expect(next.result.current.data).toEqual(newSession));
  await act(async () => {
    stale.resolve(oldSession);
    await stale.promise;
  });
  expect(next.result.current.data).toEqual(newSession);
  expect(provider.client.getQueryData(sessionQueryOptions("new").queryKey)).toEqual(newSession);
});

test("query client factories retain independent configuration overrides", () => {
  const first = createQueryClient({ defaultOptions: { queries: { staleTime: 123, retry: 1 } } });
  const second = createQueryClient();
  expect(first).not.toBe(second);
  expect(first.getDefaultOptions().queries).toMatchObject({ staleTime: 123, retry: 1 });
  expect(second.getDefaultOptions().queries).toMatchObject({ staleTime: 30_000, retry: false });
});
