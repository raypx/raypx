/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useAuthActions } from "@raypx/auth/hooks";

type AuthResponse = { error: null | { code?: string; message?: string } };

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

afterEach(cleanup);

describe("shared authentication actions", () => {
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
      fetchOptions,
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
      fetchOptions,
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
