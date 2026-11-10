import { expect, it, vi } from "vite-plus/test";
import { parseSessionCookie, SessionCookies } from "./cookies.ts";

const origin = new URL("https://api.example.test");
const now = Date.parse("2026-11-10T00:00:00Z");
const cookie = (value = "private", attributes = "") =>
  parseSessionCookie(
    origin,
    `__Secure-better-auth.session_token=${value}; Secure; HttpOnly; ${attributes.includes("Path=") ? "" : "Path=/;"} ${attributes}`,
    now,
  )!;

it("constrains auth cookies to the selected host and honors Max-Age before Expires", () => {
  expect(
    cookie(
      "opaque",
      "Domain=.example.test; SameSite=Lax; Expires=Wed, 11 Nov 2026 00:00:00 GMT; Max-Age=0",
    ),
  ).toMatchObject({
    cookie: { domain: "api.example.test", sameSite: "lax", expires: now / 1000 },
    remove: true,
  });
  expect(parseSessionCookie(origin, "unrelated=value; Path=/")).toBeUndefined();
  expect(parseSessionCookie(origin, "not-a-cookie")).toBeUndefined();
});

it.each([
  'better-auth.session_token=quoted"; Secure; HttpOnly',
  "better-auth.session_token=bad value; Secure; HttpOnly",
  "better-auth.session_token=value; HttpOnly",
  "better-auth.session_token=value; Secure",
  "better-auth.session_token=value; Secure; HttpOnly; Domain=evil.test",
  "better-auth.session_token=value; Secure; HttpOnly; Path=/other",
  "better-auth.session_token=value; Secure; HttpOnly; Path=/api/x?y",
  "better-auth.session_token=value; Secure; HttpOnly; Max-Age=9007199254740992",
  "better-auth.session_token=value; Secure; HttpOnly; Max-Age=1.5",
  "better-auth.session_token=value; Secure; HttpOnly; SameSite=invalid",
  "better-auth.session_token=value; Secure; HttpOnly; Expires=invalid",
  "better-auth.session_token=value; Secure; HttpOnly; Path=/; Path=/api/",
  "better-auth.session_token=value\r\nmalicious: true; Secure; HttpOnly",
])("rejects malformed auth attributes: %s", (raw) => {
  expect(() => parseSessionCookie(origin, raw, now)).toThrow("Invalid API session cookie");
});

it("persists only durable cookies and respects path boundaries, secure transport and expiry", () => {
  const save = vi.fn();
  let time = now;
  const jar = new SessionCookies(origin.origin, { load: () => undefined, save }, () => time);
  jar.apply(
    [cookie("session"), cookie("durable", "Max-Age=60; Path=/api/auth")].map((entry, index) => {
      // Use a different name so both session and persistent cookies coexist.
      if (index === 1) entry.cookie.name = "__Secure-better-auth.session_data";
      return entry;
    }),
  );
  const saved = JSON.parse(new TextDecoder().decode(save.mock.calls[0]![0]));
  expect(saved).toMatchObject({ version: 1, cookies: [{ value: "durable" }] });
  expect(saved.cookies).toHaveLength(1);
  expect(jar.header(new URL("/api/auth/get-session", origin))).toContain("durable");
  expect(jar.header(new URL("/api/authentic", origin))).not.toContain("durable");
  expect(() => jar.header(new URL("https://other.example.test/"))).toThrow("origin");
  time += 61_000;
  expect(jar.header(new URL("/api/auth/get-session", origin))).not.toContain("durable");
  jar.apply([cookie("", "Max-Age=0")]);
  expect(jar.header(origin)).toBe("");
  expect(save.mock.calls.at(-1)![0]).toBeUndefined();
});

it("preserves unreadable rows in memory mode and poisons all transport after a runtime write fails", () => {
  const save = vi.fn(() => {
    throw new Error("private storage detail");
  });
  const temporary = new SessionCookies(
    origin.origin,
    {
      load: () => {
        throw new Error("key unavailable");
      },
      save,
    },
    () => now,
  );
  expect(temporary.recovery).toBe("temporary");
  temporary.apply([cookie("memory", "Max-Age=60")]);
  expect(temporary.header(origin)).toContain("memory");
  expect(save).not.toHaveBeenCalled();
  const durable = new SessionCookies(origin.origin, { load: () => undefined, save }, () => now);
  expect(() => durable.apply([cookie("fail", "Max-Age=60")])).toThrow("restart required");
  expect(() => durable.header(origin)).toThrow("restart required");
  expect(() => durable.apply([])).toThrow("restart required");
});

it("rejects future stored versions and preserves malformed current rows without rewriting them", () => {
  const save = vi.fn();
  const load = (value: unknown) => () => new TextEncoder().encode(JSON.stringify(value));
  expect(
    () => new SessionCookies(origin.origin, { load: load({ version: 2, cookies: [] }), save }),
  ).toThrow("Unsupported");
  const jar = new SessionCookies(origin.origin, {
    load: load({ version: 1, cookies: ["invalid"] }),
    save,
  });
  expect(jar.recovery).toBe("temporary");
  jar.apply([cookie("new")]);
  expect(save).not.toHaveBeenCalled();
});
