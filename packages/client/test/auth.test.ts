import { afterEach, expect, test, vi } from "vite-plus/test";
import { signIn, signUp, signOut, getCurrentUser } from "../src/auth.js";

afterEach(() => vi.unstubAllGlobals());
const user = { id: "42", name: "Alice", email: "alice@example.com", emailVerified: false };

test("account clients project responses and send validated same-origin writes once", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json({ user, token: "private-token" }));
  vi.stubGlobal("fetch", fetch);
  const account = await signUp({ name: " Alice ", email: user.email, password: "valid-password" });
  expect(account).toEqual({ user: { ...user, image: null } });
  expect(fetch).toHaveBeenCalledWith(
    "/api/auth/sign-up/email",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: user.email, password: "valid-password", name: "Alice" }),
    }),
  );
  fetch.mockResolvedValueOnce(Response.json({ user }));
  expect(await signIn({ email: user.email, password: "valid-password" })).toEqual(account);
  fetch.mockResolvedValueOnce(Response.json({ success: true }));
  expect(await signOut()).toEqual({ success: true });
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("invalid credentials fail before fetch and protected reads preserve typed failures", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      Response.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  expect(() => signIn({ email: "bad-email", password: "short" })).toThrow(
    "Invalid account details",
  );
  expect(fetch).not.toHaveBeenCalled();
  await expect(getCurrentUser()).rejects.toMatchObject({
    kind: "http",
    code: "UNAUTHORIZED",
    status: 401,
  });
});
