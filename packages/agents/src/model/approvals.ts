import type { ApprovalRequest, ApprovalState, ComputerToolName } from "@raypx/core/approvals";
import type { ConversationEvent, RunId } from "@raypx/core/conversation";
import type { ConversationSelection } from "./port.js";

export type ApprovalCardError = "ruleLimit" | "unconfirmed" | "resolvedElsewhere";
export interface ApprovalCardView {
  requestId: ApprovalRequest["id"];
  runId: RunId;
  toolName: ComputerToolName;
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
