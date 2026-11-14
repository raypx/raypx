import { z } from "zod";
import { agentIdSchema } from "./agents.js";
import { spaceIdSchema } from "./spaces.js";
import { nextRoutineRuns } from "./routine-schedule.js";

export const routineIdSchema = z.string().uuid();
const schedule = z
  .strictObject({
    cron: z.string().trim().min(1).max(200),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z_][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/),
  })
  .superRefine((value, context) => {
    try {
      nextRoutineRuns(value, new Date("2026-01-01T00:00:00Z"), 1);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Invalid five-field Cron schedule or time zone",
      });
    }
  });
export const routineTriggersSchema = z
  .strictObject({
    schedule: schedule.optional(),
    webhook: z.boolean().optional(),
    email: z
      .strictObject({
        allowedSender: z
          .email()
          .max(254)
          .transform((value) => value.toLowerCase()),
      })
      .optional(),
    repository: z
      .strictObject({
        events: z
          .array(
            z
              .string()
              .min(1)
              .max(100)
              .regex(/^[a-zA-Z0-9_.-]+$/),
          )
          .min(1)
          .max(32)
          .refine((values) => new Set(values).size === values.length),
      })
      .optional(),
  })
  .refine(
    (value) => Boolean(value.schedule || value.webhook || value.email || value.repository),
    "Choose a trigger",
  );
export const routineInputSchema = z.strictObject({
  agentId: agentIdSchema,
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(32_000),
  enabled: z.boolean().default(true),
  triggers: routineTriggersSchema,
});
const httpIngressSchema = z.strictObject({
  url: z.url().nullable(),
  unavailableReason: z
    .enum(["TRIGGER_NOT_CONFIGURED", "PUBLIC_API_ORIGIN_NOT_CONFIGURED"])
    .nullable(),
});
const routineIngressSchema = z.strictObject({
  webhook: httpIngressSchema,
  repository: httpIngressSchema,
  email: z.strictObject({
    address: z.email().nullable(),
    unavailableReason: z.enum(["TRIGGER_NOT_CONFIGURED", "EMAIL_NOT_CONFIGURED"]).nullable(),
  }),
});
export const routineSchema = routineInputSchema.extend({
  id: routineIdSchema,
  spaceId: spaceIdSchema,
  ownerAccountId: z.string().min(1),
  emailAddress: z.email().nullable(),
  ingress: routineIngressSchema.optional(),
  nextDueAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const routineDeliveryOutcomeSchema = z.strictObject({
  status: z.enum(["fired", "coalesced", "ignored"]),
  runId: z.string().nullable(),
  conversationId: z.string().nullable(),
});
export const routineHistorySchema = z.strictObject({
  id: z.string(),
  routineId: routineIdSchema,
  kind: z.enum(["schedule", "manual", "webhook", "email", "repository"]),
  dueAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  runId: z.string().nullable(),
  conversationId: z.string().nullable(),
  status: z.enum(["fired", "coalesced", "ignored"]),
  startedAt: z.iso.datetime().nullable(),
  delayMs: z.number().nonnegative().nullable(),
  runState: z.string().nullable(),
});
export const routineEventSchema = z.strictObject({
  id: z.string(),
  spaceId: spaceIdSchema,
  routineId: routineIdSchema,
  kind: z.enum(["routine.fired", "routine.coalesced"]),
  occurrenceId: z.string(),
  runId: z.string(),
  conversationId: z.string(),
  dueAt: z.iso.datetime(),
  firedAt: z.iso.datetime(),
});
export type RoutineInput = z.infer<typeof routineInputSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type RoutineTriggers = z.infer<typeof routineTriggersSchema>;
export type RoutineDeliveryOutcome = z.infer<typeof routineDeliveryOutcomeSchema>;
export type RoutineHistory = z.infer<typeof routineHistorySchema>;
export type RoutineEvent = z.infer<typeof routineEventSchema>;
export class RoutineError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "DISABLED"
      | "UNAUTHORIZED"
      | "BODY_MISMATCH"
      | "RATE_LIMITED"
      | "PAYLOAD_TOO_LARGE",
  ) {
    super(code);
    this.name = "RoutineError";
  }
}
export function nextRoutineDue(triggers: RoutineTriggers, after: Date): Date | null {
  if (!triggers.schedule) return null;
  return new Date(nextRoutineRuns(triggers.schedule, after, 1)[0]!);
}

export { nextRoutineRuns } from "./routine-schedule.js";
