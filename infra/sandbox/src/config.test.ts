import { expect, it } from "vitest";
import { sandboxConfig } from "./config.js";
const base = {
  SANDBOX_SUPERVISOR_TOKEN: "fixture-dedicated-token-with-32-characters",
  SANDBOX_COMPUTER_IMAGE: `fixture@sha256:${"a".repeat(64)}`,
};
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
