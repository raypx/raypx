// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { useMutation, type MutationOutcome } from "../../src/react/mutation.js";
import { deferred } from "./helpers.js";

afterEach(cleanup);

test("SSR is idle and starts no writes", () => {
  const execute = vi.fn<(input: string, signal: AbortSignal) => Promise<string>>();
  function Form() {
    return <output>{useMutation({ execute }).status}</output>;
  }
  expect(renderToString(<Form />)).toContain("idle");
  expect(execute).not.toHaveBeenCalled();
});

test("resolves explicit success and error outcomes instead of unhandled rejection", async () => {
  const failure = new Error("denied");
  const execute = vi
    .fn<(input: string, signal: AbortSignal) => Promise<string>>()
    .mockResolvedValueOnce("saved")
    .mockRejectedValueOnce(failure);
  const { result } = renderHook(() => useMutation({ execute }));
  await act(async () =>
    expect(await result.current.mutate("first")).toEqual({ status: "success", data: "saved" }),
  );
  expect(result.current).toMatchObject({ status: "success", data: "saved", error: undefined });
  await act(async () =>
    expect(await result.current.mutate("second")).toEqual({ status: "error", error: failure }),
  );
  expect(result.current).toMatchObject({ status: "error", data: undefined, error: failure });
});

test("latest invocation wins and promptly cancels superseded non-cooperative work", async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const execute = vi
    .fn<(input: string, signal: AbortSignal) => Promise<string>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { result } = renderHook(() => useMutation({ execute }));
  let old!: Promise<MutationOutcome<string>>;
  let latest!: Promise<MutationOutcome<string>>;
  act(() => {
    old = result.current.mutate("old");
    latest = result.current.mutate("latest");
  });
  expect(execute.mock.calls[0]?.[1].aborted).toBe(true);
  await act(async () => expect(await old).toEqual({ status: "cancelled" }));
  await act(async () => {
    second.resolve("new");
    expect(await latest).toEqual({ status: "success", data: "new" });
  });
  await act(async () => {
    first.resolve("old");
    await first.promise;
  });
  expect(result.current.data).toBe("new");
});

test("cancel and reset settle pending work and permit a later successful mutation", async () => {
  const pending = deferred<string>();
  const execute = vi
    .fn<(input: string, signal: AbortSignal) => Promise<string>>()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue("saved");
  const { result } = renderHook(() => useMutation({ execute }));
  let operation!: Promise<MutationOutcome<string>>;
  act(() => {
    operation = result.current.mutate("one");
  });
  act(() => result.current.cancel());
  await act(async () => expect(await operation).toEqual({ status: "cancelled" }));
  expect(result.current.status).toBe("idle");
  await act(async () => {
    await result.current.mutate("two");
  });
  act(() => result.current.cancel());
  expect(result.current).toMatchObject({ status: "idle", data: "saved" });
  act(() => result.current.reset());
  expect(result.current).toMatchObject({ status: "idle", data: undefined, error: undefined });
  await act(async () => {
    pending.reject(new Error("late failure"));
    await pending.promise.catch(() => undefined);
  });
  expect(result.current.status).toBe("idle");
});

test("StrictMode restarts and unmount never commit an obsolete mutation", async () => {
  const first = deferred<string>();
  const latest = deferred<string>();
  const execute = vi
    .fn<(input: string, signal: AbortSignal) => Promise<string>>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(latest.promise);
  const { result, unmount } = renderHook(
    () => {
      const mutation = useMutation({ execute });
      const { mutate } = mutation;
      useEffect(() => {
        void mutate("mount");
      }, [mutate]);
      return mutation;
    },
    { reactStrictMode: true },
  );
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls[0]?.[1].aborted).toBe(true);
  await act(async () => {
    first.resolve("obsolete");
    await first.promise;
  });
  expect(result.current.status).toBe("pending");
  unmount();
  expect(execute.mock.calls[1]?.[1].aborted).toBe(true);
  await act(async () => {
    latest.resolve("too late");
    await latest.promise;
  });
  expect(result.current.status).toBe("pending");
  expect(await result.current.mutate("unmounted")).toEqual({ status: "cancelled" });
  expect(execute).toHaveBeenCalledTimes(2);
});

test("reset during a pending write clears state and cancels its eventual outcome", async () => {
  const pending = deferred<string>();
  const execute = vi
    .fn<(input: string, signal: AbortSignal) => Promise<string>>()
    .mockReturnValue(pending.promise);
  const { result } = renderHook(() => useMutation({ execute }));
  let operation!: Promise<MutationOutcome<string>>;
  act(() => {
    operation = result.current.mutate("write");
  });
  act(() => result.current.reset());
  await act(async () => expect(await operation).toEqual({ status: "cancelled" }));
  await act(async () => {
    pending.resolve("late");
    await pending.promise;
  });
  expect(result.current).toMatchObject({ status: "idle", data: undefined });
});
