import {
  ComputerError,
  MAX_HOME_BYTES,
  commandSchema,
  computerRefSchema,
  fileEntrySchema,
  homeArchiveSchema,
  processEventSchema,
  providerComputerSchema,
  type ComputerDescription,
  type ComputerProvider,
  type ComputerRef,
  type ProcessEvent,
} from "./index.js";
import { z } from "zod";
import { homeRevisionSchema } from "@raypx/core/computers";

type Fetch = (request: Request) => Promise<Response>;
const descriptionSchema = z.strictObject({
  execution: z.literal("isolated-process"),
  files: z.literal(true),
  home: z.literal(true),
  egress: z.enum(["restricted", "unrestricted"]),
  unenforced: z.array(z.string().max(500)).max(20),
});
const revisionSchema = z.strictObject({ revision: homeRevisionSchema });
const errorCodes = new Set([
  "NOT_FOUND",
  "STALE_GENERATION",
  "NOT_RUNNING",
  "INVALID_INPUT",
  "LIMIT_EXCEEDED",
  "RESTORE_FAILED",
]);
async function checked(response: Response) {
  if (response.ok) return response;
  const data = (await response.json().catch(() => null)) as { code?: string } | null;
  if (data?.code && errorCodes.has(data.code))
    throw new ComputerError(data.code as ComputerError["code"]);
  throw new ComputerError("PROVIDER_UNAVAILABLE");
}
async function json(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new ComputerError("PROVIDER_UNAVAILABLE");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HOME_BYTES * 2) throw new ComputerError("LIMIT_EXCEEDED");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel();
  }
}
/** The backend adapter knows only this private HTTP service, never an Engine socket. */
export function createDockerComputerProvider(options: {
  url: string;
  token: string;
  fetch?: Fetch;
}): ComputerProvider {
  const url = new URL(options.url);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    options.token.length < 32
  )
    throw new ComputerError("INVALID_INPUT");
  const request = options.fetch ?? fetch;
  async function call(ref: ComputerRef, operation: string, input: object = {}) {
    computerRefSchema.parse(ref);
    try {
      return await checked(
        await request(
          new Request(new URL(`/computers/${ref.id}/${operation}`, url).toString(), {
            method: "POST",
            headers: {
              authorization: `Bearer ${options.token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ generation: ref.generation, ...input }),
            signal: AbortSignal.timeout(120_000),
          }),
        ),
      );
    } catch (error) {
      if (error instanceof ComputerError) throw error;
      throw new ComputerError("PROVIDER_UNAVAILABLE");
    }
  }
  async function view(ref: ComputerRef, operation: string) {
    return providerComputerSchema.parse(await json(await call(ref, operation)));
  }
  return {
    async describe(): Promise<ComputerDescription> {
      const response = await checked(
        await request(
          new Request(new URL("/description", url).toString(), {
            headers: { authorization: `Bearer ${options.token}` },
            signal: AbortSignal.timeout(5000),
          }),
        ),
      );
      return descriptionSchema.parse(await json(response));
    },
    get: (ref) => view(ref, "get"),
    provision: (ref) => view(ref, "create"),
    stop: (ref) => view(ref, "stop"),
    destroy: (ref) => view(ref, "destroy"),
    async execute(ref, input) {
      const command = commandSchema.parse(input);
      const executionId = crypto.randomUUID();
      const response = await call(ref, "exec", { executionId, command });
      const reader = response.body?.getReader();
      if (!reader) throw new ComputerError("PROVIDER_UNAVAILABLE");
      let cancelling: Promise<void> | undefined;
      const cancel = () => (cancelling ??= call(ref, "cancel", { executionId }).then(() => {}));
      async function* events(): AsyncIterable<ProcessEvent> {
        const decoder = new TextDecoder();
        let pending = "";
        let exited = false;
        let bytes = 0;
        try {
          while (true) {
            const { value, done } = await reader!.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            if (pending.length > 2 * 1024 * 1024) throw new ComputerError("LIMIT_EXCEEDED");
            let end = pending.indexOf("\n");
            while (end >= 0) {
              const event = processEventSchema.parse(JSON.parse(pending.slice(0, end)));
              if (exited) throw new ComputerError("PROVIDER_UNAVAILABLE");
              if (event.kind === "exit") exited = true;
              else {
                bytes += Buffer.from(event.bytes, "base64").length;
                if (bytes > command.outputBudget) throw new ComputerError("LIMIT_EXCEEDED");
              }
              yield event;
              pending = pending.slice(end + 1);
              end = pending.indexOf("\n");
            }
          }
          if (pending || !exited) throw new ComputerError("PROVIDER_UNAVAILABLE");
        } finally {
          if (!exited) await cancel().catch(() => {});
          await reader!.cancel().catch(() => {});
        }
      }
      return { events: events(), cancel };
    },
    async list(ref, path, limit) {
      return z
        .strictObject({ entries: z.array(fileEntrySchema).max(1000), truncated: z.boolean() })
        .parse(await json(await call(ref, "files/list", { path, limit })));
    },
    async read(ref, path, maxBytes) {
      return z
        .strictObject({ bytes: z.base64() })
        .parse(await json(await call(ref, "files/read", { path, maxBytes })));
    },
    async write(ref, path, bytes) {
      await call(ref, "files/write", { path, bytes });
    },
    async exportHome(ref) {
      return homeArchiveSchema.parse(await json(await call(ref, "home/export")));
    },
    async importHome(ref, archive) {
      return revisionSchema.parse(await json(await call(ref, "home/import", { archive })));
    },
    async snapshot(ref) {
      return revisionSchema.parse(await json(await call(ref, "snapshot")));
    },
  };
}
