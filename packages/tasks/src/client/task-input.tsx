import { agentProviderMetadata } from "@raypx/core/tasks";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import type { AgentTask, TaskActivity, TaskInput } from "@raypx/core/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import type { TaskWorkspacePort } from "../model/port.ts";
import { failureCode } from "../model/failure.ts";
import type { WorkspaceScope } from "../model/scope.ts";
import { useSessionDraft } from "./use-session-draft.ts";
import { submitShortcut } from "./submit-shortcut.ts";

export function TaskInputComposer({
  client,
  task,
  modes,
  entries,
  waiting,
  onChanged,
  scope,
}: {
  client: TaskWorkspacePort;
  task: AgentTask;
  modes: TaskInput["mode"][];
  entries: TaskActivity[];
  waiting: boolean;
  onChanged: () => void;
  scope: WorkspaceScope;
}) {
  const t = useTranslations("tasks"),
    id = useId();
  const draft = useSessionDraft(scope, task, task.id, "input");
  const prompt = draft.prompt;
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<ReturnType<typeof failureCode>>();
  const active = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const receipt = draft.delivery?.kind === "input" ? draft.delivery : undefined;
  const acceptReceipt = useEffectEvent(() => {
    if (receipt) draft.accepted(receipt);
    setFailure(undefined);
  });
  useEffect(() => {
    if (
      receipt &&
      entries.some((entry) => entry.id === receipt.input.id && entry.kind === "input")
    ) {
      // Reconcile an external authoritative receipt after this subscription update.
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) acceptReceipt();
      });
      return () => {
        cancelled = true;
      };
    }
  }, [entries, receipt]);
  const canSend = (mode: TaskInput["mode"]) =>
    !busy &&
    draft.ready &&
    Boolean(prompt.trim()) &&
    modes.includes(mode) &&
    (task.status === "running" || task.status === "waiting") &&
    !(mode === "steer" && waiting);
  async function send(mode: TaskInput["mode"]) {
    if (active.current || !canSend(mode)) return;
    active.current = true;
    setBusy(true);
    setFailure(undefined);
    const delivery =
      receipt?.input.mode === mode
        ? receipt
        : {
            kind: "input" as const,
            input: { id: crypto.randomUUID(), mode, prompt: prompt.trim(), taskId: task.id },
          };
    draft.remember(delivery);
    try {
      await client.tasks.input(delivery.input, { signal: AbortSignal.timeout(15_000) });
      draft.accepted(delivery);
      if (mounted.current) onChanged();
    } catch (error) {
      const code = failureCode(error);
      if (mounted.current) {
        setFailure(code);
        onChanged();
      }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (!modes.length) return null;
  return (
    <form
      className="flex flex-col gap-3 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (modes.includes("queue")) void send("queue");
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>{t("addInstruction")}</FieldLabel>
        <Textarea
          id={id}
          className="min-h-24"
          value={prompt}
          maxLength={32000}
          disabled={busy || !draft.ready}
          onChange={(event) => draft.edit(event.target.value)}
          onKeyDown={(event) => {
            if (modes.includes("queue")) submitShortcut(event);
          }}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        {t(agentProviderMetadata[task.provider].inputHint)}
      </p>
      {waiting && <p className="text-xs text-muted-foreground">{t("inputWaitingHint")}</p>}
      <div className="flex flex-wrap gap-2">
        {modes.includes("queue") && (
          <Button type="submit" disabled={!canSend("queue")}>
            {t(busy ? "sending" : "queue")}
          </Button>
        )}
        {modes.includes("steer") && (
          <Button
            type="button"
            variant="outline"
            disabled={!canSend("steer")}
            onClick={() => void send("steer")}
          >
            {t("steer")}
          </Button>
        )}
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(failure)}
        </p>
      )}
      {draft.failure && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(draft.failure)}
        </p>
      )}
    </form>
  );
}
