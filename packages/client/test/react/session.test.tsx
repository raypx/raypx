// @vitest-environment jsdom
import { getSession } from "../../src/session.js";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { useSession } from "../../src/react/session.js";
import { createClientWrapper, deferred } from "./helpers.js";

vi.mock("../../src/session.js", () => ({ getSession: vi.fn<typeof getSession>() }));
beforeEach(() => {
  vi.mocked(getSession).mockReset();
});
afterEach(cleanup);

test("anonymous session is successful and disabling clears an authenticated projection", async () => {
  const session = { user: null };
  vi.mocked(getSession).mockResolvedValue(session);
  const { result, rerender } = renderHook(({ enabled }) => useSession({ enabled }), {
    initialProps: { enabled: true },
    wrapper: createClientWrapper().wrapper,
  });
  await waitFor(() => expect(result.current).toMatchObject({ status: "success", data: session }));
  expect(vi.mocked(getSession).mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
  rerender({ enabled: false });
  expect(result.current).toMatchObject({ status: "idle", data: undefined });
});

test("account scope changes do not expose the previous user's data", async () => {
  const next = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession)
    .mockResolvedValueOnce({
      user: { id: "old", name: "Old", email: "old@example.com", emailVerified: true, image: null },
    })
    .mockReturnValueOnce(next.promise);
  const { result, rerender } = renderHook(({ key }) => useSession({ key }), {
    initialProps: { key: "old" },
    wrapper: createClientWrapper().wrapper,
  });
  await waitFor(() => expect(result.current.data?.user?.id).toBe("old"));
  rerender({ key: "new" });
  expect(result.current.data).toBeUndefined();
  await act(async () => {
    next.resolve({ user: null });
    await next.promise;
  });
  await waitFor(() => expect(result.current.data?.user).toBeNull());
});
