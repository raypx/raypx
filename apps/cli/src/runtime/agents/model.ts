/**
 * Compatibility entry for the aggregates the domain owns. Their one definition
 * lives in `domain/state.ts`, so a stored record and a projected event cannot
 * drift apart.
 */
export {
  desktopBinding,
  isDesktopBinding,
  localAgentTaskSchema,
  tokenUsageSchema,
  type ActivityDraft,
  type LocalAgentTask,
} from "./domain/state";
