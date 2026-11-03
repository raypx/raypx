import { oc, type InferRouterContractOutputs } from "@orpc/contract";
import { z } from "zod";

const action = z.enum(["user.role.update", "configuration.update"]);
const outcome = z.enum(["pending", "success", "rejected", "failed", "unknown"]);
const values = z.strictObject({
  role: z.string().max(120).optional(),
  siteName: z.string().max(60).optional(),
  registrationEnabled: z.boolean().optional(),
  cleanupEnabled: z.boolean().optional(),
});
export const auditEntrySchema = z.strictObject({
  id: z.uuid(),
  requestId: z.string(),
  actorId: z.string().nullable(),
  source: z.enum(["http", "service", "operator"]),
  action,
  targetId: z.string().nullable(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  outcome,
  errorCode: z.string().nullable(),
  before: values.nullable(),
  after: values.nullable(),
});
export const auditFilterSchema = z
  .strictObject({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    actorId: z.string().max(128).optional(),
    targetId: z.string().max(128).optional(),
    action: action.optional(),
    outcome: outcome.optional(),
    cursor: z.strictObject({ startedAt: z.iso.datetime(), id: z.uuid() }).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .refine((input) => !input.from || !input.to || input.from < input.to, "Invalid date range");
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditFilter = z.infer<typeof auditFilterSchema>;
export const administrationContract = {
  overview: oc
    .input(z.strictObject({ days: z.union([z.literal(7), z.literal(30)]).default(30) }))
    .output(
      z.strictObject({
        observedAt: z.iso.datetime(),
        timezone: z.literal("UTC"),
        totalUsers: z.number().int().nonnegative(),
        verifiedUsers: z.number().int().nonnegative(),
        newUsers: z.number().int().nonnegative(),
        registrations: z.array(
          z.strictObject({ day: z.string(), count: z.number().int().nonnegative() }),
        ),
      }),
    ),
  health: oc.input(z.strictObject({})).output(
    z.strictObject({
      observedAt: z.iso.datetime(),
      checks: z.strictObject({
        database: z.enum(["ok", "unavailable", "not-configured"]),
        redis: z.enum(["ok", "unavailable", "not-configured"]),
        relay: z.enum(["ok", "unavailable", "not-configured"]),
      }),
    }),
  ),
  audit: oc.input(auditFilterSchema).output(
    z.strictObject({
      entries: z.array(auditEntrySchema),
      next: z.strictObject({ startedAt: z.iso.datetime(), id: z.uuid() }).nullable(),
    }),
  ),
};

export type AdministrationOutputs = InferRouterContractOutputs<typeof administrationContract>;
