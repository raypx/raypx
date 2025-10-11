import { createConsola } from "consola";

// Create a logger instance with custom configuration
export const logger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4,
  formatOptions: {
    colors: true,
    date: true,
    compact: false,
  },
});

// Export consola for custom instances
export { createConsola } from "consola";

// Export type for better type safety
export type Logger = typeof logger;
