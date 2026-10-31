import { z } from "zod";
import { cloudJobRunSchema } from "@raypx/jobs";
import { taskStatusSchema } from "@raypx/core/tasks";
import { relayCommandSchema, relayServerSchema } from "@raypx/contracts/tasks";

const actorSchema = z.object({
  role: z.literal("viewer"),
  userId: z.string().min(1),
  sessionId: z.string(),
  deviceId: z.string(),
  epoch: z.number().int(),
  grantId: z.string(),
  expiresAt: z.iso.datetime(),
  connectionId: z.string(),
});
export const deviceResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string().max(80) }),
]);
export const relayOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("command"),
    connectionId: z.string(),
    viewer: actorSchema,
    command: relayCommandSchema,
  }),
  z.object({
    type: z.literal("dispatch"),
    connectionId: z.string(),
    userId: z.string(),
    run: cloudJobRunSchema,
  }),
  z.object({
    type: z.literal("sync"),
    connectionId: z.string(),
    userId: z.string(),
    run: cloudJobRunSchema,
  }),
]);
export const relayReplySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("command"), result: deviceResultSchema }),
  z.object({ type: z.literal("task"), taskId: z.uuid(), status: taskStatusSchema }),
  z.object({
    type: z.literal("synced"),
    streamId: z.string(),
    sequence: z.number().int().nonnegative(),
  }),
]);
export const relayNoticeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("changed"),
    userId: z.string(),
    frame: relayServerSchema.refine(
      (frame) => frame.type === "changed" || frame.type === "observed_changed",
    ),
  }),
  z.object({ type: z.literal("revoke"), userId: z.string(), deviceId: z.string() }),
  z.object({
    type: z.literal("connected"),
    userId: z.string(),
    deviceId: z.string(),
    connectionId: z.string(),
  }),
]);
export type RelayOperation = z.output<typeof relayOperationSchema>;
export type RelayReply = z.output<typeof relayReplySchema>;
export type RelayNotice = z.output<typeof relayNoticeSchema>;
export interface RelayCluster {
  readonly nodeId: string;
  ready(): boolean;
  start(
    handle: (operation: RelayOperation, signal: AbortSignal) => Promise<RelayReply>,
    notice: (value: RelayNotice) => Promise<void>,
    unavailable: () => void,
  ): Promise<void>;
  invoke(nodeId: string, operation: RelayOperation, signal: AbortSignal): Promise<RelayReply>;
  notify(value: RelayNotice): Promise<void>;
  close(): Promise<void>;
}
