import type { ConversationServerFrame } from "@raypx/contracts/api";
import type {
  ConversationEvent,
  LiveReply,
  Message,
  ReplySegment,
  Run,
  RunFailure,
  RunId,
  ToolActivity,
} from "@raypx/core/conversation";
import { MAX_REPLY_TEXT } from "@raypx/core/conversation";
import type { ConversationSelection, ConversationSnapshot } from "./port.js";
import type { ApprovalCardView } from "./approvals.js";
import { applyToolActivityEvent, mergeToolActivity } from "./tool-activity.js";

export interface RunView {
  id: RunId;
  agentId?: Run["agentId"] | undefined;
  parentRunId?: RunId | null | undefined;
  state: Run["state"];
  failureCode: RunFailure | null;
  messageId: string | undefined;
  createdAt: string;
  trigger?: Run["trigger"] | undefined;
  inboundProvenance?: Run["inboundProvenance"] | undefined;
}
export interface ConversationView {
  cursor: number;
  messages: Message[];
  segments: ReplySegment[];
  runs: RunView[];
  liveReplies: LiveReply[];
  toolActivity: ToolActivity[];
  toolActivityTruncated: boolean;
}
export type ConversationRow =
  | {
      id: string;
      kind: "member";
      sender: string;
      sequence: number;
      text: string;
      agentId?: Run["agentId"] | undefined;
      targetAgentIds?: Message["mentions"] | undefined;
    }
  | {
      id: string;
      kind: "reply";
      sender: string;
      agentId?: Run["agentId"] | undefined;
      sequence: number;
      text: string;
      run: RunView | undefined;
    };

/** Keep a reply in the same place and DOM row from queue through committed output. */
export function conversationRows(view: ConversationView): ConversationRow[] {
  const rows: ConversationRow[] = view.messages.map((message) => ({
    id: message.id,
    kind: "member",
    sender:
      message.author.kind === "agent"
        ? `agent:${message.author.agentId}`
        : `member:${message.author.accountId}`,
    ...(message.author.kind === "agent"
      ? { agentId: message.author.agentId, targetAgentIds: message.mentions }
      : {}),
    sequence: message.sequence,
    text: message.text,
  }));
  const runIds = new Set([
    ...view.runs.map((run) => run.id),
    ...view.segments.map((segment) => segment.runId),
    ...view.liveReplies.map((reply) => reply.runId),
  ]);
  for (const id of runIds) {
    const run = view.runs.find((item) => item.id === id);
    const segments = view.segments.filter((item) => item.runId === id);
    const live = view.liveReplies.find((item) => item.runId === id);
    if (run?.parentRunId || segments.some((segment) => segment.parentRunId) || live?.parentRunId)
      continue;
    if (
      run?.state === "succeeded" &&
      segments.length === 0 &&
      !live &&
      !view.runs.some((child) => child.parentRunId === id)
    )
      continue;
    const message = view.messages.find((item) => item.id === run?.messageId);
    rows.push({
      id: `reply:${id}`,
      kind: "reply",
      sender: `agent:${run?.agentId ?? segments[0]?.agentId ?? live?.agentId ?? ""}`,
      agentId: run?.agentId ?? segments[0]?.agentId ?? live?.agentId,
      sequence: message ? message.sequence + 0.5 : (segments[0]?.sequence ?? view.cursor + 1),
      text: [...segments.map((segment) => segment.text), ...(live?.text ? [live.text] : [])].join(
        "\n\n",
      ),
      run,
    });
  }
  return rows.sort(
    (left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id),
  );
}

export type ConversationTimelineRow =
  | ConversationRow
  | { id: string; kind: "approval"; sender: "approval"; sequence: number; card: ApprovalCardView }
  | {
      id: string;
      kind: "activity";
      sender: "approval";
      sequence: number;
      runId: RunId;
      activity: ToolActivity[];
      pendingCount: number;
    };

/** Pending cards replace their matching activity row until the request resolves. */
export function conversationTimelineRows(
  view: ConversationView,
  cards: readonly ApprovalCardView[],
): ConversationTimelineRow[] {
  const rows: ConversationTimelineRow[] = conversationRows(view);
  const pending = cards.filter(
    (card) =>
      card.state === "pending" &&
      !view.toolActivity.some(
        (call) =>
          call.runId === card.runId &&
          call.toolCallId === card.toolCallId &&
          call.finishedAt !== null,
      ),
  );
  const runIds = new Set([
    ...view.toolActivity.map((call) => call.runId),
    ...pending.map((card) => card.runId),
  ]);
  for (const runId of runIds) {
    const requests = pending.filter((card) => card.runId === runId);
    const child =
      view.runs.find((run) => run.id === runId)?.parentRunId ||
      view.toolActivity.find((call) => call.runId === runId)?.parentRunId;
    const activity = view.toolActivity.filter(
      (call) =>
        call.runId === runId && !requests.some((card) => card.toolCallId === call.toolCallId),
    );
    const reply = rows.find((row) => row.kind === "reply" && row.run?.id === runId);
    const run = view.runs.find((item) => item.id === runId);
    const message = view.messages.find((item) => item.id === run?.messageId);
    let sequence = requests[0]?.sequence ?? view.cursor + 1;
    if (message) sequence = message.sequence + 0.6;
    if (reply) sequence = reply.sequence + 0.1;
    if (!child)
      rows.push({
        id: `activity:${runId}`,
        kind: "activity",
        sender: "approval",
        sequence,
        runId,
        activity,
        pendingCount: requests.length,
      });
    for (const card of requests)
      rows.push({
        id: `approval:${card.requestId}`,
        kind: "approval",
        sender: "approval",
        sequence: sequence + 0.1 + requests.indexOf(card) / 1_000,
        card,
      });
  }
  return rows.sort((a, b) => a.sequence - b.sequence);
}

export function conversationSenderVisible(
  kind: "member" | "reply",
  context: { showAgentNames: boolean; hasOtherMembers: boolean },
  consecutive: boolean,
) {
  if (consecutive) return false;
  if (kind === "reply") return context.showAgentNames;
  return context.hasOtherMembers;
}

/** Stop the running reply first, then any queued reply in this conversation. */
export function activeConversationRun(
  runs: readonly RunView[],
  agentId?: string,
): RunView | undefined {
  const eligible = runs.filter((run) => !run.parentRunId && (!agentId || run.agentId === agentId));
  return (
    eligible.find((run) => run.state === "running") ??
    eligible.find((run) => run.state === "waiting") ??
    eligible.find((run) => run.state === "queued")
  );
}
/** Explicit mention IDs choose independent per-Agent steering targets. */
export function conversationSteeringTargets(runs: readonly RunView[], mentions: readonly string[]) {
  return [...new Set(mentions)].flatMap((id) => {
    const run = activeConversationRun(runs, id);
    return run ? [run] : [];
  });
}

/** Descendants remain activity under their root reply, never additional chat replies. */
export function delegatedWork(view: ConversationView, parentRunId: string) {
  const descendants = new Set<string>([parentRunId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const run of view.runs) {
      if (run.parentRunId && descendants.has(run.parentRunId) && !descendants.has(run.id)) {
        descendants.add(run.id);
        changed = true;
      }
    }
  }
  return view.runs
    .filter((run) => run.id !== parentRunId && descendants.has(run.id))
    .map((run) => ({
      run,
      // The public snapshot has no delegation summary or tool-call-to-child relation.
      task: "",
      activity: view.toolActivity.filter((call) => call.runId === run.id),
    }));
}
export interface ConversationEventEntry {
  event: ConversationEvent;
  message?: Message | undefined;
}
export type EventApplication = "applied" | "duplicate" | "snapshot-required" | "ignored";
export type ReplyApplication = "applied" | "ignored" | "reconnect";
type ReplyFrame = Extract<ConversationServerFrame, { type: "reply.prefix" | "reply.delta" }>;
function terminal(state: Run["state"]) {
  return state === "failed" || state === "cancelled" || state === "succeeded";
}

/** Applied projection and cursor move together, before the adapter sends an ACK. */
export class ConversationState {
  private view: ConversationView = {
    cursor: 0,
    messages: [],
    segments: [],
    runs: [],
    liveReplies: [],
    toolActivity: [],
    toolActivityTruncated: false,
  };
  constructor(readonly selection: ConversationSelection) {}
  getSnapshot = (): ConversationView => this.view;
  private owns(value: { spaceId: string; conversationId: string }) {
    return (
      value.spaceId === this.selection.spaceId &&
      value.conversationId === this.selection.conversationId
    );
  }
  applySnapshot(snapshot: ConversationSnapshot): boolean {
    if (
      snapshot.conversation.id !== this.selection.conversationId ||
      snapshot.conversation.spaceId !== this.selection.spaceId ||
      !Number.isSafeInteger(snapshot.cursor) ||
      snapshot.cursor < this.view.cursor ||
      snapshot.messages.some((item) => !this.owns(item) || item.sequence > snapshot.cursor) ||
      snapshot.segments.some((item) => !this.owns(item) || item.sequence > snapshot.cursor) ||
      snapshot.runs.some((item) => !this.owns(item))
    )
      return false;
    this.view = {
      cursor: snapshot.cursor,
      // A send receipt can finish after the snapshot transaction captured its cursor.
      // Preserve those confirmed messages while replay catches up to them.
      messages: [
        ...new Map(
          [
            ...snapshot.messages,
            ...this.view.messages.filter((item) => item.sequence > snapshot.cursor),
          ].map((item) => [item.id, item]),
        ).values(),
      ].sort((a, b) => a.sequence - b.sequence),
      segments: [...new Map(snapshot.segments.map((item) => [item.id, item])).values()].sort(
        (a, b) => a.sequence - b.sequence,
      ),
      runs: snapshot.runs.map((run) => ({
        id: run.id,
        agentId: run.agentId,
        parentRunId: run.parentRunId,
        state: run.state,
        failureCode: run.failureCode,
        messageId: run.messageId,
        createdAt: run.createdAt,
        trigger: run.trigger,
        inboundProvenance: run.inboundProvenance,
      })),
      liveReplies: [],
      toolActivity: mergeToolActivity([], snapshot.toolActivity ?? []),
      toolActivityTruncated: snapshot.toolActivityTruncated ?? false,
    };
    return true;
  }
  /** Snapshot metadata fills fields absent from run.state without replacing newer events. */
  applyRunDetails(runs: readonly Run[]): boolean {
    const scoped = new Map(runs.filter((run) => this.owns(run)).map((run) => [run.id, run]));
    let changed = false;
    const projected = this.view.runs.map((run) => {
      const detail = scoped.get(run.id);
      if (
        !detail ||
        (run.trigger === detail.trigger &&
          run.inboundProvenance === detail.inboundProvenance &&
          run.agentId === detail.agentId &&
          run.parentRunId === detail.parentRunId &&
          run.messageId === detail.messageId)
      )
        return run;
      changed = true;
      return {
        ...run,
        messageId: detail.messageId,
        agentId: detail.agentId,
        parentRunId: detail.parentRunId,
        trigger: detail.trigger,
        inboundProvenance: detail.inboundProvenance,
      };
    });
    if (changed) this.view = { ...this.view, runs: projected };
    return changed;
  }
  applyEvent(entry: ConversationEventEntry): EventApplication {
    const { event } = entry;
    if (!this.owns(event)) return "ignored";
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) return "snapshot-required";
    if (event.sequence <= this.view.cursor) return "duplicate";
    if (event.sequence !== this.view.cursor + 1) return "snapshot-required";
    if (event.kind === "message.created") {
      const message = entry.message;
      if (
        !message ||
        !this.owns(message) ||
        message.id !== event.messageId ||
        message.sequence !== event.sequence
      )
        return "snapshot-required";
      this.receiveMessage(message);
    }
    if (event.kind === "run.state") {
      if ((event.state === "failed") !== (event.failureCode !== null)) return "snapshot-required";
      const previous = this.view.runs.find((run) => run.id === event.runId);
      const messageId =
        previous?.messageId ??
        [...this.view.messages].reverse().find((message) => message.sequence < event.sequence)?.id;
      const run: RunView = {
        ...previous,
        id: event.runId,
        agentId: event.agentId ?? previous?.agentId,
        parentRunId: event.parentRunId ?? previous?.parentRunId,
        state: event.state,
        failureCode: event.failureCode,
        messageId,
        createdAt: previous?.createdAt ?? event.createdAt,
      };
      this.view = {
        ...this.view,
        runs: previous
          ? this.view.runs.map((item) => (item.id === run.id ? run : item))
          : [...this.view.runs, run],
        liveReplies: terminal(run.state)
          ? this.view.liveReplies.filter((item) => item.runId !== run.id)
          : this.view.liveReplies,
      };
    }
    if (event.kind === "reply.segment") {
      const segment = event.segment;
      if (!this.owns(segment) || segment.sequence !== event.sequence) return "snapshot-required";
      this.view = {
        ...this.view,
        segments: [...this.view.segments.filter((item) => item.id !== segment.id), segment].sort(
          (a, b) => a.sequence - b.sequence,
        ),
        liveReplies: this.view.liveReplies.filter(
          (item) => item.segmentId !== segment.id && item.runId !== segment.runId,
        ),
      };
    }
    if (event.kind === "tool.started" || event.kind === "tool.finished") {
      const toolActivity = applyToolActivityEvent(this.view.toolActivity, event);
      this.view = {
        ...this.view,
        toolActivity,
        toolActivityTruncated:
          this.view.toolActivityTruncated ||
          (this.view.toolActivity.length === 100 &&
            !this.view.toolActivity.some(
              (call) => call.runId === event.runId && call.toolCallId === event.toolCallId,
            )),
      };
    }
    this.view = { ...this.view, cursor: event.sequence };
    return "applied";
  }
  receiveMessage(message: Message): boolean {
    if (!this.owns(message)) return false;
    const previous = this.view.messages.find((item) => item.id === message.id);
    if (previous) return true;
    this.view = {
      ...this.view,
      messages: [...this.view.messages, message].sort((a, b) => a.sequence - b.sequence),
    };
    return true;
  }
  applyReply(frame: ReplyFrame): ReplyApplication {
    if (!this.owns(frame)) return "ignored";
    const run = this.view.runs.find((item) => item.id === frame.runId);
    if (
      (run && terminal(run.state)) ||
      this.view.segments.some((item) => item.id === frame.segmentId)
    )
      return "ignored";
    const previous = this.view.liveReplies.find(
      (item) => item.segmentId === frame.segmentId && item.runId === frame.runId,
    );
    let text = frame.text;
    if (frame.type === "reply.delta") {
      if (!previous || previous.text.length !== frame.offset) return "reconnect";
      text = previous.text + frame.text;
    }
    if (text.length > MAX_REPLY_TEXT) return "reconnect";
    const reply: LiveReply = {
      spaceId: frame.spaceId,
      conversationId: frame.conversationId,
      runId: frame.runId,
      segmentId: frame.segmentId,
      agentId: frame.agentId,
      parentRunId: frame.parentRunId,
      text,
    };
    this.view = {
      ...this.view,
      liveReplies: [...this.view.liveReplies.filter((item) => item.runId !== frame.runId), reply],
    };
    return "applied";
  }
  clearLiveReplies() {
    if (this.view.liveReplies.length) this.view = { ...this.view, liveReplies: [] };
  }
}
