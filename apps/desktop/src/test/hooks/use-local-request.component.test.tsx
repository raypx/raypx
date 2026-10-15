/** @vitest-environment jsdom */
import { useMemo, useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { FileListing, JobDefinition, RootGrant } from "@raypx/contracts/local";
import { useLocalRequest } from "../../hooks/use-local-request";

const mocks = vi.hoisted(() => ({
  isDesktop: vi.fn<() => boolean>(),
  localRequest: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("../../lib/desktop", () => mocks);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function roots(id: string): RootGrant[] {
  return [{ id, name: id, path: `/${id}`, createdAt: "2026-10-15T00:00:00.000Z" }];
}

function callbacks() {
  return {
    onSuccess: vi.fn<(value: RootGrant[]) => void>(),
    onError: vi.fn<() => void>(),
    onReset: vi.fn<() => void>(),
  };
}

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.isDesktop.mockReturnValue(true);
  mocks.localRequest.mockReturnValue(new Promise(() => {}));
});

describe("Desktop local request loading", () => {
  it("uses the latest callbacks without refetching when only callbacks change", async () => {
    const first = deferred<RootGrant[]>();
    const second = deferred<RootGrant[]>();
    mocks.localRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const original = callbacks();
    const latest = callbacks();
    const newest = callbacks();
    const { rerender } = renderHook(
      ({ handlers, refreshKey }) =>
        useLocalRequest<RootGrant[]>({ method: "roots.list", refreshKey, ...handlers }),
      { initialProps: { handlers: original, refreshKey: 0 } },
    );
    expect(mocks.localRequest).toHaveBeenCalledWith("roots.list", {});
    expect(original.onReset).toHaveBeenCalledTimes(1);

    rerender({ handlers: latest, refreshKey: 0 });
    expect(mocks.localRequest).toHaveBeenCalledTimes(1);
    expect(latest.onReset).not.toHaveBeenCalled();
    const value = roots("current");
    await act(async () => first.resolve(value));
    expect(original.onSuccess).not.toHaveBeenCalled();
    expect(latest.onSuccess).toHaveBeenCalledWith(value);

    rerender({ handlers: latest, refreshKey: 1 });
    expect(latest.onReset).toHaveBeenCalledTimes(1);
    rerender({ handlers: newest, refreshKey: 1 });
    expect(mocks.localRequest).toHaveBeenCalledTimes(2);
    await act(async () => second.reject(new Error("RPC failed")));
    expect(latest.onError).not.toHaveBeenCalled();
    expect(newest.onError).toHaveBeenCalledTimes(1);
  });

  it("resets consumers but sends no RPC while previewing or disabled", () => {
    const handlers = callbacks();
    mocks.isDesktop.mockReturnValue(false);
    const { rerender } = renderHook(
      ({ enabled }) => useLocalRequest<RootGrant[]>({ method: "roots.list", enabled, ...handlers }),
      { initialProps: { enabled: true } },
    );
    expect(handlers.onReset).toHaveBeenCalledTimes(1);
    expect(mocks.localRequest).not.toHaveBeenCalled();

    rerender({ enabled: false });
    expect(handlers.onReset).toHaveBeenCalledTimes(2);
    mocks.isDesktop.mockReturnValue(true);
    rerender({ enabled: false });
    expect(mocks.localRequest).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(handlers.onReset).toHaveBeenCalledTimes(3);
    expect(mocks.localRequest).toHaveBeenCalledTimes(1);
  });

  it("reloads file listings for root, path, offset, revision and locale changes", () => {
    const onSuccess = vi.fn();
    const initial = { rootId: "first", path: "", offset: 0, revision: 0, locale: "en" };
    const { rerender } = renderHook(
      ({ rootId, path, offset, revision, locale }) => {
        const params = useMemo(
          () => ({ rootId, path, offset, limit: 100 }),
          [rootId, path, offset],
        );
        useLocalRequest<FileListing>({
          method: "files.list",
          params,
          refreshKey: `${revision}:${locale}`,
          onSuccess,
        });
      },
      { initialProps: initial },
    );
    rerender({ ...initial });
    expect(mocks.localRequest).toHaveBeenCalledTimes(1);
    rerender({ ...initial, path: "documents" });
    rerender({ ...initial, path: "documents", offset: 100 });
    rerender({ ...initial, rootId: "second" });
    rerender({ ...initial, rootId: "second", revision: 1 });
    rerender({ ...initial, rootId: "second", revision: 1, locale: "zh" });

    expect(mocks.localRequest.mock.calls).toEqual([
      ["files.list", { rootId: "first", path: "", offset: 0, limit: 100 }],
      ["files.list", { rootId: "first", path: "documents", offset: 0, limit: 100 }],
      ["files.list", { rootId: "first", path: "documents", offset: 100, limit: 100 }],
      ["files.list", { rootId: "second", path: "", offset: 0, limit: 100 }],
      ["files.list", { rootId: "second", path: "", offset: 0, limit: 100 }],
      ["files.list", { rootId: "second", path: "", offset: 0, limit: 100 }],
    ]);
  });

  it("ignores an older success after a refreshed request has completed", async () => {
    const first = deferred<RootGrant[]>();
    const second = deferred<RootGrant[]>();
    mocks.localRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const handlers = callbacks();
    const { rerender } = renderHook(
      ({ refreshKey }) =>
        useLocalRequest<RootGrant[]>({ method: "roots.list", refreshKey, ...handlers }),
      { initialProps: { refreshKey: 0 } },
    );
    rerender({ refreshKey: 1 });
    const current = roots("new");
    await act(async () => second.resolve(current));
    await act(async () => first.resolve(roots("old")));
    expect(handlers.onSuccess.mock.calls).toEqual([[current]]);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("ignores an older failure after a refreshed request has completed", async () => {
    const first = deferred<RootGrant[]>();
    const second = deferred<RootGrant[]>();
    mocks.localRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const handlers = callbacks();
    const { rerender } = renderHook(
      ({ refreshKey }) =>
        useLocalRequest<RootGrant[]>({ method: "roots.list", refreshKey, ...handlers }),
      { initialProps: { refreshKey: 0 } },
    );
    rerender({ refreshKey: 1 });
    const current = roots("new");
    await act(async () => second.resolve(current));
    await act(async () => first.reject(new Error("stale transport failure")));
    expect(handlers.onSuccess.mock.calls).toEqual([[current]]);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("ignores both successful and failed responses after unmount", async () => {
    const successful = deferred<RootGrant[]>();
    const failed = deferred<JobDefinition[]>();
    mocks.localRequest.mockReturnValueOnce(successful.promise).mockReturnValueOnce(failed.promise);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { unmount } = renderHook(() => {
      useLocalRequest<RootGrant[]>({ method: "roots.list", onSuccess, onError });
      useLocalRequest<JobDefinition[]>({ method: "jobs.list", onSuccess, onError });
    });
    unmount();
    await act(async () => {
      successful.resolve(roots("late"));
      failed.reject(new Error("late transport failure"));
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("invalidates an in-flight response when loading becomes disabled", async () => {
    const pending = deferred<RootGrant[]>();
    mocks.localRequest.mockReturnValueOnce(pending.promise);
    const handlers = callbacks();
    const { rerender } = renderHook(
      ({ enabled }) => useLocalRequest<RootGrant[]>({ method: "roots.list", enabled, ...handlers }),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    await act(async () => pending.resolve(roots("late")));
    expect(handlers.onReset).toHaveBeenCalledTimes(2);
    expect(handlers.onSuccess).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(mocks.localRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps jobs and roots failures independent while optional errors remain silent", async () => {
    const firstJobs = deferred<JobDefinition[]>();
    const firstRoots = deferred<RootGrant[]>();
    const secondJobs = deferred<JobDefinition[]>();
    const secondRoots = deferred<RootGrant[]>();
    mocks.localRequest
      .mockReturnValueOnce(firstJobs.promise)
      .mockReturnValueOnce(firstRoots.promise)
      .mockReturnValueOnce(secondJobs.promise)
      .mockReturnValueOnce(secondRoots.promise);
    const onJobs = vi.fn();
    const onRoots = vi.fn();
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ refreshKey }) => {
        useLocalRequest<JobDefinition[]>({
          method: "jobs.list",
          refreshKey,
          onSuccess: onJobs,
          onError,
        });
        useLocalRequest<RootGrant[]>({ method: "roots.list", refreshKey, onSuccess: onRoots });
      },
      { initialProps: { refreshKey: 0 } },
    );
    await act(async () => firstRoots.reject(new Error("roots unavailable")));
    expect(onError).not.toHaveBeenCalled();
    await act(async () => firstJobs.resolve([]));
    expect(onJobs).toHaveBeenCalledWith([]);

    rerender({ refreshKey: 1 });
    await act(async () => secondJobs.reject(new Error("jobs unavailable")));
    expect(onError).toHaveBeenCalledTimes(1);
    const value = roots("available");
    await act(async () => secondRoots.resolve(value));
    expect(onRoots).toHaveBeenCalledWith(value);
    expect(onJobs).toHaveBeenCalledTimes(1);
  });

  it("lets callers clear a file listing while retaining roots during refresh", async () => {
    const listingRequest = deferred<FileListing>();
    const rootsRequest = deferred<RootGrant[]>();
    mocks.localRequest
      .mockReturnValueOnce(listingRequest.promise)
      .mockReturnValueOnce(rootsRequest.promise);
    const params = { rootId: "first", path: "", offset: 0, limit: 100 };
    const oldRoots = roots("old");
    const { result, rerender } = renderHook(
      ({ refreshKey }) => {
        const [listing, setListing] = useState<FileListing | null>(null);
        const [grants, setGrants] = useState(oldRoots);
        useLocalRequest<FileListing>({
          method: "files.list",
          params,
          refreshKey,
          onReset: () => setListing(null),
          onSuccess: setListing,
        });
        useLocalRequest<RootGrant[]>({
          method: "roots.list",
          refreshKey,
          onSuccess: setGrants,
        });
        return { listing, grants };
      },
      { initialProps: { refreshKey: 0 } },
    );
    expect(result.current).toEqual({ listing: null, grants: oldRoots });
    const listing: FileListing = { entries: [], total: 0, offset: 0 };
    const currentRoots = roots("current");
    await act(async () => {
      listingRequest.resolve(listing);
      rootsRequest.resolve(currentRoots);
    });
    expect(result.current).toEqual({ listing, grants: currentRoots });
    rerender({ refreshKey: 1 });
    expect(result.current).toEqual({ listing: null, grants: currentRoots });
    expect(mocks.localRequest).toHaveBeenCalledTimes(4);
  });
});
