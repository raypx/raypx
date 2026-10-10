// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { useAsyncResource } from "../../src/react/resource.js";
import { deferred } from "./helpers.js";

afterEach(cleanup);

test("renders loading or disabled idle on the server without loading", () => {
  const load = vi.fn<(signal: AbortSignal) => Promise<string>>();
  function Resource({ enabled }: { enabled: boolean }) {
    return <output>{useAsyncResource({ key: "server", enabled, load }).status}</output>;
  }
  expect(renderToString(<Resource enabled />)).toContain("loading");
  expect(renderToString(<Resource enabled={false} />)).toContain("idle");
  expect(load).not.toHaveBeenCalled();
});

test("revalidates one key retaining data, using the latest loader without duplicate requests", async () => {
  const next = deferred<string>();
  const first = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValue("first");
  const second = vi.fn<(signal: AbortSignal) => Promise<string>>().mockReturnValue(next.promise);
  const { result, rerender } = renderHook(({ load }) => useAsyncResource({ key: "one", load }), {
    initialProps: { load: first },
  });
  await waitFor(() => expect(result.current.data).toBe("first"));
  rerender({ load: second });
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  act(() => result.current.retry());
  expect(result.current.status).toBe("loading");
  expect(result.current.data).toBe("first");
  act(() => result.current.retry());
  expect(second).toHaveBeenCalledOnce();
  await act(async () => {
    next.reject(new Error("offline"));
    await next.promise.catch(() => undefined);
  });
  expect(result.current.status).toBe("error");
  expect(result.current.data).toBe("first");
  expect(result.current.error).toEqual(new Error("offline"));
});

test("new keys immediately discard previous data and ignore stale revalidation", async () => {
  const old = deferred<string>();
  const next = deferred<string>();
  const signals: AbortSignal[] = [];
  const load = vi.fn<(signal: AbortSignal) => Promise<string>>((signal) => {
    signals.push(signal);
    return Promise.resolve("old-data");
  });
  const { result, rerender } = renderHook(({ key }) => useAsyncResource({ key, load }), {
    initialProps: { key: "old" },
  });
  await waitFor(() => expect(result.current.data).toBe("old-data"));
  load.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  act(() => result.current.retry());
  rerender({ key: "new" });
  expect(result.current.status).toBe("loading");
  expect(result.current.data).toBeUndefined();
  expect(result.current.error).toBeUndefined();
  expect(signals[0]?.aborted).toBe(true);
  expect(load.mock.calls[1]?.[0].aborted).toBe(true);
  await act(async () => {
    next.resolve("new-data");
    await next.promise;
  });
  await act(async () => {
    old.resolve("stale-data");
    await old.promise;
  });
  expect(result.current.data).toBe("new-data");
});

test("disabled state is immediately idle and clears data; enabling starts a fresh load", async () => {
  const load = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValue("private");
  const { result, rerender } = renderHook(
    ({ enabled }) => useAsyncResource({ key: "account", enabled, load }),
    { initialProps: { enabled: true } },
  );
  await waitFor(() => expect(result.current.data).toBe("private"));
  rerender({ enabled: false });
  expect(result.current).toMatchObject({ status: "idle", data: undefined, error: undefined });
  act(() => result.current.retry());
  expect(load).toHaveBeenCalledOnce();
  rerender({ enabled: true });
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.status).toBe("success"));
  expect(load).toHaveBeenCalledTimes(2);
});

test("cancel then retry aborts the old operation and ignores its late rejection", async () => {
  const old = deferred<string>();
  const next = deferred<string>();
  const load = vi
    .fn<(signal: AbortSignal) => Promise<string>>()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  const { result } = renderHook(() => useAsyncResource({ key: 1, load }));
  act(() => result.current.cancel());
  expect(load.mock.calls[0]?.[0].aborted).toBe(true);
  expect(result.current.status).toBe("idle");
  act(() => result.current.retry());
  expect(result.current.status).toBe("loading");
  await act(async () => {
    next.resolve("latest");
    await next.promise;
  });
  await act(async () => {
    old.reject(new Error("old failure"));
    await old.promise.catch(() => undefined);
  });
  expect(result.current).toMatchObject({ status: "success", data: "latest", error: undefined });
});

test("StrictMode cleanup and unmount abort outstanding work without stale commits", async () => {
  const old = deferred<string>();
  const current = deferred<string>();
  const load = vi
    .fn<(signal: AbortSignal) => Promise<string>>()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(current.promise);
  const { result, unmount } = renderHook(() => useAsyncResource({ key: "strict", load }), {
    reactStrictMode: true,
  });
  expect(load).toHaveBeenCalledTimes(2);
  expect(load.mock.calls[0]?.[0].aborted).toBe(true);
  await act(async () => {
    old.resolve("stale");
    await old.promise;
  });
  expect(result.current.status).toBe("loading");
  unmount();
  expect(load.mock.calls[1]?.[0].aborted).toBe(true);
  await act(async () => {
    current.resolve("late");
    await current.promise;
  });
  expect(result.current.status).toBe("loading");
});
