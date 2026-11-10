import type { AgentTask } from "@raypx/core/tasks";

/** One conversation: the first prompt and every follow-up that continues it. */
export interface SessionThread {
  /** The earliest loaded task, which names the thread. */
  root: AgentTask;
  /** The newest continuation, which the thread opens to and reports status for. */
  latest: AgentTask;
  taskIds: ReadonlySet<string>;
}

/**
 * Folds a page of tasks into conversations, newest activity first. A follow-up joins its
 * parent's thread when the parent is on the page; otherwise it starts a thread of its own.
 */
export function sessionThreads(tasks: readonly AgentTask[]): SessionThread[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const rootOf = new Map<string, string>();
  function findRoot(task: AgentTask): string {
    const known = rootOf.get(task.id);
    if (known) return known;
    const seen = new Set<string>();
    let current = task;
    while (current.parentTaskId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentTaskId);
      if (!parent) break;
      current = parent;
    }
    rootOf.set(task.id, current.id);
    return current.id;
  }
  const threads = new Map<string, { root: AgentTask; latest: AgentTask; taskIds: Set<string> }>();
  for (const task of tasks) {
    const rootId = findRoot(task);
    const thread = threads.get(rootId);
    if (!thread) {
      threads.set(rootId, { root: byId.get(rootId)!, latest: task, taskIds: new Set([task.id]) });
      continue;
    }
    thread.taskIds.add(task.id);
    if (Date.parse(task.updatedAt) > Date.parse(thread.latest.updatedAt)) thread.latest = task;
  }
  return [...threads.values()].sort(
    (a, b) => Date.parse(b.latest.updatedAt) - Date.parse(a.latest.updatedAt),
  );
}
