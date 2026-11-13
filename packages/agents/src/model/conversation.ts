import type { ConversationServerFrame } from "@raypx/contracts/api";
import type {
  ConversationEvent,
  LiveReply,
  Message,
  ReplySegment,
  Run,
  RunFailure,
  RunId,
} from "@raypx/core/conversation";
import { MAX_REPLY_TEXT } from "@raypx/core/conversation";
import type { ConversationSelection, ConversationSnapshot } from "./port.js";

export interface RunView {
  id: RunId;
  state: Run["state"];
  failureCode: RunFailure | null;
  messageId: string | undefined;
  createdAt: string;
}
export interface ConversationView {
  cursor: number;
  messages: Message[];
  segments: ReplySegment[];
  runs: RunView[];
  liveReplies: LiveReply[];
}
export type ConversationRow =
  | { id: string; kind: "member"; sender: string; sequence: number; text: string }
  | {
      id: string;
      kind: "reply";
      sender: "agent";
      sequence: number;
      text: string;
      run: RunView | undefined;
    };

/** Keep a reply in the same place and DOM row from queue through committed output. */
export function conversationRows(view: ConversationView): ConversationRow[] {
  const rows: ConversationRow[] = view.messages.map((message) => ({
    id: message.id,
    kind: "member",
    sender: `member:${message.author.accountId}`,
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
    if (run?.state === "succeeded" && segments.length === 0 && !live) continue;
    const message = view.messages.find((item) => item.id === run?.messageId);
    rows.push({
      id: `reply:${id}`,
      kind: "reply",
      sender: "agent",
      sequence: message ? message.sequence + 0.5 : (segments[0]?.sequence ?? view.cursor + 1),
      text: segments.map((segment) => segment.text).join("\n\n") || live?.text || "",
      run,
    });
  }
  return rows.sort((left, right) => left.sequence - right.sequence);
}

/** Stop the running reply first, then any queued reply in this conversation. */
export function activeConversationRun(runs: readonly RunView[]): RunView | undefined {
  return runs.find((run) => run.state === "running") ?? runs.find((run) => run.state === "queued");
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
        state: run.state,
        failureCode: run.failureCode,
        messageId: run.messageId,
        createdAt: run.createdAt,
      })),
      liveReplies: [],
    };
    return true;
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
        this.view.messages.find((message) => message.sequence === event.sequence - 1)?.id;
      const run: RunView = {
        id: event.runId,
        state: event.state,
        failureCode: event.failureCode,
        messageId,
        createdAt: previous?.createdAt ?? event.createdAt,
      };
      this.view = {
        ...this.view,
        runs: [...this.view.runs.filter((item) => item.id !== run.id), run],
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
      this.view.segments.some((item) => item.id === frame.segmentId || item.runId === frame.runId)
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
