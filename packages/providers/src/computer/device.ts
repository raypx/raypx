import { z } from "zod";
import type {
  DeviceConnectorEventData,
  DeviceConnectorRequest,
} from "@raypx/contracts/device-connector";
import {
  ComputerError,
  commandSchema,
  workspacePath,
  bound,
  MAX_HOME_BYTES,
  type ComputerProvider,
  type ComputerRef,
  type ProcessEvent,
  type ComputerProcess,
} from "./port.js";

export interface DeviceComputerTransport {
  request(
    operation: DeviceConnectorRequest["operation"],
    signal: AbortSignal,
  ): Promise<AsyncIterable<DeviceConnectorEventData>>;
  validate(): Promise<void>;
}
/** Private adapter: the connector owns host I/O; this never opens a backend process. */
export function createDeviceComputerProvider(
  ref: ComputerRef,
  transport: DeviceComputerTransport,
): ComputerProvider {
  function check(actual: ComputerRef) {
    if (actual.id !== ref.id) throw new ComputerError("NOT_FOUND");
    if (actual.generation !== ref.generation) throw new ComputerError("STALE_GENERATION");
  }
  async function result(
    actual: ComputerRef,
    operation: DeviceConnectorRequest["operation"],
  ): Promise<unknown> {
    check(actual);
    await transport.validate();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const events = await transport.request(operation, controller.signal);
      for await (const event of events) {
        if (event.kind === "result") return event.value;
        if (event.kind === "error")
          throw new ComputerError(
            event.code === "INVALID_INPUT" ? "INVALID_INPUT" : "PROVIDER_UNAVAILABLE",
          );
      }
      throw new ComputerError("PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async describe() {
      return {
        execution: "device-process",
        files: true,
        home: false,
        egress: "unrestricted",
        unenforced: [
          "Commands retain the device user's OS permissions. Directory grants are not sandbox isolation.",
          "Home export, import and snapshots are unavailable for device computers.",
          "Detached processes that escape their process group are not contained.",
        ],
      };
    },
    async get(actual) {
      check(actual);
      await transport.validate();
      return { ...ref, state: "running", homeRevision: null };
    },
    async provision(actual) {
      check(actual);
      await transport.validate();
      return { ...ref, state: "running", homeRevision: null };
    },
    async stop() {
      throw new ComputerError("INVALID_INPUT");
    },
    async destroy() {
      throw new ComputerError("INVALID_INPUT");
    },
    async list(actual, path, limit) {
      const value = await result(actual, {
        kind: "list",
        path: workspacePath(path) || ".",
        limit: bound(limit, 1000),
      });
      const parsed = z
        .strictObject({
          entries: z
            .array(
              z.strictObject({
                path: z.string().max(4096),
                kind: z.enum(["file", "directory", "symlink"]),
              }),
            )
            .max(1000),
          truncated: z.boolean(),
        })
        .safeParse(value);
      if (!parsed.success) throw new ComputerError("PROVIDER_UNAVAILABLE");
      return parsed.data;
    },
    async read(actual, path, maxBytes) {
      const value = await result(actual, {
        kind: "read",
        path: workspacePath(path) || ".",
        maxBytes: Math.min(bound(maxBytes, MAX_HOME_BYTES), 1_048_576),
      });
      if (
        !value ||
        typeof value !== "object" ||
        !("bytes" in value) ||
        typeof value.bytes !== "string"
      )
        throw new ComputerError("PROVIDER_UNAVAILABLE");
      const bytes = Buffer.from(value.bytes, "base64");
      if (bytes.length > maxBytes) throw new ComputerError("LIMIT_EXCEEDED");
      return { bytes: value.bytes };
    },
    async readFile(actual, path, maxBytes) {
      const value = await result(actual, {
        kind: "read",
        path: workspacePath(path) || ".",
        maxBytes: bound(maxBytes, 1_048_576),
      });
      const parsed = z
        .strictObject({
          bytes: z.base64().max(1_398_104),
          size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          truncated: z.boolean(),
        })
        .safeParse(value);
      if (!parsed.success) throw new ComputerError("PROVIDER_UNAVAILABLE");
      const length = Buffer.from(parsed.data.bytes, "base64").length;
      if (length > maxBytes || length > parsed.data.size) throw new ComputerError("LIMIT_EXCEEDED");
      return parsed.data;
    },
    async write(actual, path, bytes) {
      await result(actual, { kind: "write", path: workspacePath(path) || ".", bytes });
    },
    async execute(actual, input): Promise<ComputerProcess> {
      check(actual);
      await transport.validate();
      const command = commandSchema.parse(input);
      const controller = new AbortController();
      const events = await transport.request(
        { ...command, cwd: workspacePath(command.cwd) || ".", kind: "execute", approved: true },
        controller.signal,
      );
      return {
        async cancel() {
          controller.abort();
        },
        events: {
          async *[Symbol.asyncIterator](): AsyncGenerator<ProcessEvent> {
            let terminal = false;
            let captured = 0;
            for await (const event of events) {
              if (event.kind === "stdout" || event.kind === "stderr") {
                captured += Buffer.from(event.bytes, "base64").length;
                if (captured > command.outputBudget) throw new ComputerError("LIMIT_EXCEEDED");
                yield event;
              } else if (event.kind === "exit") {
                terminal = true;
                yield event;
              } else if (event.kind === "error") throw new ComputerError("PROVIDER_UNAVAILABLE");
            }
            if (!terminal) throw new ComputerError("PROVIDER_UNAVAILABLE");
          },
        },
      };
    },
    async exportHome() {
      throw new ComputerError("INVALID_INPUT");
    },
    async importHome() {
      throw new ComputerError("INVALID_INPUT");
    },
    async snapshot() {
      throw new ComputerError("INVALID_INPUT");
    },
  };
}
