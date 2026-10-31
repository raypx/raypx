import { z } from "zod";
import { normalizeTaskJson } from "@raypx/core/task-text";
import {
  taskSchema,
  humanRequestSchema,
  agentEventSchema,
  capabilitySchema,
  taskContextSnapshotSchema,
} from "@raypx/core/tasks";
import { deviceProjectSchema, relayRequestSchema } from "@raypx/contracts/tasks";
import {
  terminalSessionSchema,
  terminalRequestSchema,
  terminalRequestSummarySchema,
} from "@raypx/contracts/terminal";

const record = { id: z.string().min(1), deviceId: z.string().min(1) };
const epoch = z.number().int().positive();
const timestamp = z.iso.datetime();
export const controlRecordSchemas = {
  device: z.object({
    ...record,
    installationId: z.uuid(),
    name: z.string().max(120),
    platform: z.string().max(30),
    appVersion: z.string().max(120),
    epoch,
    revoked: z.boolean(),
    lastSeenAt: timestamp.nullable(),
    streamId: z.string().nullable(),
    instanceId: z.string().nullable(),
    connectionId: z.string().nullable(),
    cursor: z.number().int().nonnegative(),
    initialized: z.boolean(),
    capabilities: z.array(capabilitySchema),
    observedEpoch: z.uuid().optional(),
    observedRevision: z.number().int().nonnegative().optional(),
  }),
  project: deviceProjectSchema.extend({ ...record, projectId: z.uuid() }),
  task: taskSchema.extend({ epoch }),
  request: humanRequestSchema.extend({ deviceId: record.deviceId }),
  event: z.object({
    ...record,
    taskId: z.uuid(),
    streamId: z.string(),
    cursor: z.number().int().nonnegative(),
    event: agentEventSchema,
  }),
  command: z.object({
    ...record,
    request: relayRequestSchema.optional(),
    context: taskContextSnapshotSchema.optional(),
    requestHash: z.string().optional(),
    capturedAt: timestamp.optional(),
    compacted: z.literal(true).optional(),
  }),
  grant: z.object({
    ...record,
    userId: z.string().min(1),
    sessionId: z.string(),
    epoch: z.number().int().nonnegative(),
    expiresAt: timestamp,
    parentExpiresAt: timestamp,
    role: z.enum(["device", "viewer"]),
    credentialId: z.string().optional(),
  }),
  credential: z.object({
    ...record,
    userId: z.string().min(1),
    bootstrapSessionId: z.string().optional(),
    securityVersion: z.string().optional(),
    epoch,
    expiresAt: timestamp,
  }),
  observed_session: terminalSessionSchema.extend(record),
  observed_request: terminalRequestSchema.extend({
    ...record,
    serverCancelled: z.literal(true).optional(),
  }),
};
export type ControlRecords = {
  [K in keyof typeof controlRecordSchemas]: z.output<(typeof controlRecordSchemas)[K]>;
};
export type RecordKind = keyof ControlRecords;
export const observedSummarySchema = terminalRequestSummarySchema.extend(record);
export type ObservedSummary = z.output<typeof observedSummarySchema>;

export function decodeControlRecord<K extends RecordKind>(
  kind: K,
  value: unknown,
): ControlRecords[K] {
  // Indexing the schema map erases the key/output relationship inside this implementation.
  const result = controlRecordSchemas[kind].safeParse(normalizeTaskJson(value));
  if (!result.success) throw new Error("Invalid stored control data");
  return result.data as ControlRecords[K];
}
export function decodeObservedSummary(value: unknown): ObservedSummary {
  const result = observedSummarySchema.safeParse(normalizeTaskJson(value));
  if (!result.success) throw new Error("Invalid stored observed summary");
  return result.data;
}
