import { createConnection } from "node:net";
import { ComputerError } from "@raypx/providers/computer";
import { z } from "zod";
import type { SandboxConfig } from "./config.js";
import type { StoredComputer } from "./store.js";

const usageSchema = z.strictObject({
  bytes: z.number().int().nonnegative(),
  reservedBytes: z.number().int().nonnegative(),
  spaceReservedBytes: z.number().int().nonnegative(),
  reason: z.enum(["COMPUTER_TRANSFER_LIMIT", "SPACE_DAILY_TRANSFER_LIMIT"]).nullable(),
  drops: z
    .strictObject({
      rate: z.number().int().nonnegative(),
      connections: z.number().int().nonnegative(),
      exhausted: z.number().int().nonnegative(),
    })
    .optional(),
});
export interface NetworkPolicy {
  register(computer: StoredComputer, ip: string, key: string): Promise<void>;
  sample(computer: StoredComputer): Promise<z.infer<typeof usageSchema>>;
  remove(computer: StoredComputer): Promise<void>;
  reconcile(keys: string[]): Promise<void>;
}

/** Private host control, never a tenant tool or backend API. */
export function hostNetwork(config: SandboxConfig): NetworkPolicy {
  async function rawRequest(operation: string, input: object = {}) {
    const value = { operation, namespace: config.namespace, bridge: config.bridge, ...input };
    const data = JSON.stringify(value) + "\n";
    let response: string;
    if (config.networkHostCommand) {
      const child = Bun.spawn(
        [
          ...config.networkHostCommand,
          "python3",
          "-I",
          config.networkHelper!,
          "request",
          config.networkStateDirectory,
          Buffer.from(data).toString("base64"),
        ],
        { stdin: "ignore", stdout: "pipe", stderr: "ignore" },
      );
      const timer = setTimeout(() => child.kill(), 10000);
      let finished = false;
      try {
        const reader = child.stdout.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            size += result.value.length;
            if (size > 8192) throw new ComputerError("CAPACITY_UNAVAILABLE");
            chunks.push(result.value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        response = Buffer.concat(chunks).toString("utf8");
        await child.exited;
        finished = true;
      } finally {
        clearTimeout(timer);
        if (!finished) child.kill();
      }
    } else {
      response = await new Promise<string>((resolve, reject) => {
        let bytes = "";
        const socket = createConnection({ path: config.networkSocket });
        socket.setTimeout(10000);
        socket.on("connect", () => socket.write(data));
        socket.on("data", (chunk: Buffer) => {
          bytes += chunk.toString("utf8");
          if (bytes.length > 8192)
            socket.destroy(new Error("Network policy response exceeded limit"));
          else if (bytes.endsWith("\n")) {
            resolve(bytes);
            socket.destroy();
          }
        });
        socket.on("timeout", () => socket.destroy(new Error("Network policy timeout")));
        socket.on("error", reject);
        socket.on("end", () => reject(new Error("Network policy disconnected")));
      });
    }
    const parsed = JSON.parse(response) as { error?: string; line?: number };
    if (parsed.error) {
      console.error(
        JSON.stringify({
          event: "sandbox.network_policy_refused",
          operation,
          line: Number.isSafeInteger(parsed.line) ? parsed.line : null,
        }),
      );
      if (
        parsed.error === "COMPUTER_TRANSFER_LIMIT" ||
        parsed.error === "SPACE_DAILY_TRANSFER_LIMIT"
      )
        throw new ComputerError(parsed.error);
      throw new ComputerError("CAPACITY_UNAVAILABLE");
    }
    return parsed;
  }
  async function request(operation: string, input: object = {}) {
    try {
      return await rawRequest(operation, input);
    } catch (error) {
      if (error instanceof ComputerError) throw error;
      throw new ComputerError("CAPACITY_UNAVAILABLE");
    }
  }
  return {
    async register(computer, ip, key) {
      await request("register", {
        key,
        ip,
        spaceId: computer.spaceId,
        rate: config.networkRate,
        burst: config.networkBurst,
        transfer: config.networkTransfer,
        spaceDaily: config.networkSpaceDaily,
        chunk: config.networkChunk,
        connections: config.networkConnections,
      });
    },
    async sample(computer) {
      if (!computer.networkKey) throw new ComputerError("CAPACITY_UNAVAILABLE");
      return usageSchema.parse(await request("sample", { key: computer.networkKey }));
    },
    async remove(computer) {
      if (computer.networkKey) await request("remove", { key: computer.networkKey });
    },
    async reconcile(keys) {
      await request("reconcile", { keys });
    },
  };
}
