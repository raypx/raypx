import { isProd } from "@raypx/shared";
import { createConsola } from "@raypx/shared/logger";

/**
 * Observability-specific logger with [Observability] tag
 * Uses createConsola for better debugging and filtering
 */
export const logger = createConsola({
  level: isProd ? 3 : 4, // info in prod, debug in dev
  formatOptions: {
    colors: true,
    date: false,
    compact: true,
  },
}).withTag("Observability");
