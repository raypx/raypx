import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Switch } from "heroui-native/switch";
import {
  toolOperationLabel,
  automaticApprovalState,
  openApiOperationKind,
  approvalDeadlineProminent,
  approvalDuration,
  approvalExtraSummary,
  approvalRemainingSeconds,
  type ApprovalCardView,
} from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";

export interface ApprovalCardProps {
  card: ApprovalCardView;
  accountId: string;
  memberName?: ((id: string) => string) | undefined;
  agentName?: string | undefined;
  onAnswer: (
    requestId: ApprovalCardView["requestId"],
    decision: "approved" | "denied",
    allowTool?: boolean,
  ) => void;
  onRefresh: () => void;
}

/** The shared projection gates submission; this card only expresses the member's choice. */
export function ApprovalCard({
  card,
  accountId,
  memberName,
  agentName,
  onAnswer,
  onRefresh,
}: ApprovalCardProps) {
  const { t } = useCopy();
  const [now, setNow] = useState(Date.now);
  const [remember, setRemember] = useState(false);
  const refreshedExpiry = useRef<string | null>(null);
  const pending = card.state === "pending";
  const automatic = automaticApprovalState(card);
  const remaining = approvalRemainingSeconds(card, now);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [pending, card.expiresAt]);
  useEffect(() => {
    const key = `${card.requestId}:${card.expiresAt}`;
    if (!pending || remaining !== 0 || refreshedExpiry.current === key) return;
    refreshedExpiry.current = key;
    onRefresh();
  }, [card.requestId, card.expiresAt, pending, remaining, onRefresh]);
  const duration = approvalDuration(remaining);
  const addressed = card.memberAccountId === accountId;
  const disabled =
    card.answering ||
    remaining === 0 ||
    card.error === "unconfirmed" ||
    card.error === "resolvedElsewhere";
  const summary = approvalExtraSummary(card);
  const operationKind = openApiOperationKind(card);
  const rememberLabel = t(
    card.toolName === "computer_run_command"
      ? "agents.approval.alwaysExecutable"
      : "agents.approval.alwaysTool",
  );
  let deadline = t("agents.approval.awaitingExpiry");
  if (remaining > 0) {
    deadline = t(
      duration.unit === "minutes" ? "agents.approval.minutesLeft" : "agents.approval.secondsLeft",
      { count: duration.value },
    );
  }
  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      {agentName && (
        <Text className="text-sm text-muted-foreground">
          {t("agents.approval.requestedBy", { name: agentName })}
        </Text>
      )}
      <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
        {toolOperationLabel(card, (key) => t(`agents.${key}`))}
      </Text>
      {operationKind && (
        <Text className="text-xs text-muted-foreground">
          {t(`agents.openapi.${operationKind}`)}
        </Text>
      )}
      <Text selectable className="text-sm text-foreground">
        {card.target}
      </Text>
      {summary ? (
        <Text selectable className="text-sm leading-5 text-muted-foreground">
          {summary}
        </Text>
      ) : null}
      <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
        {automatic
          ? t(`agents.approval.automatic.${automatic}`)
          : t(`agents.approval.states.${card.state}`)}
      </Text>
      {card.review?.reason ? (
        <Text selectable className="text-sm text-muted-foreground">
          {card.review.reason}
        </Text>
      ) : null}
      {pending ? (
        <>
          <Text
            accessibilityLiveRegion="none"
            className={
              approvalDeadlineProminent(remaining)
                ? "text-sm font-semibold text-foreground"
                : "text-sm text-muted-foreground"
            }
          >
            {deadline}
          </Text>
          {!addressed ? (
            <Text className="text-sm text-muted-foreground">
              {t("agents.approval.waitingFor", {
                member: memberName?.(card.memberAccountId) ?? t("agents.member"),
              })}
            </Text>
          ) : (
            <>
              <View className="flex-row items-center gap-3">
                <Switch
                  accessibilityLabel={rememberLabel}
                  isSelected={remember}
                  onSelectedChange={setRemember}
                  isDisabled={disabled || card.error === "ruleLimit"}
                />
                <Text className="flex-1 text-sm leading-5 text-foreground">{rememberLabel}</Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                <View className="min-w-32 flex-1">
                  <Action
                    label={t("agents.approval.approve")}
                    busy={card.answering}
                    disabled={disabled}
                    onPress={() =>
                      onAnswer(card.requestId, "approved", remember && card.error !== "ruleLimit")
                    }
                  />
                </View>
                <View className="min-w-32 flex-1">
                  <Action
                    label={t("agents.approval.deny")}
                    secondary
                    disabled={disabled}
                    onPress={() => onAnswer(card.requestId, "denied")}
                  />
                </View>
              </View>
            </>
          )}
          {card.error ? (
            <>
              <Text accessibilityRole="alert" className="text-sm leading-5 text-foreground">
                {t(`agents.approval.${card.error}`)}
              </Text>
              <Action label={t("agents.refresh")} secondary onPress={onRefresh} />
            </>
          ) : null}
        </>
      ) : null}
      {!pending && card.answeredByAccountId ? (
        <Text className="text-sm text-muted-foreground">
          {t("agents.approval.answeredBy", {
            member:
              memberName?.(card.answeredByAccountId) ??
              t(card.answeredByAccountId === accountId ? "agents.you" : "agents.member"),
          })}
        </Text>
      ) : null}
    </View>
  );
}
