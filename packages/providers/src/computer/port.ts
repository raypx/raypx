import { z } from "zod";
import {
  computerIdSchema,
  computerGenerationSchema,
  computerStateSchema,
  homeRevisionSchema,
  computerDirectoryEntrySchema,
  type ComputerScreenAvailability,
  type ComputerScreenFrame,
  type ComputerScreenInput,
} from "@raypx/core/computers";

export const MAX_OUTPUT_BYTES = 1024 * 1024;
export const MAX_HOME_BYTES = 32 * 1024 * 1024;
export const computerRefSchema = z.strictObject({
  id: computerIdSchema.transform(String),
  generation: computerGenerationSchema,
});
export type ComputerRef = z.infer<typeof computerRefSchema>;
export class ComputerError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "STALE_GENERATION"
      | "NOT_RUNNING"
      | "INVALID_INPUT"
      | "LIMIT_EXCEEDED"
      | "RESTORE_FAILED"
      | "SCREEN_UNAVAILABLE"
      | "PROVIDER_UNAVAILABLE",
  ) {
    super(code);
    this.name = "ComputerError";
  }
}
export const providerComputerSchema = computerRefSchema.extend({
  state: computerStateSchema.exclude(["starting", "stopping", "failed"]),
  homeRevision: homeRevisionSchema.nullable(),
});
export type ProviderComputer = z.infer<typeof providerComputerSchema>;
export const commandSchema = z.strictObject({
  executable: z
    .string()
    .min(1)
    .max(4096)
    .refine((v) => !v.includes("\0")),
  argv: z
    .array(
      z
        .string()
        .max(32_000)
        .refine((v) => !v.includes("\0")),
    )
    .max(256),
  cwd: z.string().max(4096).default("."),
  environment: z
    .record(
      z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      z
        .string()
        .max(32_000)
        .refine((v) => !v.includes("\0")),
    )
    .default({}),
  outputBudget: z.number().int().min(0).max(MAX_OUTPUT_BYTES),
});
export type ComputerCommand = z.infer<typeof commandSchema>;
export const processEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["stdout", "stderr"]), bytes: z.base64() }),
  z.strictObject({
    kind: z.literal("exit"),
    status: z.number().int(),
    cancelled: z.boolean(),
    truncated: z.boolean(),
  }),
]);
export type ProcessEvent = z.infer<typeof processEventSchema>;
export interface ComputerProcess {
  events: AsyncIterable<ProcessEvent>;
  cancel(this: void): Promise<void>;
}
export const fileEntrySchema = computerDirectoryEntrySchema;
export type FileEntry = z.infer<typeof fileEntrySchema>;
export const homeEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    path: z.string().max(4096),
    kind: z.literal("symlink"),
    target: z
      .string()
      .max(4096)
      .refine((v) => !v.includes("\0")),
  }),
  z.strictObject({
    path: z.string().max(4096),
    kind: z.literal("file"),
    bytes: z.base64(),
    mode: z.number().int().min(0).max(0o777),
  }),
  z.strictObject({
    path: z.string().max(4096),
    kind: z.literal("directory"),
    mode: z.number().int().min(0).max(0o777),
  }),
]);
export const homeArchiveSchema = z.strictObject({
  version: z.literal(1),
  entries: z.array(homeEntrySchema).max(10_000),
});
export type HomeArchive = z.infer<typeof homeArchiveSchema>;
export interface ComputerDescription {
  execution: "virtual" | "isolated-process";
  files: true;
  home: true;
  egress: "restricted" | "unrestricted";
  unenforced: string[];
  /** True only when this deployment prepared a graphical computer image. */
  screen?: boolean;
}
export interface ComputerProvider {
  describe(): Promise<ComputerDescription>;
  get(ref: ComputerRef): Promise<ProviderComputer>;
  /** Same generation reconnects. A greater one fences and replaces the old computer. */
  provision(ref: ComputerRef): Promise<ProviderComputer>;
  stop(ref: ComputerRef): Promise<ProviderComputer>;
  /** Removes compute; retains the last committed home and the generation tombstone. */
  destroy(ref: ComputerRef): Promise<ProviderComputer>;
  execute(ref: ComputerRef, command: ComputerCommand): Promise<ComputerProcess>;
  list(
    ref: ComputerRef,
    path: string,
    limit: number,
  ): Promise<{ entries: FileEntry[]; truncated: boolean }>;
  read(ref: ComputerRef, path: string, maxBytes: number): Promise<{ bytes: string }>;
  /** Optional bounded member preview; never starts compute or follows link components. */
  readFile?(
    ref: ComputerRef,
    path: string,
    maxBytes: number,
  ): Promise<{ bytes: string; size: number; truncated: boolean }>;
  write(ref: ComputerRef, path: string, bytes: string): Promise<void>;
  exportHome(ref: ComputerRef): Promise<HomeArchive>;
  importHome(ref: ComputerRef, archive: HomeArchive): Promise<{ revision: string }>;
  snapshot(ref: ComputerRef): Promise<{ revision: string }>;
  /** Optional graphical capability. A missing operation never grants screen access. */
  screen?(this: void, ref: ComputerRef): Promise<ComputerScreenAvailability>;
  startScreen?(this: void, ref: ComputerRef): Promise<ComputerScreenAvailability>;
  stopScreen?(this: void, ref: ComputerRef): Promise<ComputerScreenAvailability>;
  screenshot?(this: void, ref: ComputerRef): Promise<ComputerScreenFrame>;
  input?(this: void, ref: ComputerRef, input: ComputerScreenInput): Promise<void>;
  streamScreen?(
    this: void,
    ref: ComputerRef,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ComputerScreenFrame>;
}
/** Reject all traversal and links, rather than normalizing an unsafe request. */
export function workspacePath(path: string): string {
  if (
    path.includes("\0") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.split("/").includes("..") ||
    path.length > 4096
  )
    throw new ComputerError("INVALID_INPUT");
  return path
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");
}
export function bound(value: number, max: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new ComputerError("INVALID_INPUT");
  return value;
}
export async function validateHome(
  input: HomeArchive,
): Promise<{ archive: HomeArchive; revision: string }> {
  const parsed = homeArchiveSchema.safeParse(input);
  if (!parsed.success) throw new ComputerError("RESTORE_FAILED");
  const archive = parsed.data;
  const paths = new Map<string, string>();
  let bytes = 0;
  for (const entry of archive.entries) {
    let path: string;
    try {
      path = workspacePath(entry.path);
    } catch {
      throw new ComputerError("RESTORE_FAILED");
    }
    if (!path || path !== entry.path || paths.has(path)) throw new ComputerError("RESTORE_FAILED");
    paths.set(path, entry.kind);
    if (entry.kind === "file") bytes += Buffer.from(entry.bytes, "base64").length;
  }
  for (const path of paths.keys()) {
    const parts = path.split("/");
    parts.pop();
    while (parts.length) {
      if (paths.get(parts.join("/")) !== "directory") throw new ComputerError("RESTORE_FAILED");
      parts.pop();
    }
  }
  if (bytes > MAX_HOME_BYTES) throw new ComputerError("RESTORE_FAILED");
  if (paths.get("workspace") !== "directory") throw new ComputerError("RESTORE_FAILED");
  archive.entries.sort((a, b) => {
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return 0;
  });
  const encoded = new TextEncoder().encode(JSON.stringify(archive));
  if (encoded.length > MAX_HOME_BYTES * 2) throw new ComputerError("RESTORE_FAILED");
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return { archive, revision: Buffer.from(digest).toString("hex") };
}
