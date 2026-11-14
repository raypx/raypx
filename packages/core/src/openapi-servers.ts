import { z } from "zod";
import { agentIdSchema } from "./agents.js";
import { spaceIdSchema } from "./spaces.js";
export const openApiServerIdSchema = z.string().uuid();
export const openApiOperationIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const openApiAvailabilitySchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("all") }),
  z.strictObject({
    mode: z.literal("selected"),
    agentIds: z
      .array(agentIdSchema)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
]);
export const openApiOperationSchema = z.strictObject({
  operationId: openApiOperationIdSchema,
  label: z.string().min(1).max(160),
  method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
  path: z.string().startsWith("/").max(1024),
  readOnly: z.boolean(),
});
export const openApiServerConfigurationSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  url: z.string().min(1).max(2048),
  selectedOperationIds: z
    .array(openApiOperationIdSchema)
    .max(128)
    .refine((ids) => new Set(ids).size === ids.length),
  availability: openApiAvailabilitySchema.default({ mode: "all" }),
});
export const openApiSourceSchema = z.union([
  z.strictObject({ document: z.string().min(1).max(262144) }),
  z.strictObject({ url: z.string().min(1).max(2048) }),
]);
export const openApiCredentialSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("none") }),
  z.strictObject({
    type: z.literal("bearer"),
    value: z
      .string()
      .min(1)
      .max(8192)
      .regex(/^[^\r\n\0]+$/),
  }),
  z.strictObject({
    type: z.literal("apiKey"),
    header: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/),
    value: z
      .string()
      .min(1)
      .max(8192)
      .regex(/^[^\r\n\0]+$/),
  }),
]);
export const openApiServerSchema = openApiServerConfigurationSchema.extend({
  id: openApiServerIdSchema,
  spaceId: spaceIdSchema,
  operations: z.array(openApiOperationSchema).max(128),
  hasCredentials: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const openApiTestCodeSchema = z.enum([
  "SUCCEEDED",
  "AUTHENTICATION_FAILED",
  "RATE_LIMITED",
  "TIMED_OUT",
  "REQUEST_FAILED",
  "INVALID_ENDPOINT",
]);
export type OpenApiServer = z.infer<typeof openApiServerSchema>;
export type OpenApiServerConfiguration = z.infer<typeof openApiServerConfigurationSchema>;
export type OpenApiOperation = z.infer<typeof openApiOperationSchema>;
export type OpenApiSource = z.infer<typeof openApiSourceSchema>;
export type OpenApiCredential = z.infer<typeof openApiCredentialSchema>;
export type OpenApiTestCode = z.infer<typeof openApiTestCodeSchema>;
