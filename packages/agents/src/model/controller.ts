import type { ConversationServerFrame } from "@raypx/contracts/api";
import type { AgentId } from "@raypx/core/agents";
import { editMentionTokens, insertMention, mentionIds, type MentionToken } from "./mentions.js";
import type { RunId } from "@raypx/core/conversation";
import type { ApprovalRequest } from "@raypx/core/approvals";
import { ApprovalProjection, type ApprovalCardView } from "./approvals.js";
import { ConversationState, type ConversationView } from "./conversation.js";
import type { ComputerController } from "./computer.js";
import {
  conversationDraftKey,
  MAX_CONVERSATION_DRAFT,
  readConversationDraft,
  writeConversationDraft,
  type PendingMessage,
} from "./drafts.js";
import type {
  ConversationDraftStore,
  ConversationOwner,
  ConversationPort,
  ConversationSelection,
  ConversationSocket,
  ConversationSocketPort,
  ApprovalPort,
} from "./port.js";

export type ConversationConnection = "connecting" | "live" | "reconnecting" | "snapshot-required";
export type ConversationError = "load" | "send" | "stop" | "storage";
export interface ConversationControllerView extends ConversationView {
  cards: ApprovalCardView[];
  approvalsLoading: boolean;
  approvalsError: boolean;
  connection: ConversationConnection;
  loading: boolean;
  error: ConversationError | null;
  draft: string;
  mentionTokens?: MentionToken[] | undefined;
  sendCode?: SendFailureCode | null | undefined;
  sending: boolean;
  pending: PendingMessage | null;
}
export interface ConversationControllerOptions {
  approvals?: ApprovalPort;
  computer?: ComputerController;
  selection: ConversationSelection;
  owner: ConversationOwner;
  port: ConversationPort;
  socket: ConversationSocketPort;
  drafts: ConversationDraftStore;
  key(): string;
}

/** Owns one selected conversation. Adapters provide transport and device persistence. */
export class ConversationController {
  readonly state: ConversationState;
  private readonly approvals: ApprovalProjection;
  private readonly listeners = new Set<() => void>();
  private readonly draftKey: string;
  private view: ConversationControllerView;
  private socket: ConversationSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private started = false;
  private disposed = false;
  private suspended = false;
  private hasSnapshot = false;
  private storageUnavailable = false;
  private approvalsGeneration = 0;
  private runDetailsLoading = false;
  constructor(private readonly options: ConversationControllerOptions) {
    this.state = new ConversationState(options.selection);
    this.approvals = new ApprovalProjection(options.selection);
    this.draftKey = conversationDraftKey(options.owner, options.selection);
    let draft = { text: "", pending: null } as ReturnType<typeof readConversationDraft>;
    let error: ConversationError | null = null;
    try {
      draft = readConversationDraft(options.drafts.read(this.draftKey));
    } catch {
      error = "storage";
      this.storageUnavailable = true;
    }
    this.view = {
      ...this.state.getSnapshot(),
      cards: [],
      approvalsLoading: false,
      approvalsError: false,
      connection: "connecting",
      loading: true,
      error,
      draft: draft.text,
      mentionTokens: draft.mentionTokens ?? [],
      pending: draft.pending,
      sending: false,
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<ConversationControllerView> = {}) {
    if (this.disposed) return;
    const error = patch.error === null && this.storageUnavailable ? "storage" : patch.error;
    this.view = {
      ...this.view,
      ...this.state.getSnapshot(),
      cards: this.approvals.getSnapshot(),
      ...patch,
      ...(error !== undefined ? { error } : {}),
    };
    for (const listener of this.listeners) listener();
  }
  private persist(text = this.view.draft, pending = this.view.pending): boolean {
    try {
      if (!text && !pending) this.options.drafts.remove(this.draftKey);
      else
        this.options.drafts.write(
          this.draftKey,
          writeConversationDraft({ text, pending, mentionTokens: this.view.mentionTokens }),
        );
      this.storageUnavailable = false;
      if (this.view.error === "storage") this.update({ error: null });
      return true;
    } catch {
      this.storageUnavailable = true;
      this.update({ error: "storage" });
      return false;
    }
  }
  setDraft(text: string) {
    if (this.disposed || text.length > MAX_CONVERSATION_DRAFT) return;
    this.update({
      draft: text,
      mentionTokens: editMentionTokens(this.view.draft, text, this.view.mentionTokens ?? []),
      sendCode: null,
      error: this.view.error === "load" ? "load" : null,
    });
    this.persist(text);
  }
  addMention(start: number, end: number, agentId: AgentId, label: string): number {
    if (this.disposed || this.view.pending) return end;
    const result = insertMention(
      this.view.draft,
      this.view.mentionTokens ?? [],
      start,
      end,
      agentId,
      label,
    );
    if (result.text.length > MAX_CONVERSATION_DRAFT) return end;
    this.update({ draft: result.text, mentionTokens: result.tokens });
    this.persist();
    return result.caret;
  }
  async start() {
    if (this.started || this.disposed) return;
    this.started = true;
    if (this.suspended) return;
    await this.refreshSnapshot("connecting");
  }
  private closeSocket() {
    const socket = this.socket;
    this.socket = undefined;
    try {
      socket?.close();
    } catch {
      // Lifecycle fencing already invalidated this socket; it can no longer apply data.
    }
  }
  private cancelTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private async refreshSnapshot(connection: ConversationConnection) {
    this.cancelTimer();
    const generation = ++this.generation;
    this.closeSocket();
    this.state.clearLiveReplies();
    this.update({ connection, loading: !this.hasSnapshot, error: null });
    try {
      const snapshot = await this.options.port.snapshot(this.options.selection);
      if (this.disposed || generation !== this.generation) return;
      if (!this.state.applySnapshot(snapshot)) throw new Error("Invalid conversation snapshot");
      this.hasSnapshot = true;
      this.update({ loading: false });
      void this.refreshApprovals();
      this.openSocket();
    } catch {
      if (this.disposed || generation !== this.generation) return;
      this.update({ loading: false, error: "load" });
    }
  }
  private openSocket() {
    if (this.disposed || this.suspended) return;
    const generation = ++this.generation;
    this.timer = setTimeout(() => {
      if (!this.disposed && generation === this.generation) this.interrupted(false);
    }, 10_000);
    const waiting: ConversationServerFrame[] = [];
    let opening = true;
    const onFrame = (frame: ConversationServerFrame) => {
      if (this.disposed || generation !== this.generation) return;
      if (opening) waiting.push(frame);
      else this.receiveFrame(frame);
    };
    try {
      const socket = this.options.socket.connect({
        onFrame,
        onClose: (code) => {
          if (this.disposed || generation !== this.generation) return;
          this.interrupted(code === 4001 || code === 4003);
        },
        onError: () => {
          if (!this.disposed && generation === this.generation) this.interrupted(false);
        },
      });
      if (this.disposed || generation !== this.generation) {
        socket.close();
        return;
      }
      this.socket = socket;
      opening = false;
      for (const frame of waiting) onFrame(frame);
    } catch {
      opening = false;
      this.interrupted(false);
    }
  }
  private sendFrame(frame: Parameters<ConversationSocket["send"]>[0]): boolean {
    try {
      if (!this.socket) return false;
      this.socket.send(frame);
      return true;
    } catch {
      this.interrupted(false);
      return false;
    }
  }
  private receiveFrame(frame: ConversationServerFrame) {
    if (frame.type === "ready") {
      this.cancelTimer();
      const subscribed = this.sendFrame({
        type: "subscribe",
        version: 1,
        ...this.options.selection,
        after: this.view.cursor,
      });
      if (subscribed) {
        this.update({ connection: "live", error: null });
        void this.options.computer?.refresh();
        void this.refreshApprovals();
      }
      return;
    }
    if (frame.type === "event") {
      const applied = this.state.applyEvent(frame.entry);
      if (applied === "snapshot-required") {
        void this.refreshSnapshot("snapshot-required");
        return;
      }
      if (applied === "ignored") return;
      if (applied === "applied" && frame.entry.event.kind === "computer.state")
        this.options.computer?.applyEvent(frame.entry.event);
      if (applied === "applied") this.approvals.applyEvent(frame.entry.event);
      this.update();
      if (applied === "applied" && frame.entry.event.kind === "run.state")
        void this.refreshRunDetails();
      this.sendFrame({
        type: "ack",
        version: 1,
        ...this.options.selection,
        sequence: frame.entry.event.sequence,
      });
      return;
    }
    if (
      frame.spaceId !== this.options.selection.spaceId ||
      frame.conversationId !== this.options.selection.conversationId
    )
      return;
    if (frame.type === "snapshot-required") {
      void this.refreshSnapshot("snapshot-required");
      return;
    }
    const applied = this.state.applyReply(frame);
    if (applied === "reconnect") this.interrupted(false);
    else if (applied === "applied") this.update();
  }
  private async refreshRunDetails() {
    if (this.runDetailsLoading || !this.view.runs.some((run) => run.trigger === undefined)) return;
    this.runDetailsLoading = true;
    const requested = new Set(
      this.view.runs.filter((run) => run.trigger === undefined).map((run) => run.id),
    );
    const generation = this.generation;
    try {
      const snapshot = await this.options.port.snapshot(this.options.selection);
      if (this.disposed || generation !== this.generation) return;
      if (this.state.applyRunDetails(snapshot.runs)) this.update();
    } catch {
      // Reconnect or the next Run event retries metadata; never infer an origin.
    } finally {
      this.runDetailsLoading = false;
      // A second Run may arrive while the first metadata read is in flight.
      if (
        !this.disposed &&
        generation === this.generation &&
        this.view.runs.some((run) => run.trigger === undefined && !requested.has(run.id))
      )
        void this.refreshRunDetails();
    }
  }
  private interrupted(authorizationLost: boolean) {
    if (this.disposed || this.suspended) return;
    ++this.generation;
    this.cancelTimer();
    this.closeSocket();
    this.state.clearLiveReplies();
    this.update({ connection: "reconnecting", error: authorizationLost ? "load" : null });
    if (!authorizationLost)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (!this.disposed) this.openSocket();
      }, 1_000);
  }
  reconnect() {
    if (this.disposed || this.suspended) return;
    if (
      !this.hasSnapshot ||
      this.view.connection === "snapshot-required" ||
      this.view.error === "load"
    ) {
      void this.refreshSnapshot(this.hasSnapshot ? "snapshot-required" : "connecting");
      return;
    }
    ++this.generation;
    this.cancelTimer();
    this.closeSocket();
    this.state.clearLiveReplies();
    this.update({ connection: "reconnecting", error: null });
    this.openSocket();
  }
  /** Platform lifecycle adapter: retain applied state/cursor, fence I/O and discard transient text. */
  suspend() {
    if (this.disposed || this.suspended) return;
    this.suspended = true;
    ++this.generation;
    ++this.approvalsGeneration;
    this.cancelTimer();
    this.closeSocket();
    this.state.clearLiveReplies();
    this.update({ connection: "reconnecting", approvalsLoading: false });
  }
  /** Resume the same projection; a fresh mount still begins with an authoritative snapshot. */
  resume() {
    if (this.disposed || !this.suspended) return;
    this.suspended = false;
    // Foreground reconciliation must not depend on the event socket becoming ready.
    // A new projection hydrates approvals after its snapshot establishes row positions.
    if (this.hasSnapshot) void this.refreshApprovals();
    void this.options.computer?.refresh();
    if (!this.started) void this.start();
    else this.reconnect();
  }
  async send(): Promise<boolean> {
    if (this.disposed || this.view.sending || !this.view.draft.trim()) return false;
    if (this.view.pending && this.view.pending.text !== this.view.draft) return false;
    const pending = this.view.pending ?? {
      text: this.view.draft,
      idempotencyKey: this.options.key(),
      ...(this.view.mentionTokens?.length ? { mentions: mentionIds(this.view.mentionTokens) } : {}),
    };
    if (!pending.idempotencyKey || pending.idempotencyKey.length > 128) return false;
    if (!this.persist(this.view.draft, pending)) return false;
    this.update({ pending });
    return this.sendPending();
  }
  async refreshApprovals(): Promise<void> {
    const port = this.options.approvals;
    if (!port || this.disposed || this.suspended) return;
    const generation = ++this.approvalsGeneration;
    const known = new Set(this.approvals.getSnapshot().map((card) => card.requestId));
    this.update({ approvalsLoading: true, approvalsError: false });
    try {
      const requests = await port.pending({ spaceId: this.options.selection.spaceId });
      if (this.disposed || generation !== this.approvalsGeneration) return;
      this.approvals.hydrate(requests, (request) => {
        const run = this.view.runs.find((item) => item.id === request.runId);
        const message = this.view.messages.find((item) => item.id === run?.messageId);
        return message ? message.sequence + 0.75 : this.view.cursor + 0.25;
      });
      this.approvals.reconcileMissing(requests, known, this.options.owner.accountId);
      this.update({ approvalsLoading: false });
    } catch {
      if (!this.disposed && generation === this.approvalsGeneration)
        this.update({ approvalsLoading: false, approvalsError: true });
    }
  }
  async answerApproval(
    requestId: ApprovalRequest["id"],
    decision: "approved" | "denied",
    allowTool = false,
  ): Promise<boolean> {
    const port = this.options.approvals;
    if (!port || this.disposed) return false;
    if (!this.approvals.begin(requestId, this.options.owner.accountId, Date.now())) {
      void this.refreshApprovals();
      return false;
    }
    this.update();
    try {
      const request = await port.answer({
        spaceId: this.options.selection.spaceId,
        requestId,
        decision,
        ...(allowTool ? { allowTool: true } : {}),
      });
      if (this.disposed) return false;
      const card = this.approvals.getSnapshot().find((item) => item.requestId === requestId);
      if (card) this.approvals.receive(request, card.sequence);
      this.update();
      return true;
    } catch (error) {
      if (this.disposed) return false;
      const reason = error instanceof Error ? error.message : "";
      this.approvals.reject(requestId, reason);
      this.update();
      void this.refreshApprovals();
      return false;
    }
  }
  async sendPending(): Promise<boolean> {
    const pending = this.view.pending;
    if (!pending || this.view.sending || this.disposed) return false;
    this.update({ sending: true, error: null });
    try {
      const message = await this.options.port.send({ ...this.options.selection, message: pending });
      if (this.disposed) return false;
      if (!this.state.receiveMessage(message)) throw new Error("Invalid conversation receipt");
      const draft = this.view.draft === pending.text ? "" : this.view.draft;
      this.update({
        sending: false,
        pending: null,
        draft,
        mentionTokens: draft ? this.view.mentionTokens : [],
        sendCode: null,
      });
      this.persist(draft, null);
      return true;
    } catch (error) {
      const code = sendFailureCode(error);
      if (code) {
        this.update({ sending: false, pending: null, sendCode: code, error: null });
        this.persist(this.view.draft, null);
        return false;
      }
      this.update({ sending: false, error: "send" });
      return false;
    }
  }
  /** Deliberate retry restores text only. The next explicit Send creates a new message. */
  prepareRetry(runId: RunId): boolean {
    const run = this.view.runs.find((item) => item.id === runId);
    if (!run || run.state !== "failed" || run.failureCode === "EFFECT_UNKNOWN" || this.view.pending)
      return false;
    const message = this.view.messages.find((item) => item.id === run.messageId);
    if (!message || (this.view.draft && this.view.draft !== message.text)) return false;
    this.setDraft(message.text);
    return true;
  }
  async stop(runId: RunId): Promise<boolean> {
    if (this.disposed) return false;
    try {
      await this.options.port.stop({ ...this.options.selection, runId });
      return !this.disposed;
    } catch {
      this.update({ error: "stop" });
      return false;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.approvalsGeneration;
    ++this.generation;
    this.cancelTimer();
    this.closeSocket();
    this.listeners.clear();
  }
}

const sendFailureCodes = [
  "GROUP_MIN_AGENTS",
  "GROUP_AGENT_NOT_PARTICIPANT",
  "GROUP_AGENT_LIMIT",
  "AGENT_TARGET_UNAVAILABLE",
] as const;
type SendFailureCode = (typeof sendFailureCodes)[number];
function sendFailureCode(error: unknown): SendFailureCode | null {
  if (!error || typeof error !== "object") return null;
  const data = "data" in error ? error.data : undefined;
  const nested = data && typeof data === "object" && "error" in data ? data.error : undefined;
  const candidates = [
    "code" in error ? error.code : undefined,
    error instanceof Error ? error.message : undefined,
    data && typeof data === "object" && "code" in data ? data.code : undefined,
    nested && typeof nested === "object" && "code" in nested ? nested.code : undefined,
  ];
  return sendFailureCodes.find((code) => candidates.includes(code)) ?? null;
}
