import { expect, it, vi } from "vitest";
import { createDeviceComputerProvider } from "./device.js";
import type {
  DeviceConnectorEventData,
  DeviceConnectorRequest,
} from "@raypx/contracts/device-connector";
const ref = { id: crypto.randomUUID(), generation: 1 };
function fixture(events: DeviceConnectorEventData[]) {
  let signal: AbortSignal | undefined;
  const request = vi.fn(
    async (_operation: DeviceConnectorRequest["operation"], input: AbortSignal) => {
      signal = input;
      return {
        async *[Symbol.asyncIterator]() {
          yield* events;
        },
      };
    },
  );
  const validate = vi.fn(async () => {});
  return {
    provider: createDeviceComputerProvider(ref, { request, validate }),
    request,
    validate,
    signal: () => signal,
  };
}
it("reports ordinary device permissions and refuses home transfer and unsupported lifecycle", async () => {
  const f = fixture([]);
  expect(await f.provider.describe()).toMatchObject({
    execution: "device-process",
    egress: "unrestricted",
    home: false,
  });
  await expect(f.provider.exportHome(ref)).rejects.toThrow("INVALID_INPUT");
  await expect(f.provider.snapshot(ref)).rejects.toThrow("INVALID_INPUT");
  await expect(f.provider.stop(ref)).rejects.toThrow("INVALID_INPUT");
  await expect(f.provider.get({ ...ref, generation: 2 })).rejects.toThrow("STALE_GENERATION");
  expect(f.request).not.toHaveBeenCalled();
});
it("revalidates every bounded file operation and refuses traversal before dispatch", async () => {
  const f = fixture([
    { kind: "result", value: { bytes: Buffer.from("hello").toString("base64") } },
  ]);
  await expect(f.provider.read(ref, "../secret", 100)).rejects.toThrow("INVALID_INPUT");
  expect(f.request).not.toHaveBeenCalled();
  await expect(f.provider.read(ref, "safe.txt", 100)).resolves.toEqual({ bytes: "aGVsbG8=" });
  expect(f.validate).toHaveBeenCalledOnce();
  expect(f.request.mock.calls[0]?.[0]).toEqual({ kind: "read", path: "safe.txt", maxBytes: 100 });
  await expect(f.provider.read(ref, "safe.txt", 2)).rejects.toThrow("LIMIT_EXCEEDED");
});
it("streams bounded command output, propagates cancellation and never invents an exit", async () => {
  const f = fixture([
    { kind: "accepted" },
    { kind: "stdout", bytes: "aGk=" },
    { kind: "exit", status: 0, cancelled: false, truncated: false },
  ]);
  const process = await f.provider.execute(ref, {
    executable: "echo",
    argv: ["hi"],
    cwd: ".",
    environment: {},
    outputBudget: 2,
  });
  const events = [];
  for await (const event of process.events) events.push(event);
  expect(events).toEqual([
    { kind: "stdout", bytes: "aGk=" },
    { kind: "exit", status: 0, cancelled: false, truncated: false },
  ]);
  await process.cancel();
  expect(f.signal()?.aborted).toBe(true);
  const lost = fixture([{ kind: "accepted" }]);
  const missing = await lost.provider.execute(ref, {
    executable: "echo",
    argv: [],
    cwd: ".",
    environment: {},
    outputBudget: 2,
  });
  await expect(
    (async () => {
      for await (const _event of missing.events) {
        /* drain */
      }
    })(),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
});
it("refuses oversized output and unknown connector outcomes", async () => {
  const f = fixture([{ kind: "stdout", bytes: "aGk=" }]);
  const process = await f.provider.execute(ref, {
    executable: "echo",
    argv: [],
    cwd: ".",
    environment: {},
    outputBudget: 1,
  });
  await expect(
    (async () => {
      for await (const _event of process.events) {
        /* drain */
      }
    })(),
  ).rejects.toThrow("LIMIT_EXCEEDED");
  const unknown = fixture([{ kind: "error", code: "OUTCOME_UNKNOWN" }]);
  await expect(unknown.provider.write(ref, "safe.txt", "aGk=")).rejects.toThrow(
    "PROVIDER_UNAVAILABLE",
  );
});

it("preserves observed file size and truncation in bounded member previews", async () => {
  const f = fixture([{ kind: "result", value: { bytes: "aGk=", size: 100, truncated: true } }]);
  await expect(f.provider.readFile!(ref, "safe.txt", 2)).resolves.toEqual({
    bytes: "aGk=",
    size: 100,
    truncated: true,
  });
  await expect(f.provider.readFile!(ref, "safe.txt", 1)).rejects.toThrow("LIMIT_EXCEEDED");
});

it.each(["environment", "stdin"] as const)(
  "keeps protected %s out of ordinary journal identity fields",
  async (kind) => {
    const f = fixture([{ kind: "exit", status: 0, cancelled: false, truncated: false }]);
    const value = crypto.randomUUID();
    const destination = kind === "stdin" ? { kind } : { kind, variable: "TOKEN" };
    await f.provider.execute(ref, {
      executable: "echo",
      argv: [],
      cwd: ".",
      outputBudget: 100,
      environment: kind === "environment" ? { TOKEN: value } : {},
      ...(kind === "stdin" ? { stdin: value } : {}),
      protectedInput: { destination, value },
    });
    const operation = f.request.mock.calls[0]?.[0];
    expect(operation?.kind).toBe("execute");
    if (operation?.kind !== "execute") throw new Error("Expected command dispatch");
    const { protectedInput, ...ordinary } = operation;
    expect(protectedInput?.value === value).toBe(true);
    expect(JSON.stringify(ordinary).includes(value)).toBe(false);
  },
);
