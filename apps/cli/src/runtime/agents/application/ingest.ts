import type { AgentEvent, TaskActivity } from "@raypx/core/tasks";
import type { TokenTotals } from "@raypx/providers/core";
import type { ActivityDraft, LocalAgentTask } from "../model.js";
import type { Ids } from "../domain/ports.js";

/** Synchronous commits the ingestor submits; each goes through the orchestration sink. */
export interface IngestStore {
  recordActivity(binding: string, draft: ActivityDraft): TaskActivity;
  recordTokenUsage(local: LocalAgentTask, totals: TokenTotals): void;
  /** Commit a session binding or mode change as a domain event. */
  put(value: LocalAgentTask): undefined;
}

/**
 * ProviderEventIngestor. Provider adapters and the conversation recorder never
 * write storage: they report what happened, and this ingestor turns each report
 * into a committed command. The harness keeps the turn queue and handle fencing;
 * it calls the ingestor only for a current handle.
 */
export class ProviderEventIngestor {
  constructor(
    private readonly store: IngestStore,
    private readonly local: LocalAgentTask,
    private readonly ids: Ids,
    /** Live activity notification for subscribers; never a storage write. */
    private readonly notify: (event: AgentEvent) => void,
  ) {}

  /** A recorded conversation entry: commit it, then notify with the stored entry. */
  activity(draft: ActivityDraft): TaskActivity {
    const entry = this.store.recordActivity(this.local.binding, draft);
    this.notify({ id: this.ids.generate(), taskId: entry.taskId, kind: "activity", entry });
    return entry;
  }

  /** Cumulative provider usage for the session. */
  usage(totals: TokenTotals) {
    this.store.recordTokenUsage(this.local, totals);
  }

  /** The provider bound or reported its session. */
  session(sessionId: string) {
    this.local.sessionId = sessionId;
    this.store.put(this.local);
  }
}
