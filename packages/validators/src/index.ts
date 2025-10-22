/**
 * @raypx/validators
 *
 * Shared validation schemas for use across the entire application.
 * This package provides Zod schemas that can be used on both frontend and backend
 * to ensure consistent validation logic.
 *
 * @example
 * ```ts
 * import { emailSchema, paginationSchema } from "@raypx/validators";
 *
 * const email = emailSchema.parse("user@example.com");
 * const pagination = paginationSchema.parse({ page: 1, limit: 10 });
 * ```
 */

export * from "./common";
