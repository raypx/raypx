import { z } from "zod";
import { spaceIdSchema } from "./spaces.js";
import { agentIdSchema } from "./agents.js";

export const computerIdSchema = z.string().uuid().brand<"ComputerId">();
export const computerStateSchema = z.enum([
  "stopped",
  "starting",
  "running",
  "stopping",
  "failed",
  "destroyed",
]);
export const computerGenerationSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const homeRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const computerSchema = z
  .strictObject({
    id: computerIdSchema,
    spaceId: spaceIdSchema,
    scope: z.enum(["team", "private"]),
    agentId: agentIdSchema.nullable(),
    provider: z.enum(["memory", "sandbox"]),
    state: computerStateSchema,
    generation: computerGenerationSchema,
    homeRevision: homeRevisionSchema.nullable(),
    leaseOwner: z.string().min(1).max(128).nullable(),
    leaseExpiresAt: z.iso.datetime().nullable(),
    leaseFence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    failureCode: z.enum(["PROVIDER_UNAVAILABLE", "RESTORE_FAILED"]).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine(
    (computer) => (computer.scope === "private") === (computer.agentId !== null),
    "Private computers require an Agent",
  )
  .refine(
    (computer) => (computer.state === "failed") === (computer.failureCode !== null),
    "Failed computers require a failure code",
  )
  .refine(
    (computer) => (computer.leaseOwner === null) === (computer.leaseExpiresAt === null),
    "A lease requires an owner and expiry",
  );
export const spaceComputerSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("not-configured") }),
  z.strictObject({ status: z.literal("available"), computer: computerSchema.nullable() }),
]);
export type Computer = z.infer<typeof computerSchema>;
export type ComputerId = z.infer<typeof computerIdSchema>;
export type SpaceComputer = z.infer<typeof spaceComputerSchema>;

export const MAX_COMPUTER_DIRECTORY_ENTRIES = 200;
export const MAX_COMPUTER_FILE_BYTES = 64 * 1024;
export const computerFilePathSchema = z.string().min(1).max(4096);
export const computerDirectoryEntrySchema = z.strictObject({
  path: z.string().max(4096),
  kind: z.enum(["file", "directory", "symlink"]),
});
const unavailableFilesSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("not-configured") }),
  z.strictObject({ status: z.literal("not-running"), state: computerStateSchema.nullable() }),
  z.strictObject({
    status: z.literal("unavailable"),
    code: z.enum(["FILES_UNAVAILABLE", "COMPUTER_UNAVAILABLE"]),
  }),
]);
export const computerDirectorySchema = z.union([
  unavailableFilesSchema,
  z.strictObject({
    status: z.literal("available"),
    entries: z.array(computerDirectoryEntrySchema).max(MAX_COMPUTER_DIRECTORY_ENTRIES),
    truncated: z.boolean(),
  }),
]);
export const computerFileSchema = z.union([
  unavailableFilesSchema,
  z.strictObject({
    status: z.literal("available"),
    bytes: z.base64().max(Math.ceil(MAX_COMPUTER_FILE_BYTES / 3) * 4),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    truncated: z.boolean(),
    contentType: z.enum(["text", "binary"]),
  }),
]);
export type ComputerDirectory = z.infer<typeof computerDirectorySchema>;
export type ComputerFile = z.infer<typeof computerFileSchema>;
