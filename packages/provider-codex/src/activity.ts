import { object, type ConversationSink, type TokenTotals } from "@raypx/provider-core";
const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function recordCodexActivity(
  sink: ConversationSink,
  method: string,
  params: Record<string, unknown>,
) {
  if (method === "turn/started") sink.codexTurn = text(object(params.turn).id);
  if (method === "item/agentMessage/delta") {
    const key = params.itemId ? `codex:${text(params.itemId)}` : sink.currentMessage;
    sink.message(key, text(params.delta), false, true);
  }
  if (method === "item/started" || method === "item/completed") {
    const item = object(params.item),
      id = text(item.id),
      kind = text(item.type);
    if (kind === "agentMessage")
      sink.message(
        id ? `codex:${id}` : sink.currentMessage,
        text(item.text),
        method === "item/completed",
      );
    const names: Record<string, string> = {
      commandExecution: "Shell",
      fileChange: "Edit",
      mcpToolCall: text(item.tool),
      dynamicToolCall: text(item.tool),
      webSearch: "WebSearch",
      imageView: "ViewImage",
      contextCompaction: "Compact",
    };
    if (Object.hasOwn(names, kind))
      sink.tool(
        id || `${kind}:${sink.turn}`,
        names[kind] || kind,
        method === "item/started"
          ? "running"
          : ["failed", "declined"].includes(text(item.status))
            ? "failed"
            : "succeeded",
      );
  }
  if (method === "thread/tokenUsage/updated") {
    if (params.turnId && sink.codexTurn && params.turnId !== sink.codexTurn) return;
    const total = object(object(params.tokenUsage).total);
    const usage: TokenTotals = {
      inputTokens: count(total.inputTokens),
      outputTokens: count(total.outputTokens),
      cachedInputTokens: count(total.cachedInputTokens),
      cacheWriteInputTokens: count(total.cacheWriteInputTokens),
    };
    if (!sink.turn && Object.keys(total).length) {
      sink.totals = usage;
      sink.persistTotals?.(usage);
      return;
    }
    if (!Object.keys(total).length) {
      sink.usageKnown = false;
      sink.usage(0, 0, 0, 0, undefined, false);
      return;
    }
    if (sink.totals) {
      if (
        (Object.keys(usage) as (keyof TokenTotals)[]).some((key) => usage[key] < sink.totals![key])
      ) {
        // A resumed provider can reset any cumulative counter. Do not fabricate
        // the missing interval; use the new totals as the next baseline.
        sink.totals = usage;
        sink.persistTotals?.(usage);
        sink.usageKnown = false;
        sink.usage(
          sink.turnUsage.inputTokens,
          sink.turnUsage.outputTokens,
          sink.turnUsage.cachedInputTokens,
          sink.turnUsage.cacheWriteInputTokens,
          undefined,
          false,
        );
        return;
      }
      if (
        (Object.keys(usage) as (keyof TokenTotals)[]).every(
          (key) => usage[key] === sink.totals![key],
        )
      )
        return;
      for (const key of Object.keys(usage) as (keyof TokenTotals)[])
        sink.turnUsage[key] += usage[key] - sink.totals[key];
    } else sink.usageKnown = false;
    sink.totals = usage;
    sink.persistTotals?.(usage);
    sink.usage(
      sink.turnUsage.inputTokens,
      sink.turnUsage.outputTokens,
      sink.turnUsage.cachedInputTokens,
      sink.turnUsage.cacheWriteInputTokens,
      undefined,
      sink.usageKnown,
    );
  }
}
