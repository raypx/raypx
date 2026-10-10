// @vitest-environment jsdom
import { checkHealth } from "../../src/health.js";
import { useHealthCheck } from "../../src/react/health.js";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { ClientProvider } from "../../src/react/provider.js";
import { createClientWrapper } from "./helpers.js";

vi.mock("../../src/health.js", () => ({ checkHealth: vi.fn<typeof checkHealth>() }));

const checkHealthMock = vi.mocked(checkHealth);
type HealthResponse = Awaited<ReturnType<typeof checkHealth>>;
const healthyResponse: HealthResponse = { status: "ok", service: "raypx-api" };
let provider: ReturnType<typeof createClientWrapper>;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function requestSignal(index = 0) {
  const signal = checkHealthMock.mock.calls[index]?.[0]?.signal;
  if (!signal) throw new Error("Health checks must receive an AbortSignal");
  return signal;
}

beforeEach(() => {
  checkHealthMock.mockReset();
  provider = createClientWrapper();
});

afterEach(() => {
  cleanup();
  provider.client.clear();
});

test("renders the loading state on the server without sending a request", () => {
  function HealthStatus() {
    const { status } = useHealthCheck();
    return <output>{status}</output>;
  }

  expect(
    renderToString(
      <ClientProvider client={provider.client}>
        <HealthStatus />
      </ClientProvider>,
    ),
  ).toContain("loading");
  expect(checkHealthMock).not.toHaveBeenCalled();
});

test("stays loading while the connection check is pending", () => {
  const pending = deferred<HealthResponse>();
  checkHealthMock.mockReturnValue(pending.promise);

  const { result } = renderHook(() => useHealthCheck(), { wrapper: provider.wrapper });

  expect(result.current.status).toBe("loading");
  expect(checkHealthMock).toHaveBeenCalledOnce();
  expect(requestSignal().aborted).toBe(false);
});

test("shows a connected state once the health check succeeds", async () => {
  const pending = deferred<HealthResponse>();
  checkHealthMock.mockReturnValue(pending.promise);
  const { result } = renderHook(() => useHealthCheck(), { wrapper: provider.wrapper });

  await act(async () => {
    pending.resolve(healthyResponse);
    await pending.promise;
  });

  await waitFor(() => expect(result.current.status).toBe("connected"));
});

test("shows an error state when the health check fails", async () => {
  checkHealthMock.mockRejectedValue(new Error("HTTP 503"));
  const { result } = renderHook(() => useHealthCheck(), { wrapper: provider.wrapper });

  await waitFor(() => expect(result.current.status).toBe("error"));
});

test("retrying a failed connection starts a new request and can recover", async () => {
  const nextRequest = deferred<HealthResponse>();
  checkHealthMock
    .mockRejectedValueOnce(new Error("HTTP 503"))
    .mockReturnValueOnce(nextRequest.promise);
  const { result } = renderHook(() => useHealthCheck(), { wrapper: provider.wrapper });
  await waitFor(() => expect(result.current.status).toBe("error"));
  const firstSignal = requestSignal();

  await act(async () => result.current.retry());

  await waitFor(() => expect(result.current.status).toBe("loading"));
  expect(checkHealthMock).toHaveBeenCalledTimes(2);
  // Query owns request lifetimes: a completed failure need not abort its signal.
  expect(firstSignal.aborted).toBe(false);
  expect(requestSignal(1).aborted).toBe(false);

  await act(async () => {
    nextRequest.resolve(healthyResponse);
    await nextRequest.promise;
  });

  await waitFor(() => expect(result.current.status).toBe("connected"));
});

test("allows checking the connection again after a successful request", async () => {
  const nextRequest = deferred<HealthResponse>();
  checkHealthMock.mockResolvedValueOnce(healthyResponse).mockReturnValueOnce(nextRequest.promise);
  const { result } = renderHook(() => useHealthCheck(), { wrapper: provider.wrapper });
  await waitFor(() => expect(result.current.status).toBe("connected"));

  await act(async () => result.current.retry());

  await waitFor(() => expect(result.current.status).toBe("loading"));
  expect(checkHealthMock).toHaveBeenCalledTimes(2);

  await act(async () => {
    nextRequest.reject(new TypeError("Failed to fetch"));
    await nextRequest.promise.catch(() => undefined);
  });

  await waitFor(() => expect(result.current.status).toBe("error"));
});

test("does not start a duplicate request while the check is loading", async () => {
  const pending = deferred<HealthResponse>();
  checkHealthMock.mockReturnValue(pending.promise);
  const { result } = renderHook(() => useHealthCheck(), { wrapper: provider.wrapper });
  const signal = requestSignal();

  await act(async () => result.current.retry());

  expect(checkHealthMock).toHaveBeenCalledOnce();
  expect(result.current.status).toBe("loading");
  expect(signal.aborted).toBe(false);
});

test("cancels a pending check when its consumer unmounts", () => {
  const pending = deferred<HealthResponse>();
  checkHealthMock.mockReturnValue(pending.promise);
  const { unmount } = renderHook(() => useHealthCheck(), { wrapper: provider.wrapper });
  const signal = requestSignal();

  unmount();

  expect(signal.aborted).toBe(true);
});

test("ignores a late result from the cancelled Strict Mode request", async () => {
  const staleRequest = deferred<HealthResponse>();
  const currentRequest = deferred<HealthResponse>();
  checkHealthMock
    .mockReturnValueOnce(staleRequest.promise)
    .mockReturnValueOnce(currentRequest.promise);
  const { result } = renderHook(() => useHealthCheck(), {
    reactStrictMode: true,
    wrapper: provider.wrapper,
  });

  expect(checkHealthMock).toHaveBeenCalledTimes(2);
  expect(requestSignal().aborted).toBe(true);

  await act(async () => {
    currentRequest.reject(new Error("HTTP 503"));
    await currentRequest.promise.catch(() => undefined);
  });
  await waitFor(() => expect(result.current.status).toBe("error"));

  await act(async () => {
    staleRequest.resolve(healthyResponse);
    await staleRequest.promise;
  });

  expect(result.current.status).toBe("error");
});
