import { useRef, type RefObject } from "react";
import type { ApiClient } from "@raypx/client";
import type { CloudTaskDto } from "@raypx/contracts";

export type ConversationTaskAction = "newTask" | "newRound" | "continueRound";
type SubmissionResult = Awaited<ReturnType<ApiClient["cloud"]["conversations"]["sendTurn"]>>;

interface ConversationSubmissionOptions {
  api: ApiClient;
  conversationId: string;
  mode: "search" | "computer";
  taskAction: ConversationTaskAction;
  taskId: string | null | undefined;
  selectedTask: CloudTaskDto | undefined;
  canContinue: boolean;
  canStartRound: boolean;
  attachmentIds: readonly string[];
  lifetime: RefObject<AbortController | null>;
  onSubmitted: (result: SubmissionResult) => void;
}

/** Command intent survives retries; the workspace still owns its account lifetime and view state. */
export function useConversationSubmission({
  api,
  conversationId,
  mode,
  taskAction,
  taskId,
  selectedTask,
  canContinue,
  canStartRound,
  attachmentIds,
  lifetime,
  onSubmitted,
}: ConversationSubmissionOptions) {
  const sendIntent = useRef<{
    fingerprint: string;
    key: string;
    roundId?: string;
    goalVersion?: number;
    expectedGoalVersion?: number;
  } | null>(null);

  return async function send(prompt: string) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    const fingerprint = JSON.stringify({
      prompt,
      mode,
      taskId: mode === "computer" && taskAction !== "newTask" ? taskId : null,
      taskAction,
      goalVersion: taskAction === "continueRound" ? selectedTask?.goalVersion : null,
      roundId: taskAction === "continueRound" ? selectedTask?.currentRoundId : null,
      attachments: attachmentIds,
    });
    if (sendIntent.current?.fingerprint !== fingerprint)
      sendIntent.current = {
        fingerprint,
        key: crypto.randomUUID(),
        ...(selectedTask && taskAction === "newRound"
          ? { expectedGoalVersion: selectedTask.goalVersion }
          : {}),
      };
    const intent = sendIntent.current;
    const input = {
      conversationId,
      prompt,
      mode,
      attachmentIds: [...attachmentIds],
      idempotencyKey: intent.key,
    };
    let result;
    if (mode === "computer" && taskAction !== "newTask") {
      if (!selectedTask || (taskAction === "continueRound" ? !canContinue : !canStartRound))
        throw { code: "ROUND_CONTEXT_CHANGED" };
      if (taskAction === "continueRound")
        result = await api.cloud.tasks.continueRound(
          {
            ...input,
            taskId: selectedTask.id,
            roundId: selectedTask.currentRoundId,
            goalVersion: selectedTask.goalVersion,
          },
          { signal },
        );
      else {
        if (!intent.roundId || !intent.goalVersion) {
          const next = await api.cloud.tasks.startRound(
            {
              taskId: selectedTask.id,
              expectedGoalVersion: intent.expectedGoalVersion ?? selectedTask.goalVersion,
              goal: prompt,
              attachmentIds: input.attachmentIds,
              idempotencyKey: intent.key,
            },
            { signal },
          );
          if (signal.aborted) return;
          intent.roundId = next.round.id;
          intent.goalVersion = next.round.goalVersion;
        }
        result = await api.cloud.conversations.sendTurn(
          {
            ...input,
            taskId: selectedTask.id,
            roundId: intent.roundId,
            goalVersion: intent.goalVersion,
          },
          { signal },
        );
      }
    } else result = await api.cloud.conversations.sendTurn(input, { signal });
    if (signal.aborted) return;
    sendIntent.current = null;
    onSubmitted(result);
  };
}
