import { expect, it, vi } from "vite-plus/test";
import apiCases from "../../../../fixtures/desktop/api-paths.json";
import cookieCases from "../../../../fixtures/desktop/cookies.json";
import localCases from "../../../../fixtures/desktop/local-methods.json";
import accountCases from "../../../../fixtures/desktop/account-scopes.json";
import { localResults } from "@raypx/contracts/local-client";
import { DesktopApi } from "../../../../../src/runtime/daemon/desktop/api.ts";
import {
  SessionCookies,
  parseSessionCookie,
} from "../../../../../src/runtime/daemon/desktop/cookies.ts";
import { DesktopControl } from "../../../../../src/runtime/daemon/desktop/control.ts";
import { startOrpcFixture } from "../../../../fixtures/desktop/orpc-server.ts";
const origin = "https://api.example.test";
const signal = () => new AbortController().signal;
it.each(apiCases)("preserves HTTP admission for $input.path", async (row) => {
  const fetch = vi.fn(async () => Response.json({ json: {} }));
  const api = new DesktopApi(new SessionCookies(origin), fetch);
  const accepted = await api.request(row.input, "fixture", signal(), row.native).then(
    () => true,
    () => false,
  );
  expect(accepted).toBe(row.allowed);
  expect(fetch).toHaveBeenCalledTimes(row.allowed ? 1 : 0);
});
it.each(cookieCases.filter((row) => row.outcome === "error"))(
  "rejects cookie fixture $raw",
  (row) => {
    expect(() => parseSessionCookie(new URL(origin), row.raw, 1_000_000)).toThrow(
      "Invalid API session cookie",
    );
  },
);
it.each(cookieCases.filter((row) => row.outcome === "ignore"))(
  "ignores cookie fixture $raw",
  (row) => {
    expect(parseSessionCookie(new URL(origin), row.raw, 1_000_000)).toBeUndefined();
  },
);
it.each(cookieCases.filter((row) => row.outcome === "set" || row.outcome === "remove"))(
  "projects cookie fixture $raw",
  (row) => {
    const change = parseSessionCookie(new URL(origin), row.raw, 1_000_000);
    expect(change?.remove === true).toBe(row.outcome === "remove");
    expect(change?.cookie).toMatchObject("expected" in row ? row.expected : {});
  },
);
it.each(localCases)(
  "admits renderer method $method according to the authoritative schema",
  (row) => {
    expect(Object.hasOwn(localResults, row.method)).toBe(row.allowed);
  },
);
it.each(accountCases.filter((row) => "invalid" in row))(
  "rejects another local owner $input.accountId",
  async (row) => {
    const request = vi.fn(async () => []);
    const control = new DesktopControl(new DesktopApi(new SessionCookies(origin)), { request }, {});
    await expect(
      control.localRequest({ method: "agents.local.list", params: row.input }, "fixture", signal()),
    ).rejects.toThrow(/Invalid|accountId/);
    expect(request).not.toHaveBeenCalled();
  },
);
it.each(accountCases.filter((row) => "expected" in row))(
  "preserves the device owner $input.accountId",
  async (row) => {
    const request = vi.fn(async (_method: string, _params: unknown) => []);
    const control = new DesktopControl(new DesktopApi(new SessionCookies(origin)), { request }, {});
    await control.localRequest(
      { method: "agents.local.list", params: row.input },
      "fixture",
      signal(),
    );
    expect(request.mock.calls.at(-1)?.[1]).toEqual(row.expected);
  },
);
it("injects the configured enrollment origin and connector directories", async () => {
  const request = vi.fn(async (_method: string, _params: unknown) => {
    throw new Error("captured");
  });
  const control = new DesktopControl(
    new DesktopApi(new SessionCookies(origin)),
    { request },
    { codex: "/native/codex" },
  );
  await expect(
    control.localRequest(
      { method: "instance.begin", params: { origin: "https://evil.test" } },
      "fixture",
      signal(),
    ),
  ).rejects.toThrow("captured");
  expect(request.mock.calls.at(-1)?.[1]).toMatchObject({ origin });
  await expect(
    control.localRequest(
      { method: "connectors.status", params: { configDirs: { codex: "/attacker" } } },
      "fixture",
      signal(),
    ),
  ).rejects.toThrow("captured");
  expect(request.mock.calls.at(-1)?.[1]).toMatchObject({ configDirs: { codex: "/native/codex" } });
});
it("interoperates with the real oRPC serializer and hides server errors and restricted authorization", async () => {
  const server = startOrpcFixture();
  const api = new DesktopApi(new SessionCookies(server.url.origin));
  try {
    expect(await api.rpc("account.get", {}, signal())).toMatchObject({ authenticated: false });
    expect(await api.rpc("account.get", {}, signal())).toMatchObject({ authenticated: true });
    const grant = (await api.rpc(
      "hosts.authorize",
      { deviceId: "fixture-device", epoch: 1 },
      signal(),
    )) as { credential: string };
    expect(await api.rpc("hosts.revoke", { credential: grant.credential }, signal())).toEqual({
      revoked: true,
    });
    for (const [deviceId, code] of [
      ["unauthorized", "AUTH_REQUIRED"],
      ["not-found", "NOT_FOUND"],
      ["forbidden", "FORBIDDEN"],
      ["legacy", "INVALID_API_RESPONSE"],
      ["redirect", "INVALID_API_RESPONSE"],
    ])
      await expect(api.rpc("hosts.authorize", { deviceId }, signal())).rejects.toMatchObject({
        code,
      });
    for (const mode of ["date", "forged-error"])
      await expect(api.rpc("account.get", { mode }, signal())).rejects.not.toThrow(
        "private-server-detail",
      );
    await expect(
      api.request(
        { path: "/rpc/hosts/authorize", method: "POST", headers: {}, body: "{}" },
        "page",
        signal(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_API_REQUEST" });
  } finally {
    await server.stop(true);
  }
});
