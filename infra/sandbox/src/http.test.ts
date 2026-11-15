import { expect, it, vi } from "vitest";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { supervisorHandler } from "./http.js";

const token = "fake-supervisor-credential-with-32-characters";
it("authenticates every route before parsing or describing anything", async () => {
  const provider = createMemoryComputerProvider();
  const describe = vi.spyOn(provider, "describe");
  const handle = supervisorHandler(provider, token);
  for (const path of ["/description", "/", "/computers/invalid/create"])
    for (const authorization of ["", "Bearer fake", `Bearer ${token}x`]) {
      const response = await handle(
        new Request(`http://127.0.0.1${path}`, { headers: { authorization } }),
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHORIZED" });
    }
  expect(describe).not.toHaveBeenCalled();
});
it("bounds authenticated slow bodies and rejects oversized screen requests", async () => {
  const handle = supervisorHandler(createMemoryComputerProvider(), token, { bodyTimeoutMs: 10 });
  const headers = { authorization: `Bearer ${token}` };
  const path = `http://127.0.0.1/computers/${crypto.randomUUID()}/screen/input`;
  const response = await handle(
    new Request(path, {
      method: "POST",
      headers,
      body: new ReadableStream(),
      duplex: "half",
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
  const large = await handle(
    new Request(path, { method: "POST", headers, body: "x".repeat(33 * 1024) }),
  );
  expect(large.status).toBe(413);
});
