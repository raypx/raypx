import { afterEach, expect, it, vi } from "vitest";
import { ControlService } from "@raypx/control";
import { RelayHub } from "@raypx/control/relay";
import { controlAuth, memoryControlRepository } from "@raypx/control/testing";
import { relayServerSchema, type RelayServerFrame } from "@raypx/contracts/tasks";
import { serveBackend } from "../fixtures/backend-server.js";
import { Hono } from "hono";
import { checkReadiness } from "../../server/app/readiness.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
function fixture(databaseReady: () => Promise<unknown> = async () => {}) {
  const repository = memoryControlRepository();
  const control = new ControlService(repository);
  const hub = new RelayHub(async (use) => use(control));
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok", service: "relay" }));
  app.get("/ready", async (c) => {
    const checks = await checkReadiness({ database: databaseReady });
    const ok = checks.database === "ok";
    return c.json({ status: ok ? "ok" : "unavailable", checks }, ok ? 200 : 503);
  });
  const listener = serveBackend({ hub, app, allowedOrigins: ["https://app.example.test"] });
  let closing: Promise<void> | undefined;
  const server = {
    url: listener.url,
    close: () =>
      (closing ??= (async () => {
        await hub.shutdown();
        await listener.stop(true);
      })()),
  };
  cleanups.push(server.close);
  return { ...server, repository, control, hub, auth: controlAuth() };
}
async function socket(base: URL, role: "viewer" | "device", token: string) {
  const url = new URL("/relay", base);
  url.protocol = "ws:";
  const client = new WebSocket(url),
    frames: RelayServerFrame[] = [],
    closed: number[] = [];
  client.addEventListener("message", (event) =>
    frames.push(relayServerSchema.parse(JSON.parse(String(event.data)))),
  );
  client.addEventListener("close", (event) => closed.push(event.code));
  cleanups.push(async () => {
    client.close();
  });
  await expect.poll(() => client.readyState).toBe(WebSocket.OPEN);
  client.send(JSON.stringify({ type: "auth", protocolVersion: 5, role, token }));
  return { client, frames, closed };
}
it("serves liveness and dependency readiness and exposes no login or local execution route", async () => {
  const f = fixture();
  expect(await (await fetch(new URL("/health", f.url))).json()).toEqual({
    status: "ok",
    service: "relay",
  });
  expect((await fetch(new URL("/ready", f.url))).status).toBe(200);
  for (const path of ["/rpc/account.get", "/api/auth/get-session", "/files/read"])
    expect((await fetch(new URL(path, f.url))).status).toBe(404);
});
it("rejects disallowed origins before upgrade and permits authenticated native clients without Origin", async () => {
  const f = fixture();
  expect(
    (await fetch(new URL("/relay", f.url), { headers: { origin: "https://evil.example.test" } }))
      .status,
  ).toBe(403);
  expect(
    (await fetch(new URL("/relay", f.url), { headers: { origin: "https://app.example.test" } }))
      .status,
  ).toBe(426);
  const ticket = await f.control.credentials.ticket(f.auth),
    viewer = await socket(f.url, "viewer", ticket.token);
  await expect.poll(() => viewer.frames.some((frame) => frame.type === "ready")).toBe(true);
});
it("consumes viewer tickets once and rejects invalid or expired device credentials", async () => {
  const f = fixture(),
    ticket = await f.control.credentials.ticket(f.auth);
  const first = await socket(f.url, "viewer", ticket.token);
  await expect.poll(() => first.frames.some((frame) => frame.type === "ready")).toBe(true);
  const replay = await socket(f.url, "viewer", ticket.token);
  await expect.poll(() => replay.closed.length).toBe(1);
  expect(replay.frames.some((frame) => frame.type === "ready")).toBe(false);
  const device = await socket(f.url, "device", "invalid-device-credential");
  await expect.poll(() => device.closed.length).toBe(1);
});
it("keeps liveness during database/broker outages and does not expose failure details", async () => {
  const f = fixture(async () => {
    throw new Error("private database details");
  });
  const response = await fetch(new URL("/ready", f.url));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private");
  expect((await fetch(new URL("/health", f.url))).status).toBe(200);
  vi.spyOn(f.hub, "ready").mockReturnValue(false);
  expect((await fetch(new URL("/relay", f.url))).status).toBe(503);
});
it("rejects binary frames, closes authenticated peers on shutdown and makes close idempotent", async () => {
  const f = fixture(),
    ticket = await f.control.credentials.ticket(f.auth),
    viewer = await socket(f.url, "viewer", ticket.token);
  await expect.poll(() => viewer.frames.some((frame) => frame.type === "ready")).toBe(true);
  viewer.client.send(new Uint8Array([1, 2]));
  await expect.poll(() => viewer.closed).toContain(4000);
  const next = await f.control.credentials.ticket(f.auth),
    peer = await socket(f.url, "viewer", next.token);
  await expect.poll(() => peer.frames.some((frame) => frame.type === "ready")).toBe(true);
  const closing = f.close();
  expect(f.close()).toBe(closing);
  await closing;
  await expect.poll(() => peer.closed).toContain(1001);
});
