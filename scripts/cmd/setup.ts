import { createTask, definedCmd } from "../lib/task";

/**
 * Setup function for initial project configuration
 * Optimized: Use concurrent execution for better performance
 */
const setup = definedCmd({
  tasks: [
    createTask("pnpm --filter @raypx/db run db:migrate", {
      title: "Database migration",
    }),
  ],
  options: {
    concurrent: true, // Enable concurrent execution
    exitOnError: true, // Exit immediately on error
  },
  type: "task",
});

export default setup;
