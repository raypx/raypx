import { useLayoutEffect, useRef, useState } from "react";
import type { AgentTask } from "@raypx/core/tasks";
import {
  createTaskDraft,
  MAX_TASK_DRAFTS,
  type TaskDraft,
  type TaskDraftDelivery,
} from "../model/drafts.js";
import { workspaceScopeKey, type WorkspaceScope } from "../model/scope.js";
import { useTaskDrafts } from "./use-task-drafts.js";

type DraftFailure = "draft.saveFailed" | "draft.limit" | "draft.cleanupFailed";

/** One bounded collection per owner; project/task/type identify independent editor slots. */
export function useSessionDraft(
  scope: WorkspaceScope,
  task: AgentTask | undefined,
  taskId: string,
  kind: TaskDraftDelivery["kind"],
) {
  const key = JSON.stringify(["raypx.task-session-editors.v1", workspaceScopeKey(scope)]);
  const store = useTaskDrafts(key);
  const id = JSON.stringify([task?.deviceId, task?.projectId, taskId, kind]);
  const identity = JSON.stringify([key, id]);
  const [local, setLocal] = useState<{
    identity: string;
    draft: TaskDraft | undefined;
    prompt?: string;
  }>();
  const [failure, setFailure] = useState<{ identity: string; code: DraftFailure }>();
  const stored = store.drafts.find((draft) => draft.id === id);
  const draft = local?.identity === identity ? local.draft : stored;
  const current = useRef({ identity, draft });
  useLayoutEffect(() => {
    current.current = { identity, draft };
  }, [identity, draft]);
  const delivery = draft?.delivery;
  const boundDelivery =
    delivery?.kind === kind &&
    delivery.input.prompt === draft?.prompt.trim() &&
    (delivery.kind === "input" ? delivery.input.taskId : delivery.input.parentTaskId) === taskId
      ? delivery
      : undefined;

  function persist(next: TaskDraft | undefined, prompt = next?.prompt) {
    // Keep editable text even when device storage is unavailable or full.
    current.current = { identity, draft: next };
    setLocal({ identity, draft: next, ...(prompt === undefined ? {} : { prompt }) });
    try {
      const latest = store.read();
      if (next && !latest.some((entry) => entry.id === id) && latest.length >= MAX_TASK_DRAFTS) {
        setFailure({ identity, code: "draft.limit" });
        return;
      }
      store.write(
        next
          ? [next, ...latest.filter((entry) => entry.id !== id)]
          : latest.filter((entry) => entry.id !== id),
      );
      setLocal(!next && prompt !== undefined ? { identity, draft: undefined, prompt } : undefined);
      setFailure(undefined);
    } catch {
      setFailure({ identity, code: "draft.saveFailed" });
    }
  }
  function edit(prompt: string, model = draft?.model ?? task?.model) {
    if (!task) return;
    persist(
      prompt.trim()
        ? createTaskDraft(
            {
              deviceId: task.deviceId,
              projectId: task.projectId,
              provider: task.provider,
              mode: task.mode,
              prompt,
              ...(model ? { model } : {}),
            },
            id,
          )
        : undefined,
      prompt,
    );
  }
  function remember(receipt: TaskDraftDelivery) {
    if (draft) persist({ ...draft, delivery: receipt });
  }
  function accepted(receipt: TaskDraftDelivery) {
    // A late success must not erase a replacement draft saved while another task was open.
    const ownsEditor =
      current.current.identity === identity &&
      current.current.draft?.delivery?.input.id === receipt.input.id;
    function isolate() {
      current.current = { identity, draft: undefined };
      setLocal({ identity, draft: undefined });
      setFailure({ identity, code: "draft.cleanupFailed" });
    }
    try {
      const latest = store.read();
      const sent = latest.find((entry) => entry.id === id);
      if (sent?.delivery?.input.id === receipt.input.id)
        store.write(latest.filter((entry) => entry !== sent));
      else if (ownsEditor && sent) {
        isolate();
        return;
      }
      if (ownsEditor) {
        current.current = { identity, draft: undefined };
        setLocal(undefined);
        setFailure(undefined);
      }
    } catch {
      if (ownsEditor) isolate();
    }
  }
  return {
    prompt:
      local?.identity === identity
        ? (local.prompt ?? local.draft?.prompt ?? "")
        : (stored?.prompt ?? ""),
    model: draft?.model,
    delivery: boundDelivery,
    ready: store.ready,
    failure:
      failure?.identity === identity
        ? failure.code
        : store.failed
          ? ("draft.saveFailed" as const)
          : undefined,
    edit,
    remember,
    accepted,
  };
}
