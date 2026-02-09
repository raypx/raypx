/**
 * ID Generation Utilities
 * Provides consistent ID generation across the application
 */

import { customAlphabet } from "nanoid";

/**
 * Custom alphabet for nanoid that excludes confusing characters
 * Removed: 0, O, 1, I, l, 5, S, s, u, v, x, X, y, Y, Z
 * This makes IDs more readable and reduces user errors when typing IDs
 */
const SAFE_ALPHABET = "6789BCDFGHJKLMNPQRTWbcdfghjkmnpqrtwz";

/**
 * Default nanoid generator with safe alphabet
 * Generates 16-character IDs that are URL-safe and human-readable
 *
 * @example
 * ```ts
 * const id = nanoid(); // "BcDfGhJkLmNpQrT"
 * ```
 */
export const nanoid = customAlphabet(SAFE_ALPHABET, 16);

/**
 * Generate a longer nanoid (useful for tokens or keys that need extra security)
 * @param length - Length of the ID (default: 32)
 */
export function generateLongId(length = 32): string {
  return customAlphabet(SAFE_ALPHABET, length)();
}

/**
 * Generate a shorter nanoid (useful for short codes or slugs)
 * @param length - Length of the ID (default: 8)
 */
export function generateShortId(length = 8): string {
  return customAlphabet(SAFE_ALPHABET, length)();
}
