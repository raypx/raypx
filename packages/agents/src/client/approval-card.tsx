import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { cn } from "@raypx/ui/lib/utils";
import {
  toolOperationLabel,
  openApiOperationKind,
  approvalRemainingSeconds,
  approvalDuration,
  approvalDeadlineProminent,
  approvalExtraSummary,
  type ApprovalCardView,
} from "../model.js";
import { useTranslations } from "./i18n.js";

export { toolLabelKeys } from "../model/tool-label.js";

/** A timer updates presentation only; the server decides when a request resolves. */
export function useApprovalRemaining(card: ApprovalCardView, onExpired: () => void) {
  const [now, setNow] = useState(Date.now);
  const callback = useRef(onExpired);
  useEffect(() => {
    callback.current = onExpired;
  }, [onExpired]);
  useEffect(() => {
    if (card.state !== "pending") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function tick() {
      const current = Date.now();
      setNow(current);
      const remaining = Date.parse(card.expiresAt) - current;
      if (remaining <= 0) {
        callback.current();
        return;
      }
      const duration = approvalDuration(Math.ceil(remaining / 1000));
      const delay =
        duration.unit === "minutes"
          ? remaining - (duration.value - 1) * 60_000
          : Math.min(1000, remaining);
      timer = setTimeout(tick, delay);
    }
    tick();
    return () => clearTimeout(timer);
  }, [card.requestId, card.expiresAt, card.state]);
  return approvalRemainingSeconds(card, now);
}

function ApprovalDeadline({ card, onExpired }: { card: ApprovalCardView; onExpired: () => void }) {
  const t = useTranslations("agents");
  const remaining = useApprovalRemaining(card, onExpired);
  const duration = approvalDuration(remaining);
  return (
    <p
      aria-live="off"
      data-approval-deadline
      className={cn(
        "text-xs tabular-nums",
        approvalDeadlineProminent(remaining)
          ? "font-medium text-foreground"
          : "text-muted-foreground",
      )}
    >
      {remaining === 0
        ? t("approval.awaitingExpiry")
        : t(`approval.${duration.unit}Left`, { count: String(duration.value) })}
    </p>
  );
}

export function ApprovalCard({
  card,
  accountId,
  memberName,
  agentName,
  taskSummary,
  onAnswer,
  onExpired,
  onAnswered,
}: {
  card: ApprovalCardView;
  accountId: string;
  memberName?: ((id: string) => string) | undefined;
  agentName?: string | undefined;
  taskSummary?: string | undefined;
  onAnswer: (decision: "approved" | "denied", allowTool: boolean) => Promise<boolean>;
  onExpired: () => void;
  onAnswered: () => void;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [remember, setRemember] = useState(false);
  const [elapsed, setElapsed] = useState(() => approvalRemainingSeconds(card, Date.now()) === 0);
  const addressed = card.memberAccountId === accountId;
  const expired = elapsed;
  const summary = approvalExtraSummary(card);
  const operationKind = openApiOperationKind(card);
  const disabled =
    card.answering || expired || card.error === "unconfirmed" || card.error === "resolvedElsewhere";
  const errorKeys = {
    ruleLimit: "approval.ruleLimit",
    unconfirmed: "approval.unconfirmed",
    resolvedElsewhere: "approval.resolvedElsewhere",
  } as const;
  async function answer(decision: "approved" | "denied") {
    if (disabled || approvalRemainingSeconds(card, Date.now()) === 0) return;
    const accepted = await onAnswer(
      decision,
      decision === "approved" && remember && card.error !== "ruleLimit",
    );
    if (accepted) onAnswered();
  }
  if (card.state !== "pending") return null;
  return (
    <article
      id={`approval-${card.requestId}`}
      data-approval-card={card.requestId}
      data-message-row={`approval:${card.requestId}`}
      aria-labelledby={id}
      aria-busy={card.answering}
      tabIndex={-1}
      className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3 id={id} className="min-w-0 font-medium wrap-anywhere">
        {toolOperationLabel(card, t)}
      </h3>
      {operationKind && (
        <p data-openapi-operation-kind={operationKind} className="text-xs text-muted-foreground">
          {t(`openapi.${operationKind}`)}
        </p>
      )}
      {card.device && (
        <div className="flex min-w-0 flex-col gap-1" data-approval-device={card.device.id}>
          <p className="text-xs font-medium wrap-anywhere">
            {t("devices.approvalDevice", { name: card.device.name })}
          </p>
          <p className="text-xs text-muted-foreground">{t("devices.warning")}</p>
          <code className="text-xs whitespace-pre-wrap wrap-anywhere">{card.device.directory}</code>
          {card.device.command && (
            <pre className="text-xs whitespace-pre-wrap wrap-anywhere">{card.device.command}</pre>
          )}
        </div>
      )}
      {agentName && (
        <p data-approval-agent className="min-w-0 text-xs text-muted-foreground wrap-anywhere">
          {t("approval.requestedBy", { name: agentName })}
        </p>
      )}
      {taskSummary && (
        <p data-approval-task className="min-w-0 text-xs text-muted-foreground wrap-anywhere">
          {t("approval.childTask", { task: taskSummary.slice(0, 240) })}
        </p>
      )}
      <code className="min-w-0 rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap wrap-anywhere">
        {card.target.slice(0, 1024)}
      </code>
      {summary && (
        <pre className="min-w-0 font-mono text-xs whitespace-pre-wrap wrap-anywhere">{summary}</pre>
      )}
      {card.review?.reason && (
        <p className="min-w-0 text-xs text-muted-foreground whitespace-pre-wrap wrap-anywhere">
          {card.review.reason}
        </p>
      )}
      {!addressed && (
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {t("approval.waitingFor", {
            member: memberName?.(card.memberAccountId) ?? card.memberAccountId,
          })}
        </p>
      )}
      <ApprovalDeadline
        card={card}
        onExpired={() => {
          setElapsed(true);
          onExpired();
        }}
      />
      {addressed && (
        <>
          <Field orientation="horizontal" data-disabled={disabled || card.error === "ruleLimit"}>
            <Checkbox
              id={`${id}-remember`}
              checked={remember && card.error !== "ruleLimit"}
              onCheckedChange={setRemember}
              disabled={disabled || card.error === "ruleLimit"}
            />
            <FieldLabel htmlFor={`${id}-remember`}>
              {card.toolName === "computer_run_command"
                ? t("approval.alwaysExecutable")
                : t("approval.alwaysTool")}
            </FieldLabel>
          </Field>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button size="sm" disabled={disabled} onClick={() => void answer("approved")}>
              {t("approval.approve")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => void answer("denied")}
            >
              {t("approval.deny")}
            </Button>
          </div>
        </>
      )}
      {card.error && (
        <p className="text-xs text-muted-foreground wrap-anywhere">{t(errorKeys[card.error])}</p>
      )}
    </article>
  );
}
