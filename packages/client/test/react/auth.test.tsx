// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { signIn, signOut, signUp } from "../../src/auth.js";
import { getSession } from "../../src/session.js";
import { useSignIn, useSignOut, useSignUp } from "../../src/react/auth.js";
import { accountQueryKey, sessionQueryOptions } from "../../src/react/query.js";
import { useSession } from "../../src/react/session.js";
import { createClientWrapper, deferred } from "./helpers.js";

vi.mock("../../src/auth.js", () => ({
  signIn: vi.fn<typeof signIn>(),
  signOut: vi.fn<typeof signOut>(),
  signUp: vi.fn<typeof signUp>(),
}));
vi.mock("../../src/session.js", () => ({ getSession: vi.fn<typeof getSession>() }));
const oldUser = {
  id: "old",
  name: "Old",
  email: "old@example.com",
  emailVerified: true,
  image: null,
};
const newUser = {
  id: "new",
  name: "New",
  email: "new@example.com",
  emailVerified: true,
  image: null,
};
const credentials = { email: "new@example.com", password: "test-password" };
beforeEach(() => {
  vi.mocked(signIn).mockReset();
  vi.mocked(signOut).mockReset();
  vi.mocked(signUp).mockReset();
  vi.mocked(getSession).mockReset();
});
afterEach(cleanup);

test("sign-in cancels private/session reads, removes account caches and synchronizes every session scope", async () => {
  vi.mocked(signIn).mockResolvedValue({ user: newUser });
  const privateRead = deferred<string>();
  const sessionRead = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(getSession).mockReturnValue(sessionRead.promise);
  const provider = createClientWrapper();
  provider.client.setQueryData(accountQueryKey("old", "profile"), "old-private");
  provider.client.setQueryData(["public", "status"], "public-data");
  provider.client.setQueryData(sessionQueryOptions().queryKey, { user: oldUser });
  let privateSignal: AbortSignal | undefined;
  const privateRequest = provider.client
    .query({
      queryKey: accountQueryKey("old", "pending"),
      queryFn: ({ signal }) => {
        privateSignal = signal;
        return privateRead.promise;
      },
    })
    .catch((error: unknown) => error);
  const oldSessionRequest = provider.client
    .query(sessionQueryOptions("old-scope"))
    .catch((error: unknown) => error);
  const { result } = renderHook(() => ({ auth: useSignIn(), session: useSession() }), {
    wrapper: provider.wrapper,
  });
  await act(async () => {
    await result.current.auth.mutateAsync(credentials);
  });
  expect(privateSignal?.aborted).toBe(true);
  expect(vi.mocked(getSession).mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
  expect(provider.client.getQueryData(accountQueryKey("old", "profile"))).toBeUndefined();
  expect(provider.client.getQueryData(accountQueryKey("old", "pending"))).toBeUndefined();
  expect(provider.client.getQueryData(["public", "status"])).toBe("public-data");
  expect(provider.client.getQueryData(sessionQueryOptions("old-scope").queryKey)).toEqual({
    user: newUser,
  });
  await waitFor(() => expect(result.current.session.data?.user?.id).toBe("new"));
  privateRead.resolve("late-private");
  sessionRead.resolve({ user: oldUser });
  await Promise.all([privateRequest, oldSessionRequest]);
  expect(provider.client.getQueryData(accountQueryKey("old", "pending"))).toBeUndefined();
  expect(result.current.session.data?.user?.id).toBe("new");
});

test("failed authentication never retries or clears a valid account's data", async () => {
  const failure = new Error("denied");
  vi.mocked(signIn).mockRejectedValue(failure);
  const provider = createClientWrapper();
  provider.client.setQueryData(accountQueryKey("old", "profile"), "private");
  provider.client.setQueryData(sessionQueryOptions().queryKey, { user: oldUser });
  const { result } = renderHook(() => useSignIn(), { wrapper: provider.wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync(credentials)).rejects.toBe(failure);
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(signIn).toHaveBeenCalledOnce();
  expect(provider.client.getQueryData(accountQueryKey("old", "profile"))).toBe("private");
  expect(provider.client.getQueryData(sessionQueryOptions().queryKey)).toEqual({ user: oldUser });
});

test("sign-out publishes anonymous data while preserving unrelated public queries", async () => {
  vi.mocked(signOut).mockResolvedValue({ success: true });
  const provider = createClientWrapper();
  provider.client.setQueryData(accountQueryKey("old", "messages"), ["private"]);
  provider.client.setQueryData(["health"], { status: "ok", service: "raypx-api" });
  provider.client.setQueryData(sessionQueryOptions().queryKey, { user: oldUser });
  const { result } = renderHook(() => ({ auth: useSignOut(), session: useSession() }), {
    wrapper: provider.wrapper,
  });
  await act(async () => {
    await result.current.auth.mutateAsync();
  });
  await waitFor(() => expect(result.current.session.data?.user).toBeNull());
  expect(provider.client.getQueryData(accountQueryKey("old", "messages"))).toBeUndefined();
  expect(provider.client.getQueryData(["health"])).toEqual({ status: "ok", service: "raypx-api" });
});

test("sign-up checks the actual session instead of treating an unverified account as signed in", async () => {
  vi.mocked(signUp).mockResolvedValue({ user: newUser });
  vi.mocked(getSession).mockResolvedValue({ user: null });
  const provider = createClientWrapper();
  provider.client.setQueryData(accountQueryKey("old", "profile"), "private");
  const { result } = renderHook(() => useSignUp(), { wrapper: provider.wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync({ ...credentials, name: "New" })).resolves.toEqual({
      user: newUser,
    });
  });
  expect(getSession).toHaveBeenCalledOnce();
  expect(provider.client.getQueryData(sessionQueryOptions().queryKey)).toEqual({ user: null });
  expect(provider.client.getQueryData(accountQueryKey("old", "profile"))).toBeUndefined();
});

test("a failed post-signup session read is retryable without resubmitting the accepted creation", async () => {
  vi.mocked(signUp).mockResolvedValue({ user: newUser });
  vi.mocked(getSession)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ user: newUser });
  const provider = createClientWrapper();
  provider.client.setQueryData(sessionQueryOptions().queryKey, { user: oldUser });
  const { result } = renderHook(() => ({ auth: useSignUp(), session: useSession() }), {
    wrapper: provider.wrapper,
  });
  await act(async () => {
    await result.current.auth.mutateAsync({ ...credentials, name: "New" });
  });
  await waitFor(() => expect(result.current.auth.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.session.status).toBe("error"));
  expect(result.current.session.data?.user).toBeNull();
  act(() => result.current.session.retry());
  await waitFor(() => expect(result.current.session.data?.user?.id).toBe("new"));
  expect(signUp).toHaveBeenCalledOnce();
  expect(getSession).toHaveBeenCalledTimes(2);
});

test("a scoped consumer can retry a failed post-signup read and restore all session scopes together", async () => {
  const failure = new Error("offline");
  const retry = deferred<Awaited<ReturnType<typeof getSession>>>();
  vi.mocked(signUp).mockResolvedValue({ user: newUser });
  vi.mocked(getSession).mockRejectedValueOnce(failure).mockReturnValueOnce(retry.promise);
  const provider = createClientWrapper();
  for (const scope of ["current", "sidebar", "settings"]) {
    provider.client.setQueryData(sessionQueryOptions(scope).queryKey, { user: oldUser });
  }
  const { result } = renderHook(
    () => ({
      auth: useSignUp(),
      current: useSession(),
      sidebar: useSession({ key: "sidebar" }),
      settings: useSession({ key: "settings" }),
    }),
    { wrapper: provider.wrapper },
  );
  await act(async () => {
    await result.current.auth.mutateAsync({ ...credentials, name: "New" });
  });
  await waitFor(() => expect(result.current.auth.isSuccess).toBe(true));
  for (const session of [result.current.current, result.current.sidebar, result.current.settings]) {
    expect(session).toMatchObject({ status: "error", data: { user: null }, error: failure });
  }
  expect(getSession).toHaveBeenCalledOnce();
  act(() => result.current.sidebar.retry());
  await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
  await act(async () => retry.resolve({ user: newUser }));
  await waitFor(() => {
    for (const session of [
      result.current.current,
      result.current.sidebar,
      result.current.settings,
    ]) {
      expect(session).toMatchObject({
        status: "success",
        data: { user: newUser },
        error: undefined,
      });
    }
  });
  expect(signUp).toHaveBeenCalledOnce();
  expect(getSession).toHaveBeenCalledTimes(2);
});

test("cookie-changing mutations from different hooks serialize within their shared client", async () => {
  const firstWrite = deferred<Awaited<ReturnType<typeof signIn>>>();
  vi.mocked(signIn).mockReturnValue(firstWrite.promise);
  vi.mocked(signOut).mockResolvedValue({ success: true });
  const provider = createClientWrapper();
  const { result } = renderHook(() => ({ login: useSignIn(), logout: useSignOut() }), {
    wrapper: provider.wrapper,
  });
  let login!: ReturnType<typeof result.current.login.mutateAsync>;
  let logout!: ReturnType<typeof result.current.logout.mutateAsync>;
  act(() => {
    login = result.current.login.mutateAsync(credentials);
    logout = result.current.logout.mutateAsync();
  });
  await waitFor(() => expect(signIn).toHaveBeenCalledOnce());
  expect(signOut).not.toHaveBeenCalled();
  await act(async () => {
    firstWrite.resolve({ user: newUser });
    await Promise.all([login, logout]);
  });
  expect(signOut).toHaveBeenCalledOnce();
  expect(provider.client.getQueryData(sessionQueryOptions().queryKey)).toEqual({ user: null });
});

test("account identity changes clear mounted private results without refetching the old account", async () => {
  vi.mocked(signIn).mockResolvedValue({ user: newUser });
  const loadOldProfile = vi.fn<() => Promise<string>>().mockResolvedValue("old-private");
  const newProfile = deferred<string>();
  const provider = createClientWrapper();
  provider.client.setQueryData(accountQueryKey("old", "profile"), "old-private");
  provider.client.setQueryData(sessionQueryOptions().queryKey, { user: oldUser });
  const { result } = renderHook(
    () => {
      const session = useSession();
      const accountId = session.data?.user?.id;
      return {
        private: useQuery({
          queryKey: accountQueryKey(accountId ?? "anonymous", "profile"),
          enabled: !!accountId,
          queryFn: ({ queryKey }) =>
            queryKey[1] === "old" ? loadOldProfile() : newProfile.promise,
          staleTime: Infinity,
        }),
        auth: useSignIn(),
      };
    },
    { wrapper: provider.wrapper },
  );
  expect(result.current.private.data).toBe("old-private");
  await act(async () => {
    await result.current.auth.mutateAsync(credentials);
  });
  await waitFor(() => expect(result.current.private.data).toBeUndefined());
  expect(loadOldProfile).not.toHaveBeenCalled();
  expect(provider.client.getQueryData(accountQueryKey("old", "profile"))).toBeUndefined();
  await act(async () => newProfile.resolve("new-private"));
  await waitFor(() => expect(result.current.private.data).toBe("new-private"));
});

test("disabled mounted observers also discard their cached private snapshot", async () => {
  vi.mocked(signOut).mockResolvedValue({ success: true });
  const provider = createClientWrapper();
  provider.client.setQueryData(accountQueryKey("old", "profile"), "old-private");
  const load = vi.fn<() => Promise<string>>().mockResolvedValue("old-private");
  const { result } = renderHook(
    () => ({
      private: useQuery({
        queryKey: accountQueryKey("old", "profile"),
        queryFn: load,
        enabled: false,
      }),
      auth: useSignOut(),
    }),
    { wrapper: provider.wrapper },
  );
  expect(result.current.private.data).toBe("old-private");
  await act(async () => {
    await result.current.auth.mutateAsync();
  });
  await waitFor(() => expect(result.current.private.data).toBeUndefined());
  expect(load).not.toHaveBeenCalled();
});

test("successful sign-up publishes the actual newly authenticated session", async () => {
  vi.mocked(signUp).mockResolvedValue({ user: newUser });
  vi.mocked(getSession).mockResolvedValue({ user: newUser });
  const provider = createClientWrapper();
  provider.client.setQueryData(sessionQueryOptions().queryKey, { user: oldUser });
  const { result } = renderHook(() => ({ auth: useSignUp(), session: useSession() }), {
    wrapper: provider.wrapper,
  });
  await act(async () => {
    await result.current.auth.mutateAsync({ ...credentials, name: "New" });
  });
  await waitFor(() => expect(result.current.session.data?.user?.id).toBe("new"));
  expect(getSession).toHaveBeenCalledOnce();
});
