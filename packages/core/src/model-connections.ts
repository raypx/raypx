import { z } from "zod";
import { spaceIdSchema } from "./spaces.js";

// These are the existing transport kinds supported by @raypx/ai.
export const modelConnectionKindSchema = z.enum([
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "compatible",
]);
export const modelConnectionApiSchema = z.enum([
  "anthropic-messages",
  "openai-completions",
  "openai-responses",
]);
export const modelConnectionIdSchema = z.string().uuid();
const models = z
  .array(z.string().trim().min(1).max(128))
  .min(1)
  .max(100)
  .refine((items) => new Set(items).size === items.length);
export const modelConnectionAvailabilitySchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("all") }),
  z.strictObject({
    mode: z.literal("selected"),
    spaceIds: z
      .array(spaceIdSchema)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
]);
export const modelConnectionConfigurationSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    kind: modelConnectionKindSchema,
    baseUrl: z.string().url().max(2048).nullable(),
    api: modelConnectionApiSchema.nullable(),
    models,
    availability: modelConnectionAvailabilitySchema.default({ mode: "all" }),
  })
  .refine((value) =>
    value.kind === "compatible"
      ? value.baseUrl !== null && value.api !== null
      : value.baseUrl === null && value.api === null,
  );
export const modelConnectionSchema = z.strictObject({
  id: modelConnectionIdSchema,
  name: z.string().min(1).max(120),
  kind: modelConnectionKindSchema,
  baseUrl: z.string().url().max(2048).nullable(),
  api: modelConnectionApiSchema.nullable(),
  models,
  availability: modelConnectionAvailabilitySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ModelConnection = z.infer<typeof modelConnectionSchema>;
export type ModelConnectionConfiguration = z.infer<typeof modelConnectionConfigurationSchema>;
export const modelConnectionTestCodeSchema = z.enum([
  "SUCCEEDED",
  "AUTHENTICATION_FAILED",
  "RATE_LIMITED",
  "TIMED_OUT",
  "MODEL_UNAVAILABLE",
  "REQUEST_FAILED",
]);
export type ModelConnectionTestCode = z.infer<typeof modelConnectionTestCodeSchema>;
