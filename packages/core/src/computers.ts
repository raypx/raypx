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
    scope: z.enum(["team", "private", "device"]),
    agentId: agentIdSchema.nullable(),
    provider: z.enum(["memory", "sandbox", "device"]),
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

export const MAX_COMPUTER_SCREEN_BYTES = 1024 * 1024;
export const MAX_COMPUTER_SCREEN_FPS = 4;
function screenBytesWithinLimit(value: string) {
  let padding = 0;
  if (value.endsWith("==")) padding = 2;
  else if (value.endsWith("=")) padding = 1;
  return (value.length / 4) * 3 - padding <= MAX_COMPUTER_SCREEN_BYTES;
}
export const computerScreenAvailabilitySchema = z.strictObject({
  available: z.boolean(),
  running: z.boolean(),
  width: z.number().int().min(1).max(1920),
  height: z.number().int().min(1).max(1200),
});
export const computerScreenFrameSchema = z.strictObject({
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  width: z.number().int().min(1).max(1920),
  height: z.number().int().min(1).max(1200),
  mimeType: z.literal("image/png"),
  bytes: z
    .base64()
    .min(4)
    .max(Math.ceil(MAX_COMPUTER_SCREEN_BYTES / 3) * 4)
    .refine(screenBytesWithinLimit),
});
export const computerScreenInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("pointer"),
    x: z.number().int().min(0).max(1919),
    y: z.number().int().min(0).max(1199),
    action: z.enum(["move", "down", "up"]),
    button: z.enum(["left", "middle", "right"]).default("left"),
  }),
  z.strictObject({
    kind: z.literal("key"),
    key: z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_+-]{0,39}$/),
    action: z.enum(["down", "up", "press"]),
  }),
  z.strictObject({
    kind: z.literal("text"),
    text: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => !value.includes("\0")),
  }),
]);
export type ComputerScreenAvailability = z.infer<typeof computerScreenAvailabilitySchema>;
export type ComputerScreenFrame = z.infer<typeof computerScreenFrameSchema>;
export type ComputerScreenInput = z.infer<typeof computerScreenInputSchema>;

export const computerScreenControlSchema = z.strictObject({
  id: z.string().uuid(),
  accountId: z.string().min(1),
  displayName: z.string().max(200),
  expiresAt: z.iso.datetime(),
});
export const computerScreenStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("not-configured") }),
  z.strictObject({ status: z.literal("not-running"), state: computerStateSchema.nullable() }),
  z.strictObject({
    status: z.literal("unavailable"),
    code: z.enum(["SCREEN_UNAVAILABLE", "COMPUTER_UNAVAILABLE"]),
  }),
  z.strictObject({
    status: z.literal("available"),
    running: z.boolean(),
    width: z.number().int().min(1).max(1920),
    height: z.number().int().min(1).max(1200),
    control: computerScreenControlSchema.nullable(),
    agentInputPaused: z.boolean(),
    canForceRelease: z.boolean(),
  }),
]);
export const computerScreenCloseReasonSchema = z.enum([
  "SCREEN_STOPPED",
  "SPACE_MEMBER_REMOVED",
  "SPACE_MEMBER_LEFT",
  "SPACE_DELETING",
  "SESSION_EXPIRED",
  "ACCESS_DENIED",
  "SCREEN_UNAVAILABLE",
  "SCREEN_IDLE_TIMEOUT",
  "SCREEN_STREAM_EXPIRED",
]);
export const computerScreenEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("frame"), frame: computerScreenFrameSchema }),
  z.strictObject({ kind: z.literal("state"), state: computerScreenStateSchema }),
  z.strictObject({ kind: z.literal("closed"), reason: computerScreenCloseReasonSchema }),
]);
export type ComputerScreenControl = z.infer<typeof computerScreenControlSchema>;
export type ComputerScreenState = z.infer<typeof computerScreenStateSchema>;
export type ComputerScreenCloseReason = z.infer<typeof computerScreenCloseReasonSchema>;
export type ComputerScreenEvent = z.infer<typeof computerScreenEventSchema>;

/** A device belongs to one account; projections expose only that member's Space grants. */
export const deviceComputerIdSchema = z.string().uuid();
export const deviceDirectoryGrantSchema = z.strictObject({
  id: z.string().uuid(),
  spaceId: spaceIdSchema,
  directory: z.string().min(1).max(4096),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  revokedAt: z.iso.datetime().nullable(),
});
export const deviceComputerSchema = z.strictObject({
  id: deviceComputerIdSchema,
  name: z.string().min(1).max(120),
  platform: z.string().min(1).max(30),
  connected: z.boolean(),
  connectionState: z.enum(["connected", "offline", "revoked"]),
  grants: z.array(deviceDirectoryGrantSchema).max(100),
  createdAt: z.iso.datetime(),
});
export const deviceComputerSelectionSchema = z.strictObject({
  deviceId: deviceComputerIdSchema,
  grantId: z.string().uuid(),
});
export type DeviceComputer = z.infer<typeof deviceComputerSchema>;
export type DeviceDirectoryGrant = z.infer<typeof deviceDirectoryGrantSchema>;
export type DeviceComputerSelection = z.infer<typeof deviceComputerSelectionSchema>;
