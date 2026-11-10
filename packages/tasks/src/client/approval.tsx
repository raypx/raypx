import { useId, useRef, useState, type ReactNode } from "react";
import type { TaskWorkspacePort } from "../model/port.ts";

import type { AgentTask, HumanRequest, HumanDecision } from "@raypx/core/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";

import { Badge } from "@raypx/ui/components/ui/badge";
import { TaskStatusBadge } from "./task-status.tsx";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import { Textarea } from "@raypx/ui/components/ui/textarea";

import { failureCode } from "../model/failure.ts";

import { ApprovalBody } from "./approval-body.tsx";

function approvalAction(kind: HumanRequest["kind"], busy: boolean) {
  if (busy) return "sending";
  if (kind === "question") return "submitAnswer";
  if (kind === "plan") return "approvePlan";
  return "allowOnce";
}

export function Approval({
  client,
  request,
  task,
  context,
  onChanged,
}: {
  client: TaskWorkspacePort;
  request: HumanRequest;
  task?: AgentTask | undefined;
  /** Where the request comes from, shown in the card header. */
  context?: ReactNode;
  onChanged: () => void;
}) {
  const t = useTranslations("tasks");
  const id = useId();
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof failureCode>>();
  const active = useRef(false);
  const closed = request.status !== "pending";
  async function decide(decision: HumanDecision) {
    if (active.current || closed) return;
    active.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await client.approvals.decide(
        { id: request.id, decision },
        { signal: AbortSignal.timeout(15_000) },
      );
      onChanged();
    } catch (failure) {
      setError(failureCode(failure));
      onChanged();
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-busy={busy}
      className="overflow-hidden rounded-xl border border-border bg-background p-4"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex flex-1 items-start gap-2.5">
          <ShieldCheckIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm font-semibold wrap-anywhere">
              {request.title || t(request.kind)}
            </h3>
            {context}
          </div>
        </div>
        {request.status === "pending" ? (
          <TaskStatusBadge status="waiting" label={t("waiting")} />
        ) : (
          <Badge variant="secondary">{t(request.status)}</Badge>
        )}
      </div>
      {task && <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{task.prompt}</p>}
      {request.body && <ApprovalBody request={request} />}
      {!closed && (
        <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
          {request.questions.map((question) => (
            <fieldset key={question.id} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{question.text}</legend>
              {question.multiSelect ? (
                question.options.map((option, index) => (
                  <Field key={option.label} orientation="horizontal">
                    <Checkbox
                      id={`${id}-${question.id}-${index}`}
                      disabled={busy}
                      checked={answers[question.id]?.includes(option.label) ?? false}
                      onCheckedChange={(checked) =>
                        setAnswers((previous) => ({
                          ...previous,
                          [question.id]: checked
                            ? [...(previous[question.id] ?? []), option.label]
                            : (previous[question.id] ?? []).filter((item) => item !== option.label),
                        }))
                      }
                    />
                    <OptionLabel htmlFor={`${id}-${question.id}-${index}`} option={option} />
                  </Field>
                ))
              ) : (
                <RadioGroup
                  disabled={busy}
                  value={answers[question.id]?.[0] ?? ""}
                  onValueChange={(value) =>
                    setAnswers((previous) => ({ ...previous, [question.id]: [String(value)] }))
                  }
                >
                  {question.options.map((option, index) => (
                    <Field key={option.label} orientation="horizontal">
                      <RadioGroupItem id={`${id}-${question.id}-${index}`} value={option.label} />
                      <OptionLabel htmlFor={`${id}-${question.id}-${index}`} option={option} />
                    </Field>
                  ))}
                </RadioGroup>
              )}
              <Field>
                <FieldLabel htmlFor={`${id}-${question.id}-custom`}>{t("customAnswer")}</FieldLabel>
                <Input
                  id={`${id}-${question.id}-custom`}
                  disabled={busy}
                  value={
                    answers[question.id]?.every((value) =>
                      question.options.every((option) => option.label !== value),
                    )
                      ? (answers[question.id]?.join(", ") ?? "")
                      : ""
                  }
                  onChange={(event) =>
                    setAnswers((previous) => ({
                      ...previous,
                      [question.id]: event.target.value ? [event.target.value] : [],
                    }))
                  }
                />
              </Field>
            </fieldset>
          ))}
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>{t("note")}</FieldLabel>
            <Textarea
              id={`${id}-note`}
              disabled={busy}
              value={note}
              maxLength={8000}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2 rounded-lg bg-muted/40 p-3">
            <Button
              disabled={
                busy ||
                (request.kind === "question" &&
                  request.questions.some((q) => !answers[q.id]?.some((answer) => answer.trim())))
              }
              onClick={() =>
                void decide(
                  request.kind === "question" ? { type: "answer", answers } : { type: "allow" },
                )
              }
            >
              {t(approvalAction(request.kind, busy))}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void decide({ type: "deny", note })}
            >
              {t(request.kind === "plan" ? "revisePlan" : "deny")}
            </Button>
          </div>
        </div>
      )}
      {request.status === "decided" && (
        <p className="mt-3 text-xs text-muted-foreground">{t("awaitingDevice")}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive-text">
          {t(error)}
        </p>
      )}
    </section>
  );
}
function OptionLabel({
  htmlFor,
  option,
}: {
  htmlFor: string;
  option: { label: string; description: string };
}) {
  return (
    <FieldLabel htmlFor={htmlFor} className="block font-normal leading-normal">
      {option.label}
      <small className="block text-muted-foreground">{option.description}</small>
    </FieldLabel>
  );
}
