import { expect, it } from "vite-plus/test";
import { serverOrigin, sessionStoragePrefix } from "./config.ts";
import { sessionAccess } from "./session-policy.ts";

const now = Date.parse("2026-11-02T00:00:00Z");
const session = {
  user: { emailVerified: true },
  session: { expiresAt: new Date(now + 60_000) },
};
const state = { isPending: false, isRefetching: false, error: null, data: session };

it("blocks protected routes during restoration and revalidation even with stale session data", () => {
  expect(sessionAccess({ ...state, isPending: true }, now)).toBe("pending");
  expect(sessionAccess({ ...state, isRefetching: true }, now)).toBe("pending");
  expect(sessionAccess({ ...state, error: new Error("offline") }, now)).toBe("unavailable");
});

it("requires a verified unexpired session and removes access after logout or expiry", () => {
  expect(sessionAccess(state, now)).toBe("signedIn");
  expect(sessionAccess({ ...state, data: null }, now)).toBe("signedOut");
  expect(sessionAccess({ ...state, error: { status: 401 } }, now)).toBe("signedOut");
  expect(sessionAccess(state, now + 60_000)).toBe("signedOut");
  expect(
    sessionAccess({ ...state, data: { ...session, user: { emailVerified: false } } }, now),
  ).toBe("signedOut");
  expect(
    sessionAccess({ ...state, data: { ...session, session: { expiresAt: "invalid" } } }, now),
  ).toBe("signedOut");
});

it("isolates secure session storage by server origin without lossy key collisions", () => {
  expect(sessionStoragePrefix("https://a-b.test")).not.toBe(
    sessionStoragePrefix("https://a.b.test"),
  );
  expect(sessionStoragePrefix("https://raypx.com")).toMatch(/^[a-zA-Z0-9._-]+$/);
});

it("rejects insecure origins, credentials and paths before sending credentials", () => {
  expect(serverOrigin("https://raypx.com/")).toBe("https://raypx.com");
  for (const url of [
    "http://raypx.com",
    "https://user:secret@raypx.com",
    "https://raypx.com/api",
    "https://raypx.com?key=value",
    "https://raypx.com#fragment",
  ])
    expect(() => serverOrigin(url)).toThrow("EXPO_PUBLIC_API_URL must be an HTTPS origin");
});
