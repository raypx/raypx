import { z } from "zod";

/** One-based page input. Parse numbers explicitly from URL search parameters before validation. */
export const paginationSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

/** Common pagination metadata; each endpoint defines the schema for its own items. */
export const paginationMetaSchema = z.strictObject({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
});

export type Pagination = z.infer<typeof paginationSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
