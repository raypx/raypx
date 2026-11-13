import type { ConversationServerFrame } from "@raypx/contracts/api";
import type { RunId } from "@raypx/core/conversation";
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
} from "./port.js";

export type ConversationConnection = "connecting" | "live" | "reconnecting" | "snapshot-required";
export type ConversationError = "load" | "send" | "stop" | "storage";
export interface ConversationControllerView extends ConversationView {
  connection: ConversationConnection;
  loading: boolean;
  error: ConversationError | null;
  draft: string;
  sending: boolean;
  pending: PendingMessage | null;
}
export interface ConversationControllerOptions {
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
  private readonly listeners = new Set<() => void>();
  private readonly draftKey: string;
  private view: ConversationControllerView;
  private socket: ConversationSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private started = false;
  private disposed = false;
  private hasSnapshot = false;
  private storageUnavailable = false;
  constructor(private readonly options: ConversationControllerOptions) {
    this.state = new ConversationState(options.selection);
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
      connection: "connecting",
      loading: true,
      error,
      draft: draft.text,
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
      ...patch,
      ...(error !== undefined ? { error } : {}),
    };
    for (const listener of this.listeners) listener();
  }
  private persist(text = this.view.draft, pending = this.view.pending): boolean {
    try {
      if (!text && !pending) this.options.drafts.remove(this.draftKey);
      else this.options.drafts.write(this.draftKey, writeConversationDraft({ text, pending }));
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
    this.update({ draft: text, error: this.view.error === "load" ? "load" : null });
    this.persist(text);
  }
  async start() {
    if (this.started || this.disposed) return;
    this.started = true;
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
      this.openSocket();
    } catch {
      if (this.disposed || generation !== this.generation) return;
      this.update({ loading: false, error: "load" });
    }
  }
  private openSocket() {
    if (this.disposed) return;
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
      this.update();
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
  private interrupted(authorizationLost: boolean) {
    if (this.disposed) return;
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
    if (this.disposed) return;
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
  async send(): Promise<boolean> {
    if (this.disposed || this.view.sending || !this.view.draft.trim()) return false;
    if (this.view.pending && this.view.pending.text !== this.view.draft) return false;
    const pending = this.view.pending ?? {
      text: this.view.draft,
      idempotencyKey: this.options.key(),
    };
    if (!pending.idempotencyKey || pending.idempotencyKey.length > 128) return false;
    if (!this.persist(this.view.draft, pending)) return false;
    this.update({ pending });
    return this.sendPending();
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
      this.update({ sending: false, pending: null, draft });
      this.persist(draft, null);
      return true;
    } catch {
      this.update({ sending: false, error: "send" });
      return false;
    }
  }
  /** Deliberate retry restores text only. The next explicit Send creates a new message. */
  prepareRetry(runId: RunId): boolean {
    const run = this.view.runs.find((item) => item.id === runId);
    if (!run || run.state !== "failed" || this.view.pending) return false;
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
    ++this.generation;
    this.cancelTimer();
    this.closeSocket();
    this.listeners.clear();
  }
}
