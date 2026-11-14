import { expect, it, vi } from "vitest";
import { createLocalClient } from "./client.js";
it("validates the Desktop transport handshake", async () => {
  const send = vi.fn(async () => ({ version: "0.1.0", protocolVersion: 1, owner: "daemon" }));
  await expect(createLocalClient(send)("runtime.info", {})).resolves.toEqual({
    version: "0.1.0",
    protocolVersion: 1,
    owner: "daemon",
  });
  expect(send).toHaveBeenCalledWith("runtime.info", {});
});
it("refuses extra handshake input before transport", async () => {
  const send = vi.fn();
  // @ts-expect-error strict handshake input rejects unknown keys
  await expect(createLocalClient(send)("runtime.info", { unexpected: true })).rejects.toThrow(
    /Unrecognized key|Invalid input/,
  );
  expect(send).not.toHaveBeenCalled();
});
it("refuses incompatible handshake results", async () => {
  await expect(
    createLocalClient(async () => ({ version: "0.1.0", protocolVersion: 0, owner: "daemon" }))(
      "runtime.info",
      {},
    ),
  ).rejects.toThrow(/Unrecognized key|Invalid input/);
});
