import { oc } from "@orpc/contract";
import { z } from "zod";

export const createCursorPageSchema = <Item extends z.ZodType>(item: Item) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const apiErrorCodeSchema = z.string().trim().min(1).max(120);

export const apiErrorValuesSchema = z.record(
  z.string().min(1).max(80),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const apiErrorEnvelopeSchema = z.object({
  code: apiErrorCodeSchema,
  values: apiErrorValuesSchema.optional(),
});

export const apiErrorDataSchema = z.object({ error: apiErrorEnvelopeSchema });

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export type ApiErrorData = z.infer<typeof apiErrorDataSchema>;

export const apiProblemDetailsSchema = z.object({
  type: z.url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  code: apiErrorCodeSchema,
  values: apiErrorValuesSchema.default({}),
  fieldErrors: z
    .array(z.object({ field: z.string().min(1), message: z.string().min(1) }))
    .default([]),
  requestId: z.string().min(1),
});

export type ApiProblemDetails = z.infer<typeof apiProblemDetailsSchema>;

/** Every RPC accepts a validated object and returns the declared wire shape. */
export function procedure<Shape extends z.ZodRawShape, Output extends z.ZodType>(
  input: Shape,
  output: Output,
) {
  return oc.input(z.object(input)).output(output);
}

/** Canonical resource identity and native Date fields, shared within the wire layer. */
export const resourceFields = {
  id: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
};
export const authoredResourceFields = {
  ...resourceFields,
  createdByUserId: z.string().min(1),
};

export const cursorQueryFields = {
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(2048).optional(),
};
