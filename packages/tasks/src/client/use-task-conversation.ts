import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationState } from "../model/conversation.js";
import type { AgentEvent } from "@raypx/core/tasks";
import type { TaskWorkspacePort } from "../model/port.js";
import { workspaceOwner, workspaceScopeKey, type WorkspaceScope } from "../model/scope.js";
import { failureCode } from "./failure.js";
import { useRemoteQuery } from "./remote-query.js";
import { waitForRead } from "./read.js";

export function useTaskConversation(
  client: TaskWorkspacePort,
  id: string,
  scope: WorkspaceScope,
  onFailure: (failure: ReturnType<typeof failureCode>) => void,
) {
  const scopeKey = workspaceScopeKey(scope);
  const session = useMemo(
    () => ({ client, id, scopeKey, history: new ConversationState() }),
    [client, id, scopeKey],
  );
  const active = useRef<typeof session | null>(null);
  const paging = useRef<{ session: typeof session; controller: AbortController } | null>(null);
  const [loadingFor, setLoadingFor] = useState<typeof session | null>(null);
  useEffect(() => {
    active.current = session;
    return () => {
      if (active.current === session) active.current = null;
      if (paging.current?.session === session) {
        paging.current.controller.abort();
        paging.current = null;
      }
    };
  }, [session]);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await session.client.tasks.get(
        { id: session.id, after: session.history.after },
        { signal },
      );
      signal.throwIfAborted();
      return { ...result, ...session.history.mergeLatest(result) };
    },
    [session],
  );
  const mergeEvents = useCallback(
    (events: AgentEvent[]) => session.history.applyEvents(events),
    [session],
  );
  const beginRecovery = useCallback(() => session.history.beginRecovery(), [session]);
  const query = useRemoteQuery(
    ["task", id, workspaceOwner(scope), scopeKey],
    load,
    true,
    client,
    mergeEvents,
    beginRecovery,
  );
  async function loadPage(before: number, gapId?: number) {
    if (active.current !== session || paging.current) return;
    const operation = { session, controller: new AbortController() };
    const signal = AbortSignal.any([operation.controller.signal, AbortSignal.timeout(15_000)]);
    paging.current = operation;
    setLoadingFor(session);
    try {
      const result = await waitForRead(
        session.client.tasks.get({ id: session.id, beforeActivity: before }, { signal }),
        signal,
      );
      if (signal.aborted || active.current !== session) return;
      if (gapId === undefined) session.history.mergeOlder(result);
      else session.history.mergeGap(gapId, result);
      query.refresh();
    } catch (failure) {
      if (!operation.controller.signal.aborted && active.current === session)
        onFailure(failureCode(failure));
    } finally {
      if (paging.current === operation) {
        paging.current = null;
        if (active.current === session) setLoadingFor(null);
      }
    }
  }
  return {
    ...query,
    loadingOlder: loadingFor === session,
    loadOlder: async () => {
      if (session.history.before !== undefined) return loadPage(session.history.before);
    },
    loadGap: async (gapId: number) => {
      const gap = session.history.gap(gapId);
      if (gap) return loadPage(gap.before, gap.id);
    },
  };
}
