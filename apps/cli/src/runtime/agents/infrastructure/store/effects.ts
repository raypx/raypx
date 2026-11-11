import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { LocalDatabase } from "../../../sqlite/index.js";
import { taskEffects } from "../../../sqlite/schema.js";
import type { Effect } from "../../domain/commands.js";

/** Settled effects older than this are pruned at startup. */
const SETTLED_EFFECT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type EffectStatus = "open" | "done" | "failed" | "abandoned";

/**
 * Durable effect intents. The sink records an intent in the same transaction as
 * the decision that produced it; the worker settles it once the effect runs.
 * Effects are process-bound, so recovery never replays one: it only marks the
 * intents a previous process left open as `abandoned`.
 */
export class EffectLog {
  constructor(private readonly database: LocalDatabase) {}

  record(id: string, effect: Effect, at: string) {
    this.database
      .insert(taskEffects)
      .values({
        id,
        binding: effect.binding,
        taskId: effect.taskId,
        type: effect.type,
        status: "open",
        value: JSON.stringify(effect),
        createdAt: at,
      })
      .run();
  }

  settle(id: string, status: Exclude<EffectStatus, "open">, at: string) {
    this.database
      .update(taskEffects)
      .set({ status, settledAt: at })
      .where(and(eq(taskEffects.id, id), eq(taskEffects.status, "open")))
      .run();
  }

  /** Mark every effect a previous process left open; return the affected tasks. */
  abandonOpen(at: string) {
    return this.database.transaction(() => {
      const open = this.database
        .select({ taskId: taskEffects.taskId, binding: taskEffects.binding })
        .from(taskEffects)
        .where(eq(taskEffects.status, "open"))
        .all();
      this.database
        .update(taskEffects)
        .set({ status: "abandoned", settledAt: at })
        .where(eq(taskEffects.status, "open"))
        .run();
      return open;
    });
  }

  /** Remove settled effects older than the retention window. */
  prune(now: number) {
    const cutoff = new Date(now - SETTLED_EFFECT_RETENTION_MS).toISOString();
    this.database
      .delete(taskEffects)
      .where(and(isNotNull(taskEffects.settledAt), lt(taskEffects.settledAt, cutoff)))
      .run();
  }

  list(binding: string, taskId: string) {
    return this.database
      .select({ type: taskEffects.type, status: taskEffects.status })
      .from(taskEffects)
      .where(and(eq(taskEffects.binding, binding), eq(taskEffects.taskId, taskId)))
      .all();
  }
}
