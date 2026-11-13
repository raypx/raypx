import { expect, it, vi } from "vitest";
import type { InstanceService } from "@raypx/instances/server";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../index.js";

it("limits device polling by address before any caller-chosen ID", async () => {
  const poll = vi.fn(),
    rateLimit = vi.fn(async (key: string, _rule: { window: number; max: number }) =>
      key.endsWith(":device"),
    );
  const app = createApiApp({
    instances: { poll } as unknown as InstanceService,
    rateLimit,
    clientIpHeader: "cf-connecting-ip",
    allowedOrigins: [],
    readSession: async () => null,
    authHandler: async () => new Response(null),
  });
  const api = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { "cf-connecting-ip": "203.0.113.7" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  const token = "t".repeat(64);
  // Rotating the ID never reaches a fresh per-device window once the address is full.
  for (const id of [crypto.randomUUID(), crypto.randomUUID()])
    await expect(api.instances.poll({ id, token })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      data: { error: { code: "RATE_LIMITED" } },
    });
  expect(poll).not.toHaveBeenCalled();
  expect(rateLimit.mock.calls).toEqual([
    ["instance:203.0.113.7:peer", { window: 60, max: 300 }],
    ["instance:203.0.113.7:peer", { window: 60, max: 300 }],
  ]);

  rateLimit.mockClear();
  rateLimit.mockResolvedValue(true);
  const id = crypto.randomUUID();
  poll.mockResolvedValue({ status: "pending" });
  await api.instances.poll({ id, token }).catch(() => {});
  expect(rateLimit.mock.calls).toEqual([
    ["instance:203.0.113.7:peer", { window: 60, max: 300 }],
    [`instance:203.0.113.7:${id}:device`, { window: 60, max: 60 }],
  ]);
  expect(poll).toHaveBeenCalledExactlyOnceWith(id, token);
});
