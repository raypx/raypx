import { createConsola } from "@raypx/shared/logger";

/**
 * Auth-specific logger with [Auth] tag
 * Uses createConsola for better debugging and filtering
 */
export const logger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4, // info in prod, debug in dev
  formatOptions: {
    colors: true,
    date: false,
    compact: true,
  },
}).withTag("Auth");
