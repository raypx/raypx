import { z } from "zod";

/** Stable public error codes shared by server handlers and browser clients. */
export const apiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "REQUEST_TIMEOUT",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
]);

/** Public validation messages grouped by field path, with no rejected input values. */
export const fieldErrorsSchema = z.record(z.string(), z.array(z.string().min(1).max(512)).min(1));

/** Safe wire error. Servers must supply public messages rather than exception text. */
export const apiErrorSchema = z.strictObject({
  code: apiErrorCodeSchema,
  message: z.string().min(1).max(512),
  requestId: z
    .string()
    .regex(/^[A-Za-z0-9._:-]{1,128}$/)
    .optional(),
  errors: fieldErrorsSchema.optional(),
});

/** Error responses use this shape; successful responses keep their own business schemas. */
export const apiErrorResponseSchema = z.strictObject({ error: apiErrorSchema });

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type FieldErrors = z.infer<typeof fieldErrorsSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
