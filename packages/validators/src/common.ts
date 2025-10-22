import { z } from "zod";

/**
 * Common validators for email addresses
 */
export const emailSchema = z.string().email("Invalid email address").min(1, "Email is required");

/**
 * Common validators for passwords
 * Minimum 8 characters, at least one letter and one number
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Password must contain at least one letter and one number");

/**
 * Username validation
 * Alphanumeric with hyphens and underscores, 3-20 characters
 */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Username can only contain letters, numbers, hyphens, and underscores",
  );

/**
 * Pagination parameters
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

/**
 * ID validation for database records
 */
export const idSchema = z.string().min(1, "ID is required");

/**
 * URL validation
 */
export const urlSchema = z.string().url("Invalid URL");

/**
 * Optional string that transforms empty strings to undefined
 */
export const optionalString = z
  .string()
  .optional()
  .transform((val) => (val === "" ? undefined : val));

/**
 * Date range validation
 */
export const dateRangeSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  });
