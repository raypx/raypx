import { useEffect, useId, useRef, useState } from "react";

import type { AgentTask, TaskActivity, TaskInput } from "@raypx/core/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import type { TaskWorkspacePort } from "../model/port.js";
import { failureCode } from "./failure.js";

export function TaskInputComposer({
  client,
  task,
  modes,
  entries,
  waiting,
  onChanged,
}: {
  client: TaskWorkspacePort;
  task: AgentTask;
  modes: TaskInput["mode"][];
  entries: TaskActivity[];
  waiting: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("tasks"),
    id = useId();
  const [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<ReturnType<typeof failureCode>>();
  const active = useRef(false),
    receipt = useRef<{ id: string; mode: TaskInput["mode"]; prompt: string } | null>(null);
  useEffect(() => {
    if (
      receipt.current &&
      entries.some((entry) => entry.id === receipt.current?.id && entry.kind === "input")
    ) {
      if (prompt === receipt.current.prompt) setPrompt("");
      receipt.current = null;
      setFailure(undefined);
    }
  }, [entries, prompt]);
  const canSend = (mode: TaskInput["mode"]) =>
    !busy &&
    Boolean(prompt.trim()) &&
    modes.includes(mode) &&
    (task.status === "running" || task.status === "waiting") &&
    !(mode === "steer" && waiting);
  async function send(mode: TaskInput["mode"]) {
    if (active.current || !canSend(mode)) return;
    active.current = true;
    setBusy(true);
    setFailure(undefined);
    if (receipt.current?.mode !== mode || receipt.current.prompt !== prompt)
      receipt.current = { id: crypto.randomUUID(), mode, prompt };
    const input = receipt.current;
    try {
      await client.tasks.input(
        { ...input, taskId: task.id },
        { signal: AbortSignal.timeout(15_000) },
      );
      receipt.current = null;
      setPrompt("");
      onChanged();
    } catch (error) {
      const code = failureCode(error);
      setFailure(code);
      if (code !== "NETWORK_UNAVAILABLE" && code !== "LOCAL_UNAVAILABLE") receipt.current = null;
      onChanged();
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  if (!modes.length) return <p className="text-xs text-muted-foreground">{t("inputUpgrade")}</p>;
  return (
    <form
      className="space-y-3 border-t border-border pt-5"
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
          disabled={busy}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey) &&
              modes.includes("queue")
            ) {
              event.preventDefault();
              void send("queue");
            }
          }}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        {t(task.provider === "claude" ? "claudeInputHint" : "codexInputHint")}
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
    </form>
  );
}
