/** @vitest-environment happy-dom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthActions } from "./hooks.js";
import { createAuthClient } from "better-auth/react";

type AuthResponse = { error: null | { code?: string; message?: string; status?: number } };

function clientFixture() {
  const action = () =>
    vi.fn<(...args: unknown[]) => Promise<AuthResponse>>().mockResolvedValue({ error: null });
  return {
    signIn: { email: action() },
    signUp: { email: action() },
    requestPasswordReset: action(),
    resetPassword: action(),
    sendVerificationEmail: action(),
    signOut: action(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function actions(client = clientFixture()) {
  return {
    client,
    ...renderHook(() => useAuthActions({ client, webUrl: "https://raypx.example", locale: "zh" })),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("shared authentication actions", () => {
  it.each([
    ["X-Retry-After", "90", 90],
    ["Retry-After", "120", 120],
    ["Retry-After", "Mon, 02 Nov 2026 12:01:30 GMT", 90],
    ["X-Retry-After", "invalid", undefined],
  ])("reads %s=%s through the real Better Auth client", async (header, value, seconds) => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 2, 12));
    const client = createAuthClient({
      baseURL: "https://raypx.example",
      fetchOptions: {
        customFetchImpl: async () =>
          Response.json(
            { message: "private diagnostic" },
            {
              status: 429,
              headers: { [header]: value },
            },
          ),
      },
    });
    const { result } = renderHook(() =>
      useAuthActions({ client, webUrl: "https://raypx.example" }),
    );
    await act(async () => {
      await result.current.requestPasswordReset({ email: "user@example.test" });
    });
    expect(result.current.error).toEqual({
      kind: "auth",
      key: "rateLimited",
      ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
    });
  });
  it("normalizes identity fields and keeps credentials, language and verification links intact", async () => {
    const { result, client } = actions();
    await act(async () => {
      await result.current.signIn({ email: " ada@example.test ", password: " password " });
      await result.current.signUp({
        name: " Ada ",
        email: " ada@example.test ",
        password: " new password ",
      });
      await result.current.sendVerificationEmail({ email: " ada@example.test " });
    });
    const fetchOptions = { headers: { "Accept-Language": "zh" } };
    expect(client.signIn.email).toHaveBeenCalledWith({
      email: "ada@example.test",
      password: " password ",
      fetchOptions,
    });
    expect(client.signUp.email).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.test",
      password: " new password ",
      callbackURL: "https://raypx.example/verify-email?verified=1",
      fetchOptions,
    });
    expect(client.sendVerificationEmail).toHaveBeenCalledWith({
      email: "ada@example.test",
      callbackURL: "https://raypx.example/verify-email?verified=1",
      fetchOptions: { ...fetchOptions, onError: expect.any(Function) },
    });
  });

  it("sends reset links to Web and submits the token with the unmodified replacement password", async () => {
    const { result, client } = actions();
    await act(async () => {
      await result.current.requestPasswordReset({ email: " ada@example.test " });
      await result.current.resetPassword({ token: "reset-token", newPassword: " replacement " });
    });
    const fetchOptions = { headers: { "Accept-Language": "zh" } };
    expect(client.requestPasswordReset).toHaveBeenCalledWith({
      email: "ada@example.test",
      redirectTo: "https://raypx.example/reset-password",
      fetchOptions: { ...fetchOptions, onError: expect.any(Function) },
    });
    expect(client.resetPassword).toHaveBeenCalledWith({
      token: "reset-token",
      newPassword: " replacement ",
      fetchOptions,
    });
  });

  it("ignores concurrent actions from the same tick until the success callback finishes", async () => {
    const client = clientFixture();
    const request = deferred<AuthResponse>();
    const completion = deferred<void>();
    client.signOut.mockReturnValueOnce(request.promise);
    const onSuccess = vi.fn(() => completion.promise);
    const { result } = actions(client);
    let pending!: ReturnType<typeof result.current.signOut>;
    await act(async () => {
      pending = result.current.signOut(onSuccess);
      expect(await result.current.signOut(onSuccess)).toEqual({ status: "ignored" });
    });
    expect(result.current.busy).toBe(true);
    expect(client.signOut).toHaveBeenCalledTimes(1);
    await act(async () => {
      request.resolve({ error: null });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(result.current.busy).toBe(true);
    await act(async () => {
      expect(
        await result.current.signIn({ email: "ada@example.test", password: "password" }),
      ).toEqual({
        status: "ignored",
      });
    });
    expect(client.signIn.email).not.toHaveBeenCalled();
    await act(async () => {
      completion.resolve();
      expect(await pending).toEqual({ status: "success" });
    });
    expect(result.current.busy).toBe(false);
  });

  it("keeps server failures out of success callbacks and clears the error for a new attempt", async () => {
    const client = clientFixture();
    client.signIn.email.mockResolvedValueOnce({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const onSuccess = vi.fn();
    const { result } = actions(client);
    await act(async () => {
      expect(
        await result.current.signIn(
          { email: "ada@example.test", password: "incorrect" },
          onSuccess,
        ),
      ).toEqual({
        status: "error",
        error: { kind: "auth", key: "invalidCredentials" },
      });
    });
    expect(result.current.error).toEqual({ kind: "auth", key: "invalidCredentials" });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    const next = deferred<AuthResponse>();
    client.signIn.email.mockReturnValueOnce(next.promise);
    let pending!: ReturnType<typeof result.current.signIn>;
    act(() => {
      pending = result.current.signIn(
        { email: "ada@example.test", password: "correct" },
        onSuccess,
      );
    });
    expect(result.current.error).toBeNull();
    await act(async () => {
      next.resolve({ error: null });
      expect(await pending).toEqual({ status: "success" });
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("contains rejected requests and lets consumers dismiss the safe network error", async () => {
    const client = clientFixture();
    client.signOut.mockRejectedValueOnce(new Error("private transport diagnostic"));
    const onSuccess = vi.fn();
    const { result } = actions(client);
    await act(async () => {
      expect(await result.current.signOut(onSuccess)).toEqual({
        status: "error",
        error: { kind: "network" },
      });
    });
    expect(result.current.error).toEqual({ kind: "network" });
    expect(result.current.busy).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("does not refresh account state when sign-out returns a server error", async () => {
    const client = clientFixture();
    client.signOut.mockResolvedValueOnce({ error: { code: "INTERNAL_SERVER_ERROR" } });
    const onSuccess = vi.fn();
    const { result } = actions(client);
    await act(async () => {
      expect(await result.current.signOut(onSuccess)).toEqual({
        status: "error",
        error: { kind: "auth", key: "generic" },
      });
    });
    expect(result.current.busy).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("reports a failed completion without repeating the successful auth request", async () => {
    const { result, client } = actions();
    const onSuccess = vi.fn().mockRejectedValue(new Error("loader refresh failed"));
    await act(async () => {
      expect(await result.current.signOut(onSuccess)).toEqual({
        status: "error",
        error: { kind: "completion" },
      });
    });
    expect(result.current.error).toEqual({ kind: "completion" });
    expect(result.current.busy).toBe(false);
    expect(client.signOut).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    onSuccess.mockResolvedValueOnce(undefined);
    await act(async () => {
      expect(await result.current.retryCompletion()).toEqual({ status: "success" });
      expect(await result.current.retryCompletion()).toEqual({ status: "ignored" });
    });
    expect(client.signOut).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it.each([
    ["PASSWORD_TOO_LONG", "passwordLong"],
    ["INVALID_NAME", "invalidName"],
  ])("maps %s to safe feedback", async (code, key) => {
    const { result, client } = actions();
    client.signUp.email.mockResolvedValueOnce({ error: { code } });
    await act(async () => {
      await result.current.signUp({
        name: "Name",
        email: "user@example.test",
        password: "password",
      });
    });
    expect(result.current.error).toEqual({ kind: "auth", key });
  });

  it.each([
    { status: 429 },
    { status: 429, code: "INVALID_EMAIL_OR_PASSWORD" },
    { code: "TOO_MANY_REQUESTS" },
  ])("normalizes a rate-limit response %j", async (error) => {
    const { result, client } = actions();
    client.requestPasswordReset.mockResolvedValueOnce({
      error: { ...error, message: "private diagnostic" },
    });
    await act(async () => {
      await result.current.requestPasswordReset({ email: "user@example.test" });
    });
    expect(result.current.error).toEqual({ kind: "auth", key: "rateLimited" });
  });

  it("reduces unknown server errors to a safe key without exposing diagnostic text", async () => {
    const client = clientFixture();
    client.signIn.email.mockResolvedValueOnce({
      error: { code: "INTERNAL_PRIVATE_FAILURE", message: "private server diagnostic" },
    });
    const { result } = actions(client);
    await act(async () => {
      expect(
        await result.current.signIn({ email: "ada@example.test", password: "password" }),
      ).toEqual({
        status: "error",
        error: { kind: "auth", key: "generic" },
      });
    });
    expect(result.current.error).toEqual({ kind: "auth", key: "generic" });
  });
});
