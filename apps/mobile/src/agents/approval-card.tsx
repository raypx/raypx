import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Switch } from "heroui-native/switch";
import {
  approvalDeadlineProminent,
  approvalDuration,
  approvalExtraSummary,
  approvalRemainingSeconds,
  type ApprovalCardView,
} from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";

const toolKeys = {
  computer_list_files: "agents.tools.listFiles",
  computer_read_file: "agents.tools.readFile",
  computer_write_file: "agents.tools.writeFile",
  computer_run_command: "agents.tools.runCommand",
  agent_memory_save: "agents.tools.saveMemory",
  agent_memory_update: "agents.tools.updateMemory",
  agent_send_message: "agents.tools.messageAgent",
  agent_delegate: "agents.tools.delegateTask",
  agent_wait: "agents.tools.waitForChildren",
} as const;

export interface ApprovalCardProps {
  card: ApprovalCardView;
  accountId: string;
  onAnswer: (
    requestId: ApprovalCardView["requestId"],
    decision: "approved" | "denied",
    allowTool?: boolean,
  ) => void;
  onRefresh: () => void;
}

/** The shared projection gates submission; this card only expresses the member's choice. */
export function ApprovalCard({ card, accountId, onAnswer, onRefresh }: ApprovalCardProps) {
  const { t } = useCopy();
  const [now, setNow] = useState(Date.now);
  const [remember, setRemember] = useState(false);
  const refreshedExpiry = useRef<string | null>(null);
  const pending = card.state === "pending";
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
      <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
        {t(toolKeys[card.toolName])}
      </Text>
      <Text selectable className="text-sm text-foreground">
        {card.target}
      </Text>
      {summary ? (
        <Text selectable className="text-sm leading-5 text-muted-foreground">
          {summary}
        </Text>
      ) : null}
      <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
        {t(`agents.approval.states.${card.state}`)}
      </Text>
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
              {t("agents.approval.waitingFor", { member: t("agents.member") })}
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
            member: t(card.answeredByAccountId === accountId ? "agents.you" : "agents.member"),
          })}
        </Text>
      ) : null}
    </View>
  );
}
