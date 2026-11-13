import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { approvalRemainingSeconds, type ApprovalCardView } from "../model.js";
import { useTranslations } from "./i18n.js";

export const toolLabelKeys = {
  computer_list_files: "tools.listFiles",
  computer_read_file: "tools.readFile",
  computer_write_file: "tools.writeFile",
  computer_run_command: "tools.runCommand",
} as const;

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
      timer = setTimeout(tick, Math.min(1000, remaining));
    }
    tick();
    return () => clearTimeout(timer);
  }, [card.requestId, card.expiresAt, card.state]);
  return approvalRemainingSeconds(card, now);
}

export function ApprovalCard({
  card,
  accountId,
  onAnswer,
  onExpired,
  onAnswered,
}: {
  card: ApprovalCardView;
  accountId: string;
  onAnswer: (decision: "approved" | "denied", allowTool: boolean) => Promise<boolean>;
  onExpired: () => void;
  onAnswered: () => void;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [remember, setRemember] = useState(false);
  const remaining = useApprovalRemaining(card, onExpired);
  const addressed = card.memberAccountId === accountId;
  const expired = card.state === "pending" && remaining === 0;
  const disabled =
    card.answering || expired || card.error === "unconfirmed" || card.error === "resolvedElsewhere";
  const errorKeys = {
    ruleLimit: "approval.ruleLimit",
    unconfirmed: "approval.unconfirmed",
    resolvedElsewhere: "approval.resolvedElsewhere",
  } as const;
  async function answer(decision: "approved" | "denied") {
    if (disabled) return;
    const accepted = await onAnswer(
      decision,
      decision === "approved" && remember && card.error !== "ruleLimit",
    );
    if (accepted) onAnswered();
  }
  return (
    <article
      id={`approval-${card.requestId}`}
      data-approval-card={card.requestId}
      data-message-row={`approval:${card.requestId}`}
      aria-labelledby={id}
      aria-busy={card.answering}
      tabIndex={-1}
      className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3 id={id} className="min-w-0 font-medium wrap-anywhere">
        {t(toolLabelKeys[card.toolName])}
      </h3>
      <pre className="min-w-0 rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap wrap-anywhere">
        <span>{card.target.slice(0, 1024)}</span>
        {"\n"}
        {card.argumentSummary.slice(0, 1024)}
      </pre>
      <p className="text-xs text-muted-foreground wrap-anywhere">
        {t("approval.addressedTo", { member: addressed ? t("you") : card.memberAccountId })}
      </p>
      {card.state === "pending" ? (
        <>
          <p className="text-xs text-muted-foreground tabular-nums">
            {expired
              ? t("approval.awaitingExpiry")
              : t("approval.remaining", { seconds: String(remaining) })}
          </p>
          {addressed && (
            <>
              <Field
                orientation="horizontal"
                data-disabled={disabled || card.error === "ruleLimit"}
              >
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
        </>
      ) : (
        <p className="text-xs text-muted-foreground wrap-anywhere">
          <span>{t(`approval.states.${card.state}`)}</span>
          {card.answeredByAccountId && (
            <>
              {" "}
              ·{" "}
              {t("approval.answeredBy", {
                member:
                  card.answeredByAccountId === accountId ? t("you") : card.answeredByAccountId,
              })}
            </>
          )}
        </p>
      )}
      {card.error && (
        <p className="text-xs text-muted-foreground wrap-anywhere">{t(errorKeys[card.error])}</p>
      )}
    </article>
  );
}
