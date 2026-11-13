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
