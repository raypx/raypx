import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Button } from "heroui-native/button";
import {
  toolDisplayLabel,
  type ApprovalCardView,
  type conversationTimelineRows,
} from "@raypx/agents/model";
import type { ToolActivity as ToolCall } from "@raypx/core/conversation";
import { useCopy } from "../locale.js";

type ActivityRow = Extract<
  ReturnType<typeof conversationTimelineRows>[number],
  { kind: "activity" }
>;

function ToolCallRow({
  call,
  answer,
  memberName,
  spaceId,
  origin,
}: {
  spaceId: string;
  origin: string;
  call: ToolCall;
  answer?: ApprovalCardView | undefined;
  memberName?: ((id: string) => string) | undefined;
}) {
  const { t } = useCopy();
  const [linkError, setLinkError] = useState(false);
  const pageTool = ["agent_page_create", "agent_page_update", "agent_page_read"].includes(
    call.toolName,
  );
  function openPage() {
    const url = new URL("/pages", origin);
    url.searchParams.set("spaceId", spaceId);
    if (call.page) url.searchParams.set("pageId", call.page.id);
    setLinkError(false);
    void Linking.openURL(url.href).catch(() => setLinkError(true));
  }
  const name = toolDisplayLabel(call.toolName, (key) => t(`agents.${key}`));
  return (
    <View
      testID={`tool:${call.runId}:${call.toolCallId}`}
      className="min-w-0 gap-1 border-l border-border pl-3"
    >
      {pageTool ? (
        <Button
          variant="ghost"
          accessibilityRole="link"
          accessibilityLabel={name}
          onPress={openPage}
          className="min-h-12 self-start"
        >
          <Button.Label>{name}</Button.Label>
        </Button>
      ) : (
        <Text className="text-sm font-medium text-foreground">{name}</Text>
      )}
      {linkError && (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("mobile.linkError")}
        </Text>
      )}
      <Text selectable className="font-mono text-sm text-muted-foreground">
        {call.target}
      </Text>
      {answer && answer.state !== "pending" && (
        <Text className="text-xs text-muted-foreground">
          {t(`agents.approval.states.${answer.state}`)}
          {answer.answeredByAccountId && memberName
            ? ` · ${t("agents.approval.answeredBy", { member: memberName(answer.answeredByAccountId) })}`
            : ""}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-x-3 gap-y-1">
        <Text className="text-xs text-muted-foreground">
          {t(`agents.activity.outcomes.${call.outcome ?? "running"}`)}
        </Text>
        {call.durationMs !== null ? (
          <Text className="text-xs text-muted-foreground">
            {t("agents.activity.duration", { seconds: (call.durationMs / 1_000).toFixed(1) })}
          </Text>
        ) : null}
        {call.toolName === "computer_run_command" &&
        call.outcome === "failed" &&
        call.exitStatus !== null ? (
          <Text className="text-xs text-muted-foreground">
            {t("agents.activity.exitStatus", { status: String(call.exitStatus) })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Render the shared timeline; it alone correlates cards and deduplicates tool calls. */
export function ToolActivity({
  spaceId,
  origin,
  row,
  answers = [],
  memberName,
}: {
  spaceId: string;
  origin: string;
  row: ActivityRow;
  answers?: readonly ApprovalCardView[];
  memberName?: ((id: string) => string) | undefined;
}) {
  const { t } = useCopy();
  const [expanded, setExpanded] = useState(false);
  const count = row.activity.length + row.pendingCount;
  const failed = row.activity.filter(
    (call) => call.outcome === "failed" || call.outcome === "refused",
  ).length;
  let status = "";
  if (row.activity.some((call) => call.outcome === null))
    status = t("agents.activity.outcomes.running");
  if (failed) status = t("agents.activity.failedCount", { count: failed });
  if (row.activity.some((call) => call.outcome === "unknown"))
    status = t("agents.activity.outcomes.unknown");
  if (row.pendingCount) status = t("agents.approval.states.pending");
  const summary = [t("agents.activity.used", { count }), status].filter(Boolean).join(" · ");
  if (!count) return null;
  return (
    <View className="min-w-0 gap-2">
      <Button
        variant="ghost"
        accessibilityLabel={summary}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        className="h-auto min-h-12 min-w-0 justify-start px-3 py-2"
      >
        <Button.Label numberOfLines={1} className="min-w-0 flex-1 text-sm text-muted-foreground">
          {summary}
        </Button.Label>
      </Button>
      {expanded ? (
        <View accessibilityLabel={t("agents.activity.title")} className="min-w-0 gap-3 py-1">
          {row.activity.map((call) => (
            <ToolCallRow
              key={JSON.stringify([call.runId, call.toolCallId])}
              call={call}
              spaceId={spaceId}
              origin={origin}
              answer={answers.find(
                (answer) => answer.runId === call.runId && answer.toolCallId === call.toolCallId,
              )}
              memberName={memberName}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
