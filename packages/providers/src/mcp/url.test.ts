import { expect, it, vi } from "vitest";
import { isPublicAddress, resolveMcpEndpoint, validateMcpEndpoint } from "./url.js";

it.each([
  "http://example.com/mcp",
  "https://u:p@example.com/mcp",
  "https://example.com/mcp?key=secret",
  "https://example.com/mcp#fragment",
  "https://169.254.169.254/latest",
  "https://10.0.0.1/mcp",
  "https://[::ffff:127.0.0.1]/mcp",
  "file:///tmp/server",
  "stdio:server",
])("rejects unsafe endpoint %s", (value) => {
  expect(() => validateMcpEndpoint(value)).toThrow("INVALID_ENDPOINT");
});
it.each([
  "http://localhost/mcp",
  "http://127.0.0.1/mcp",
  "http://[::1]/mcp",
  "https://example.com/mcp",
])("admits endpoint syntax %s", (value) => expect(validateMcpEndpoint(value).href).toBe(value));
it.each([
  "0.0.0.0",
  "10.0.0.1",
  "127.0.0.1",
  "169.254.169.254",
  "172.16.1.1",
  "192.168.1.1",
  "100.64.0.1",
  "198.18.0.1",
  "224.0.0.1",
  "::",
  "::1",
  "fc00::1",
  "fe80::1",
  "::ffff:10.0.0.1",
  "2002:7f00:1::",
  "2001:0000:10::",
  "64:ff9b::a00:1",
])("blocks non-global address %s", (value) => expect(isPublicAddress(value)).toBe(false));
it("checks every answer and rechecks resolution instead of trusting earlier admission", async () => {
  const resolver = vi
    .fn()
    .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
  expect((await resolveMcpEndpoint("https://example.com/mcp", resolver)).address).toBe(
    "93.184.216.34",
  );
  await expect(resolveMcpEndpoint("https://example.com/mcp", resolver)).rejects.toMatchObject({
    code: "INVALID_ENDPOINT",
  });
  await expect(
    resolveMcpEndpoint("https://example.com/mcp", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]),
  ).rejects.toMatchObject({ code: "INVALID_ENDPOINT" });
  await expect(
    resolveMcpEndpoint("http://localhost/mcp", async () => [{ address: "10.0.0.1", family: 4 }]),
  ).rejects.toMatchObject({ code: "INVALID_ENDPOINT" });
});
