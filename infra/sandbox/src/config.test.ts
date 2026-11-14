import { expect, it } from "vitest";
import { sandboxConfig } from "./config.js";
const base = {
  SANDBOX_SUPERVISOR_TOKEN: "fixture-dedicated-token-with-32-characters",
  SANDBOX_COMPUTER_IMAGE: `fixture@sha256:${"a".repeat(64)}`,
};
it("refuses disabling network limits for untrusted tenants and malformed byte buckets", () => {
  expect(() =>
    sandboxConfig({ ...base, SANDBOX_UNTRUSTED_TENANTS: "true", SANDBOX_NETWORK_LIMITS: "false" }),
  ).toThrow("host network limits");
  expect(() => sandboxConfig({ ...base, SANDBOX_NETWORK_BURST_BYTES: "4096" })).toThrow("burst");
  for (const key of [
    "SANDBOX_NETWORK_BYTES_PER_SECOND",
    "SANDBOX_NETWORK_TRANSFER_BYTES",
    "SANDBOX_NETWORK_SPACE_DAILY_BYTES",
    "SANDBOX_NETWORK_CHUNK_BYTES",
    "SANDBOX_NETWORK_CONNECTIONS",
    "SANDBOX_NETWORK_POLL_MS",
  ])
    expect(() => sandboxConfig({ ...base, [key]: "0" })).toThrow("Invalid");
});
it("keeps graphics opt-in and rejects a malformed graphical assertion", () => {
  expect(sandboxConfig(base).graphical).toBe(false);
  expect(sandboxConfig({ ...base, SANDBOX_GRAPHICAL: "true" }).graphical).toBe(true);
  expect(() => sandboxConfig({ ...base, SANDBOX_GRAPHICAL: "yes" })).toThrow("SANDBOX_GRAPHICAL");
});
it.each(["SANDBOX_MEMORY_BYTES", "SANDBOX_NANO_CPUS", "SANDBOX_PIDS_LIMIT"])(
  "rejects malformed %s and names it",
  (key) => {
    for (const value of ["", "0", "-1", "1.5", "12garbage", "Infinity", "99999999999999999999"])
      expect(() => sandboxConfig({ ...base, [key]: value })).toThrow(key);
  },
);
it("requires a private listener, a dedicated token and immutable image", () => {
  for (const address of ["0.0.0.0", "::", "8.8.8.8", "public.example.test"])
    expect(() => sandboxConfig({ ...base, SANDBOX_LISTEN_ADDRESS: address })).toThrow(
      "SANDBOX_LISTEN_ADDRESS",
    );
  expect(() => sandboxConfig({ ...base, AUTH_SECRET: base.SANDBOX_SUPERVISOR_TOKEN })).toThrow(
    "dedicated",
  );
  expect(() => sandboxConfig({ ...base, SANDBOX_COMPUTER_IMAGE: "floating:latest" })).toThrow(
    "SANDBOX_COMPUTER_IMAGE",
  );
  expect(sandboxConfig(base).bridge).toBe(sandboxConfig(base).bridge);
});
it("accepts immutable local Engine IDs and rejects malformed IDs", () => {
  expect(sandboxConfig({ ...base, SANDBOX_COMPUTER_IMAGE: `sha256:${"b".repeat(64)}` }).image).toBe(
    `sha256:${"b".repeat(64)}`,
  );
  for (const image of ["sha256:short", "computer:local", `sha256:${"B".repeat(64)}`])
    expect(() => sandboxConfig({ ...base, SANDBOX_COMPUTER_IMAGE: image })).toThrow("digest");
});
it("accepts only a public IPv4 DNS upstream", () => {
  expect(sandboxConfig(base).dnsResolver).toBe("1.1.1.1");
  expect(sandboxConfig({ ...base, SANDBOX_DNS_RESOLVER: "9.9.9.9" }).dnsResolver).toBe("9.9.9.9");
  for (const resolver of [
    "",
    "127.0.0.11",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "resolver.example.test",
  ])
    expect(() => sandboxConfig({ ...base, SANDBOX_DNS_RESOLVER: resolver })).toThrow(
      "SANDBOX_DNS_RESOLVER",
    );
});
it("keeps guest and bounded runsc runtime PID budgets distinct", () => {
  expect(sandboxConfig(base)).toMatchObject({ pids: 128, hostPids: 128 });
  expect(sandboxConfig({ ...base, SANDBOX_RUNTIME: "runsc" })).toMatchObject({
    pids: 128,
    hostPids: 384,
  });
  expect(() => sandboxConfig({ ...base, SANDBOX_RUNTIME_PIDS_OVERHEAD: "0" })).toThrow(
    "SANDBOX_RUNTIME_PIDS_OVERHEAD",
  );
});
