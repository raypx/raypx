import {
  ComputerError,
  computerAdmissionReasonSchema,
  MAX_HOME_BYTES,
  bound,
  commandSchema,
  computerRefSchema,
  fileEntrySchema,
  homeArchiveSchema,
  processEventSchema,
  providerComputerSchema,
  workspacePath,
  type ComputerDescription,
  type ComputerProvider,
  type ComputerRef,
  type ProcessEvent,
} from "./index.js";
import { z } from "zod";
import {
  homeRevisionSchema,
  MAX_COMPUTER_FILE_BYTES,
  MAX_COMPUTER_SCREEN_BYTES,
  computerScreenAvailabilitySchema,
  computerScreenUnavailableReasonSchema,
  computerScreenFrameSchema,
  computerScreenInputSchema,
  type ComputerScreenFrame,
} from "@raypx/core/computers";
import { filePreviewScript } from "./file-preview.js";

type Fetch = (request: Request) => Promise<Response>;
const descriptionSchema = z.strictObject({
  execution: z.literal("isolated-process"),
  files: z.literal(true),
  home: z.literal(true),
  egress: z.enum(["restricted", "unrestricted"]),
  unenforced: z.array(z.string().max(500)).max(20),
  screen: z.boolean().optional(),
  screenUnavailableReason: computerScreenUnavailableReasonSchema.optional(),
});
const revisionSchema = z.strictObject({ revision: homeRevisionSchema });
const errorCodes = new Set([
  "NOT_FOUND",
  "STALE_GENERATION",
  "NOT_RUNNING",
  "INVALID_INPUT",
  "LIMIT_EXCEEDED",
  "RESTORE_FAILED",
  "SCREEN_UNAVAILABLE",
  ...computerAdmissionReasonSchema.options,
]);
async function checked(response: Response) {
  if (response.ok) return response;
  const data = (await response.json().catch(() => null)) as { code?: string } | null;
  if (data?.code && errorCodes.has(data.code))
    throw new ComputerError(data.code as ComputerError["code"]);
  throw new ComputerError("PROVIDER_UNAVAILABLE");
}
async function json(response: Response, maxBytes = MAX_HOME_BYTES * 2) {
  const reader = response.body?.getReader();
  if (!reader) throw new ComputerError("PROVIDER_UNAVAILABLE");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ComputerError("LIMIT_EXCEEDED");
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
  async function call(
    ref: ComputerRef,
    operation: string,
    input: object = {},
    signal?: AbortSignal,
  ) {
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
            signal: signal ?? AbortSignal.timeout(120_000),
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
  const provider: ComputerProvider = {
    async describe(): Promise<ComputerDescription> {
      const response = await checked(
        await request(
          new Request(new URL("/description", url).toString(), {
            headers: { authorization: `Bearer ${options.token}` },
            signal: AbortSignal.timeout(5000),
          }),
        ),
      );
      const description = descriptionSchema.parse(await json(response));
      const { screenUnavailableReason, ...capabilities } = description;
      return {
        ...capabilities,
        screen: description.screen ?? false,
        ...(screenUnavailableReason ? { screenUnavailableReason } : {}),
      };
    },
    get: (ref) => view(ref, "get"),
    provision: async (ref, context) =>
      providerComputerSchema.parse(await json(await call(ref, "create", context ?? {}))),
    stop: (ref) => view(ref, "stop"),
    destroy: (ref) => view(ref, "destroy"),
    async execute(ref, input) {
      const { protectedInput: _protectedInput, ...command } = commandSchema.parse(input);
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
              // The supervisor opens the stream with an empty line to flush the response head.
              if (end === 0) {
                pending = pending.slice(1);
                end = pending.indexOf("\n");
                continue;
              }
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
    async readFile(ref, path, maxBytes) {
      const clean = workspacePath(path);
      if (!clean) throw new ComputerError("INVALID_INPUT");
      bound(maxBytes, MAX_COMPUTER_FILE_BYTES);
      // The prepared computer image already provides this interpreter for its file helper.
      const process = await provider.execute(ref, {
        executable: "/usr/local/bin/python3",
        argv: ["-I", "-c", filePreviewScript, clean, String(maxBytes)],
        cwd: ".",
        environment: {},
        outputBudget: Math.ceil(maxBytes / 3) * 4 + 1024,
      });
      const timer = setTimeout(() => void process.cancel().catch(() => {}), 5000);
      const chunks: Buffer[] = [];
      let exited = false;
      try {
        for await (const event of process.events) {
          if (event.kind === "stdout") chunks.push(Buffer.from(event.bytes, "base64"));
          if (event.kind === "exit") {
            if (event.status !== 0 || event.cancelled || event.truncated)
              throw new ComputerError("PROVIDER_UNAVAILABLE");
            exited = true;
          }
        }
        if (!exited) throw new ComputerError("PROVIDER_UNAVAILABLE");
        const response = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        const refusal = z
          .strictObject({ code: z.enum(["NOT_FOUND", "INVALID_INPUT", "PROVIDER_UNAVAILABLE"]) })
          .safeParse(response);
        if (refusal.success) throw new ComputerError(refusal.data.code);
        const result = z
          .strictObject({
            bytes: z.base64().max(Math.ceil(maxBytes / 3) * 4),
            size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            truncated: z.boolean(),
          })
          .parse(response);
        if (Buffer.from(result.bytes, "base64").length > maxBytes)
          throw new ComputerError("LIMIT_EXCEEDED");
        return result;
      } catch (error) {
        if (error instanceof ComputerError) throw error;
        throw new ComputerError("PROVIDER_UNAVAILABLE");
      } finally {
        clearTimeout(timer);
        if (!exited) await process.cancel().catch(() => {});
      }
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
    async screen(ref) {
      return computerScreenAvailabilitySchema.parse(
        await json(await call(ref, "screen/get", {}, AbortSignal.timeout(5000)), 1024),
      );
    },
    async startScreen(ref) {
      return computerScreenAvailabilitySchema.parse(
        await json(await call(ref, "screen/start", {}, AbortSignal.timeout(12_000)), 1024),
      );
    },
    async stopScreen(ref) {
      return computerScreenAvailabilitySchema.parse(
        await json(await call(ref, "screen/stop", {}, AbortSignal.timeout(5000)), 1024),
      );
    },
    async screenshot(ref) {
      return computerScreenFrameSchema.parse(
        await json(
          await call(ref, "screen/screenshot", {}, AbortSignal.timeout(5000)),
          Math.ceil(MAX_COMPUTER_SCREEN_BYTES / 3) * 4 + 1024,
        ),
      );
    },
    async input(ref, input) {
      await call(
        ref,
        "screen/input",
        { input: computerScreenInputSchema.parse(input) },
        AbortSignal.timeout(5000),
      );
    },
    async *streamScreen(ref, streamOptions): AsyncIterable<ComputerScreenFrame> {
      const controller = new AbortController();
      const signal = streamOptions?.signal
        ? AbortSignal.any([controller.signal, streamOptions.signal])
        : controller.signal;
      const response = await call(ref, "screen/stream", {}, signal);
      const reader = response.body?.getReader();
      if (!reader) throw new ComputerError("PROVIDER_UNAVAILABLE");
      const decoder = new TextDecoder();
      let pending = "";
      try {
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          if (pending.length > Math.ceil(MAX_COMPUTER_SCREEN_BYTES / 3) * 4 + 1024)
            throw new ComputerError("LIMIT_EXCEEDED");
          let end = pending.indexOf("\n");
          while (end >= 0) {
            if (end > 0) yield computerScreenFrameSchema.parse(JSON.parse(pending.slice(0, end)));
            pending = pending.slice(end + 1);
            end = pending.indexOf("\n");
          }
        }
        if (pending) throw new ComputerError("PROVIDER_UNAVAILABLE");
      } finally {
        controller.abort();
        await reader.cancel().catch(() => {});
      }
    },
  };
  return provider;
}
