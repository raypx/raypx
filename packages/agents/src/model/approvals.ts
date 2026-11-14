import {
  approvalRequestIdSchema,
  toolNameSchema,
  type ApprovalRequest,
  type ApprovalState,
  type ToolName,
} from "@raypx/core/approvals";
import type {
  PendingApprovalSummary,
  ConversationEvent,
  RunId,
  ResolvedApprovalSummary,
  ToolActivity,
} from "@raypx/core/conversation";
import type { ConversationSelection } from "./port.js";
import { toolDisplayLabel, type ToolLabelKey } from "./tool-label.js";

export type ApprovalCardError = "ruleLimit" | "unconfirmed" | "resolvedElsewhere";
export interface ApprovalCardView {
  requestId: ApprovalRequest["id"];
  runId: RunId;
  toolCallId?: string | undefined;
  toolName: ToolName;
  target: string;
  argumentSummary: string;
  memberAccountId: string;
  expiresAt: string;
  createdAt: string;
  sequence: number;
  state: ApprovalState;
  answeredByAccountId: string | null;
  answering: boolean;
  error: ApprovalCardError | null;
}

/** Countdown is presentation only; the server owns request expiration. */
export function approvalRemainingSeconds(card: Pick<ApprovalCardView, "expiresAt">, now: number) {
  return Math.max(0, Math.ceil((Date.parse(card.expiresAt) - now) / 1_000));
}

export function approvalDuration(seconds: number) {
  if (seconds > 60) return { unit: "minutes" as const, value: Math.ceil(seconds / 60) };
  return { unit: "seconds" as const, value: Math.max(0, seconds) };
}

export function approvalDeadlineProminent(seconds: number) {
  return seconds <= 60;
}

/** Remove only known tool summaries that repeat the action and target exactly. */
export function approvalExtraSummary(
  card: Pick<ApprovalCardView, "toolName" | "target" | "argumentSummary">,
) {
  const labels = {
    "tools.listFiles": ["List files", "列出文件"],
    "tools.readFile": ["Read file", "Read a file", "读取文件"],
    "tools.writeFile": ["Write file", "Write a file", "写入文件"],
    "tools.runCommand": ["Run command", "Run a command", "运行命令"],
    "tools.saveMemory": ["Save memory", "保存记忆"],
    "tools.updateMemory": ["Update memory", "更新记忆"],
    "tools.createPage": ["Create page", "创建页面"],
    "tools.updatePage": ["Update page", "更新页面"],
    "tools.readPage": ["Read page", "读取页面"],
    "tools.loadSkill": ["Load skill", "加载技能"],
    "tools.saveSkill": ["Save skill", "保存技能"],
    "tools.messageAgent": ["Message Agent", "向智能体发消息"],
    "tools.delegateTask": ["Delegate task", "委派任务"],
    "tools.waitForChildren": ["Wait for delegated work", "等待委派任务"],
  } satisfies Record<ToolLabelKey, string[]>;
  const summary = card.argumentSummary.trim();
  if (
    card.toolName.startsWith("openapi_") &&
    /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS) .+$/u.test(summary)
  )
    return "";
  const display = toolDisplayLabel(card.toolName);
  const variants = Object.hasOwn(labels, display) ? labels[display as ToolLabelKey] : [display];
  const redundant = variants.some(
    (label) =>
      summary === label ||
      summary === `${label}: ${card.target}` ||
      summary === `${label}：${card.target}`,
  );
  if (redundant || summary === card.target || summary === `Path: ${card.target}`) return "";
  return summary.slice(0, 1024);
}

/** These are approval outcomes, never claims that an approved tool actually ran. */
export function activityForRun(cards: readonly ApprovalCardView[], runId: RunId) {
  return cards.filter((card) => card.runId === runId).sort((a, b) => a.sequence - b.sequence);
}

/** Only bounded card data enters the conversation projection, never exact arguments. */
export class ApprovalProjection {
  private cards: ApprovalCardView[] = [];
  private readonly submitted = new Set<ApprovalRequest["id"]>();
  constructor(readonly selection: ConversationSelection) {}
  getSnapshot = () => this.cards;
  private owns(value: ConversationSelection) {
    return (
      value.spaceId === this.selection.spaceId &&
      value.conversationId === this.selection.conversationId
    );
  }
  private put(card: ApprovalCardView) {
    this.cards = [...this.cards.filter((item) => item.requestId !== card.requestId), card].sort(
      (a, b) => a.sequence - b.sequence,
    );
  }
  applyEvent(event: ConversationEvent) {
    if (!this.owns(event) || (event.kind !== "card.created" && event.kind !== "card.resolved"))
      return;
    const previous = this.cards.find((card) => card.requestId === event.requestId);
    if (
      event.kind === "card.created" &&
      previous?.state !== undefined &&
      previous.state !== "pending"
    )
      return;
    const resolved = event.kind === "card.resolved";
    this.put({
      requestId: event.requestId,
      runId: event.runId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      target: event.target.slice(0, 1_024),
      argumentSummary: event.argumentSummary.slice(0, 1_024),
      memberAccountId: event.memberAccountId,
      expiresAt: event.expiresAt,
      createdAt: previous?.createdAt ?? event.createdAt,
      sequence:
        previous && Number.isInteger(previous.sequence) ? previous.sequence : event.sequence,
      state: resolved ? event.outcome : "pending",
      answeredByAccountId: resolved ? event.answeredByAccountId : null,
      answering: resolved ? false : (previous?.answering ?? false),
      error: resolved ? null : (previous?.error ?? null),
    });
  }
  hydrate(requests: readonly ApprovalRequest[], position: (request: ApprovalRequest) => number) {
    for (const request of requests) {
      if (!this.owns(request)) continue;
      const previous = this.cards.find((card) => card.requestId === request.id);
      if (previous && previous.state !== "pending") continue;
      this.receive(request, previous?.sequence ?? position(request));
    }
  }
  hydratePending(summaries: readonly PendingApprovalSummary[], sequence: number) {
    for (const summary of summaries) {
      const previous = this.cards.find((card) => card.requestId === summary.requestId);
      if (previous) continue;
      this.put({
        ...summary,
        createdAt: summary.createdAt,
        sequence,
        state: "pending",
        answeredByAccountId: null,
        answering: false,
        error: null,
      });
    }
  }
  /** Resolved summaries expose attribution; lifecycle rows supply their bounded display metadata. */
  hydrateResolved(
    summaries: readonly ResolvedApprovalSummary[],
    activity: readonly ToolActivity[],
    position: (runId: RunId) => number,
  ) {
    const calls = new Map(
      activity.map((call) => [JSON.stringify([call.runId, call.toolCallId]), call]),
    );
    for (const summary of summaries) {
      const call = calls.get(JSON.stringify([summary.runId, summary.toolCallId]));
      if (!call) continue;
      const toolName = toolNameSchema.safeParse(call.toolName);
      if (!toolName.success) continue;
      const requestId = approvalRequestIdSchema.parse(summary.requestId);
      const previous = this.cards.find((card) => card.requestId === requestId);
      if (previous && previous.state !== "pending") continue;
      this.put({
        requestId,
        runId: summary.runId,
        toolCallId: summary.toolCallId,
        toolName: toolName.data,
        target: call.target,
        argumentSummary: call.argumentSummary,
        memberAccountId: previous?.memberAccountId ?? "",
        expiresAt: summary.resolvedAt,
        createdAt: previous?.createdAt ?? call.startedAt,
        sequence: previous?.sequence ?? position(summary.runId),
        state: summary.outcome,
        answeredByAccountId: summary.answeredByAccountId,
        answering: false,
        error: null,
      });
    }
  }
  reconcileMissing(
    requests: readonly ApprovalRequest[],
    known: ReadonlySet<ApprovalRequest["id"]>,
    accountId: string,
  ) {
    // A full bounded page cannot establish absence; the contract has no continuation cursor.
    if (requests.length >= 100) return;
    const present = new Set(requests.map((request) => request.id));
    for (const card of this.cards) {
      if (
        known.has(card.requestId) &&
        !present.has(card.requestId) &&
        card.memberAccountId === accountId &&
        card.state === "pending" &&
        !card.answering
      )
        this.put({ ...card, error: "resolvedElsewhere" });
    }
  }
  receive(request: ApprovalRequest, sequence: number) {
    if (!this.owns(request)) return;
    const previous = this.cards.find((card) => card.requestId === request.id);
    if (previous && previous.state !== "pending" && request.state === "pending") return;
    this.put({
      requestId: request.id,
      runId: request.runId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      target: request.target.slice(0, 1_024),
      argumentSummary: request.argumentSummary.slice(0, 1_024),
      memberAccountId: request.memberAccountId,
      expiresAt: request.expiresAt,
      createdAt: request.createdAt,
      sequence,
      state: request.state,
      answeredByAccountId: request.answeredByAccountId,
      answering: request.state === "pending" && (previous?.answering ?? false),
      error: request.state === "pending" ? (previous?.error ?? null) : null,
    });
  }
  /** Retain addressed pending requests while releasing resolved rows with their history window. */
  retainRuns(runIds: ReadonlySet<string>, boundOutsidePending = false) {
    const recentResolved = new Set(
      this.cards
        .filter((card) => card.state !== "pending")
        .slice(-100)
        .map((card) => card.requestId),
    );
    this.cards = this.cards.filter(
      (card) =>
        (card.state === "pending" && (!boundOutsidePending || runIds.has(card.runId))) ||
        runIds.has(card.runId) ||
        recentResolved.has(card.requestId),
    );
    const retained = new Set(this.cards.map((card) => card.requestId));
    for (const id of this.submitted) if (!retained.has(id)) this.submitted.delete(id);
  }
  begin(requestId: ApprovalRequest["id"], accountId: string, now: number) {
    const card = this.cards.find((item) => item.requestId === requestId);
    if (
      !card ||
      card.memberAccountId !== accountId ||
      card.state !== "pending" ||
      card.answering ||
      card.error === "unconfirmed" ||
      card.error === "resolvedElsewhere" ||
      this.submitted.has(requestId) ||
      approvalRemainingSeconds(card, now) === 0
    )
      return false;
    this.submitted.add(requestId);
    this.put({ ...card, answering: true, error: null });
    return true;
  }
  reject(requestId: ApprovalRequest["id"], reason: string) {
    const card = this.cards.find((item) => item.requestId === requestId);
    if (!card || card.state !== "pending") return;
    if (reason === "RULE_LIMIT") {
      this.submitted.delete(requestId);
      this.put({ ...card, answering: false, error: "ruleLimit" });
      return;
    }
    if (reason === "EXPIRED") {
      this.put({ ...card, state: "expired", answering: false, error: null });
      return;
    }
    this.put({
      ...card,
      answering: false,
      error: reason === "ALREADY_RESOLVED" ? "resolvedElsewhere" : "unconfirmed",
    });
  }
}
