import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { ComputerScreenError, type ComputerScreensService } from "@raypx/computers/server";
import type { ComputerScreenState } from "@raypx/core/computers";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { RateLimiter } from "../../rate-limit/types.js";
import { createApiApp } from "../../../tests/helpers/app.js";
import { conversationFixture } from "../../../tests/helpers/conversations.js";

function fixture(rateLimit?: RateLimiter) {
  const base = conversationFixture();
  const resolve = vi.spyOn(base.spaces, "resolve");
  const state: ComputerScreenState = {
    status: "available",
    running: true,
    width: 1024,
    height: 768,
    control: null,
    agentInputPaused: false,
    canForceRelease: true,
  };
  const screens: ComputerScreensService = {
    availability: vi.fn(async () => state),
    start: vi.fn(async () => state),
    stop: vi.fn(async () => state),
    acquire: vi.fn(async () => state),
    renew: vi.fn(async () => state),
    release: vi.fn(async () => state),
    forceRelease: vi.fn(async () => state),
    input: vi.fn(async () => state),
    async *stream() {
      yield { kind: "state", state };
    },
    withAgentInput: async (_scope, _ref, operation) => operation(),
  };
  const app = createApiApp({
    ...base,
    computerScreens: screens,
    allowedOrigins: ["https://web.example.test"],
    ...(rateLimit ? { rateLimit } : {}),
  });
  function client(origin = "https://web.example.test") {
    return createApiClient({
      baseUrl: "https://api.example.test",
      headers: { origin },
      fetch: async (url, init) => app.fetch(new Request(url, init)),
    });
  }
  const viewerId = crypto.randomUUID();
  const grantId = crypto.randomUUID();
  const rpc = client();
  const selection = { spaceId: base.spaceId };
  const changes = (selected = rpc) => [
    () => selected.computers.startScreen(selection),
    () => selected.computers.stopScreen(selection),
    () => selected.computers.acquireControl({ ...selection, viewerId }),
    () => selected.computers.renewControl({ ...selection, grantId }),
    () => selected.computers.releaseControl({ ...selection, grantId }),
    () => selected.computers.forceReleaseControl(selection),
    () =>
      selected.computers.screenInput({
        ...selection,
        grantId,
        input: { kind: "text", text: "typed" },
      }),
  ];
  return { ...base, resolve, screens, client, rpc, selection, viewerId, grantId, changes };
}

it("authorizes every screen procedure from a fresh session and Space membership", async () => {
  const f = fixture();
  expect(await f.rpc.computers.screenAvailability(f.selection)).toMatchObject({
    status: "available",
  });
  for (const request of f.changes()) await request();
  expect(f.resolve).toHaveBeenCalledTimes(8);
  expect(f.screens.acquire).toHaveBeenCalledWith(f.scope, f.viewerId);
  expect(f.screens.input).toHaveBeenCalledWith(f.scope, f.grantId, { kind: "text", text: "typed" });
  f.removeMember();
  for (const request of [() => f.rpc.computers.screenAvailability(f.selection), ...f.changes()])
    await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.screens.availability).toHaveBeenCalledTimes(1);
  expect(f.screens.input).toHaveBeenCalledTimes(1);
  f.signOut();
  for (const request of [() => f.rpc.computers.screenAvailability(f.selection), ...f.changes()])
    await expect(request()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("does not authorize another Space selector and checks Origin before every screen mutation", async () => {
  const f = fixture();
  await expect(
    f.rpc.computers.screenAvailability({ spaceId: spaceIdSchema.parse("foreign") }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.screens.availability).not.toHaveBeenCalled();
  for (const request of f.changes(f.client("https://untrusted.example.test")))
    await expect(request()).rejects.toMatchObject({ code: "FORBIDDEN" });
  for (const method of [
    "start",
    "stop",
    "acquire",
    "renew",
    "release",
    "forceRelease",
    "input",
  ] as const)
    expect(f.screens[method]).not.toHaveBeenCalled();
});

it.each([
  ["SCREEN_UNAVAILABLE", "SERVICE_UNAVAILABLE"],
  ["SCREEN_NOT_RUNNING", "CONFLICT"],
  ["SCREEN_CONTROL_HELD", "CONFLICT"],
  ["SCREEN_CONTROL_REQUIRED", "FORBIDDEN"],
  ["SCREEN_OWNER_REQUIRED", "FORBIDDEN"],
  ["SCREEN_INVALID_INPUT", "BAD_REQUEST"],
] as const)("maps %s to its stable API refusal", async (error, code) => {
  const f = fixture();
  vi.mocked(f.screens.start).mockRejectedValue(new ComputerScreenError(error));
  await expect(f.rpc.computers.startScreen(f.selection)).rejects.toMatchObject({
    code,
    data: { error: { code: error }, requestId: expect.any(String) },
  });
});

it("bounds graphical input and applies the input quota after trusted Origin admission", async () => {
  const rateLimit = vi.fn<RateLimiter>(async () => true);
  const f = fixture(rateLimit);
  const input = {
    ...f.selection,
    grantId: f.grantId,
    input: { kind: "text" as const, text: "hello" },
  };
  expect(await f.rpc.computers.screenInput(input)).toEqual({ accepted: true });
  expect(rateLimit).toHaveBeenLastCalledWith("rpc:member:computers.screenInput", {
    window: 60,
    max: 600,
  });
  rateLimit.mockClear();
  await expect(
    f.client("https://untrusted.example.test").computers.screenInput(input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rateLimit).not.toHaveBeenCalled();
  await expect(
    f.rpc.computers.screenInput({ ...input, input: { kind: "text", text: "x".repeat(4097) } }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    f.rpc.computers.screenInput({
      ...input,
      input: { kind: "pointer", x: 1920, y: 0, action: "move" },
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(f.screens.input).toHaveBeenCalledTimes(1);
  rateLimit.mockResolvedValue(false);
  await expect(f.rpc.computers.screenInput(input)).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
    data: { error: { code: "RATE_LIMITED" } },
  });
  expect(f.screens.input).toHaveBeenCalledTimes(1);
});
