import { isProd } from "@raypx/shared";
import { createConsola } from "@raypx/shared/logger";

/**
 * Analytics-specific logger with [Analytics] tag
 * Uses createConsola for better debugging and filtering
 */
export const logger = createConsola({
  level: isProd ? 3 : 4, // info in prod, debug in dev
  formatOptions: {
    colors: true,
    date: false,
    compact: true,
  },
}).withTag("Analytics");
