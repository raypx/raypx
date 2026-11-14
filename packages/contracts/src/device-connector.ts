import { commandInputDestinationSchema } from "@raypx/core/protected-input";
import { z } from "zod";

/** This channel is separate from retained device Relay and private Desktop IPC. */
export const DEVICE_CONNECTOR_VERSION = 2;
export const DEVICE_CONNECTOR_MAX_FRAME_BYTES = 1_500_000;
export const DEVICE_CONNECTOR_MAX_OUTPUT_BYTES = 1024 * 1024;
export const DEVICE_CONNECTOR_PATHS = {
  connect: "/device/connect",
  claim: "/device/pairing/claim",
  confirm: "/device/pairing/confirm",
  grant: "/device/grants/confirm",
  prepareGrant: "/device/grants/prepare",
  revokeGrant: "/device/grants/revoke",
  revoke: "/device/revoke",
} as const;
const id = z.string().min(1).max(200);
const revision = z.number().int().positive();
const path = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes("\0"));
const credential = z.string().min(32).max(512);
export const devicePairingClaimSchema = z.strictObject({
  protocolVersion: z.literal(DEVICE_CONNECTOR_VERSION),
  code: z.string().min(6).max(64),
  deviceName: z.string().min(1).max(120),
  platform: z.enum(["darwin", "linux", "win32", "unknown"]).default("unknown"),
});
export const devicePairingClaimResultSchema = z.strictObject({
  claimId: id,
  claimToken: credential,
  accountId: id,
  accountLabel: z.string().min(1).max(200),
  spaceId: id,
  spaceLabel: z.string().min(1).max(200),
  expiresAt: z.iso.datetime(),
});
export const devicePairingConfirmSchema = z.strictObject({
  protocolVersion: z.literal(DEVICE_CONNECTOR_VERSION),
  claimId: id,
  claimToken: credential,
});
export const deviceConnectorCredentialSchema = z.strictObject({
  protocolVersion: z.literal(DEVICE_CONNECTOR_VERSION),
  deviceId: id,
  deviceName: z.string().min(1).max(120),
  accountId: id,
  credential,
  credentialRevision: revision,
});
export const deviceDirectoryGrantWireSchema = z.strictObject({
  id,
  spaceId: id,
  deviceId: id,
  directory: path,
  revision,
});
export const deviceGrantConfirmSchema = z.strictObject({
  protocolVersion: z.literal(DEVICE_CONNECTOR_VERSION),
  deviceId: id,
  spaceId: id,
  directory: path,
});
export const deviceGrantRevokeSchema = z.strictObject({
  protocolVersion: z.literal(DEVICE_CONNECTOR_VERSION),
  deviceId: id,
  spaceId: id,
  grantId: id,
});
export const deviceConnectorOperationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("list"), path, limit: z.number().int().min(1).max(1000) }),
  z.strictObject({
    kind: z.literal("read"),
    path,
    maxBytes: z
      .number()
      .int()
      .min(1)
      .max(1024 * 1024),
  }),
  z.strictObject({ kind: z.literal("write"), path, bytes: z.base64().max(1_398_104) }),
  z.strictObject({
    kind: z.literal("execute"),
    executable: path,
    argv: z
      .array(
        z
          .string()
          .max(32_000)
          .refine((value) => !value.includes("\0")),
      )
      .max(256),
    cwd: path,
    environment: z.record(
      z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      z
        .string()
        .max(32_000)
        .refine((value) => !value.includes("\0")),
    ),
    stdin: z
      .string()
      .max(4096)
      .refine((value) => !value.includes("\0"))
      .optional(),
    /** Ephemeral delivery. Excluded from receipts/identity; scrub before journaled output. */
    protectedInput: z
      .strictObject({
        destination: commandInputDestinationSchema,
        value: z
          .string()
          .min(1)
          .max(4096)
          .refine((value) => !value.includes("\0")),
      })
      .optional(),
    outputBudget: z.number().int().min(0).max(DEVICE_CONNECTOR_MAX_OUTPUT_BYTES),
    /** Server authorizes the exact operation after its durable approval/effect admission. */
    approved: z.literal(true),
  }),
]);
export const deviceConnectorRequestSchema = z.strictObject({
  operationId: id,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  deviceId: id,
  accountId: id,
  requesterAccountId: id,
  spaceId: id,
  grantId: id,
  grantRevision: revision,
  connectionFence: revision,
  runId: id,
  runFence: revision,
  expiresAt: z.iso.datetime(),
  operation: deviceConnectorOperationSchema,
});
const eventDataSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("accepted") }),
  z.strictObject({ kind: z.enum(["stdout", "stderr"]), bytes: z.base64().max(44_000) }),
  z.strictObject({ kind: z.literal("result"), value: z.unknown() }),
  z.strictObject({
    kind: z.literal("exit"),
    status: z.number().int(),
    cancelled: z.boolean(),
    truncated: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("error"),
    code: z.enum([
      "ACCESS_DENIED",
      "STALE_FENCE",
      "GRANT_REVOKED",
      "INVALID_INPUT",
      "LIMIT_EXCEEDED",
      "CANCELLED",
      "OUTCOME_UNKNOWN",
      "COMMAND_CONFLICT",
      "UNAVAILABLE",
    ]),
  }),
]);
export const deviceConnectorClientFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("hello"),
    protocolVersion: z.literal(DEVICE_CONNECTOR_VERSION),
    deviceId: id,
    cursor: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("ready"),
    connectionFence: revision,
    credentialRevision: revision,
  }),
  z.strictObject({
    type: z.literal("event"),
    connectionFence: revision,
    sequence: z.number().int().positive(),
    operationId: id,
    event: eventDataSchema,
  }),
  z.strictObject({
    type: z.literal("grant"),
    requestId: id,
    grant: deviceDirectoryGrantWireSchema,
  }),
  z.strictObject({ type: z.literal("pong") }),
]);
export const deviceConnectorServerFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("welcome"),
    protocolVersion: z.literal(DEVICE_CONNECTOR_VERSION),
    connectionFence: revision,
    cursor: z.number().int().nonnegative(),
    credential: deviceConnectorCredentialSchema,
    grants: z.array(deviceDirectoryGrantWireSchema).max(256),
  }),
  z.strictObject({ type: z.literal("request"), request: deviceConnectorRequestSchema }),
  z.strictObject({ type: z.literal("cancel"), connectionFence: revision, operationId: id }),
  z.strictObject({
    type: z.literal("ack"),
    connectionFence: revision,
    sequence: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("grants"),
    connectionFence: revision,
    grants: z.array(deviceDirectoryGrantWireSchema).max(256),
  }),
  z.strictObject({
    type: z.literal("request-grant"),
    requestId: id,
    spaceId: id,
    spaceLabel: z.string().min(1).max(200),
  }),
  z.strictObject({
    type: z.literal("revoked"),
    reason: z.enum(["DEVICE_REVOKED", "ACCOUNT_REVOKED", "GRANT_REVOKED"]),
  }),
  z.strictObject({ type: z.literal("ping") }),
]);
export type DeviceConnectorCredential = z.infer<typeof deviceConnectorCredentialSchema>;
export type DeviceDirectoryGrantWire = z.infer<typeof deviceDirectoryGrantWireSchema>;
export type DeviceConnectorRequest = z.infer<typeof deviceConnectorRequestSchema>;
export type DeviceConnectorClientFrame = z.infer<typeof deviceConnectorClientFrameSchema>;
export type DeviceConnectorServerFrame = z.infer<typeof deviceConnectorServerFrameSchema>;
export type DeviceConnectorEventData = z.infer<typeof eventDataSchema>;

/** Exact immutable operation identity; attempt/connection fences are admission only. */
export function deviceConnectorPayloadIdentity(
  request: Pick<
    DeviceConnectorRequest,
    | "deviceId"
    | "accountId"
    | "requesterAccountId"
    | "spaceId"
    | "grantId"
    | "grantRevision"
    | "runId"
    | "operation"
  >,
): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => {
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
          })
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    return value;
  };
  return JSON.stringify(
    canonical([
      request.deviceId,
      request.accountId,
      request.requesterAccountId,
      request.spaceId,
      request.grantId,
      request.grantRevision,
      request.runId,
      request.operation.kind === "execute" && request.operation.protectedInput
        ? {
            ...request.operation,
            protectedInput: { destination: request.operation.protectedInput.destination },
          }
        : request.operation,
    ]),
  );
}
