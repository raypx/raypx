import { AttachmentsController, type MessageAttachmentsPort } from "./attachments.js";
import type { ConversationServerFrame } from "@raypx/contracts/api";
import type { AgentId } from "@raypx/core/agents";
import { editMentionTokens, insertMention, mentionIds, type MentionToken } from "./mentions.js";
import type { ConversationHistoryCursor, RunId } from "@raypx/core/conversation";
import type { ApprovalRequest, EffectiveApprovalMode } from "@raypx/core/approvals";
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
  ConversationHistory,
  ConversationSnapshot,
} from "./port.js";

export type ConversationConnection = "connecting" | "live" | "reconnecting" | "snapshot-required";
export type ConversationError = "load" | "send" | "stop" | "storage";
export const CONVERSATION_HISTORY_PAGE_SIZE = 30;
export const MAX_LOADED_CONVERSATION_MESSAGES = CONVERSATION_HISTORY_PAGE_SIZE * 5;
export interface ConversationReadingAnchor {
  messageId: string;
  offset: number;
}
export interface ConversationHistoryView {
  olderCursor: ConversationHistoryCursor | null;
  hasNewer: boolean;
  loading: "earlier" | "later" | null;
  error: boolean;
  anchor: ConversationReadingAnchor | null;
  revision: number;
}
export interface ConversationControllerView extends ConversationView {
  history: ConversationHistoryView;
  effectiveMode?: EffectiveApprovalMode | null | undefined;
  subscriptionEnd?: "removed" | "left" | "deleting" | "session-ended" | undefined;
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
  steeringRunId?: RunId | undefined;
  pending: PendingMessage | null;
}
export interface ConversationControllerOptions {
  attachments?: MessageAttachmentsPort;
  approvals?: ApprovalPort;
  computer?: ComputerController;
  selection: ConversationSelection;
  owner: ConversationOwner;
  port: ConversationPort;
  socket: ConversationSocketPort;
  drafts: ConversationDraftStore;
  key(this: void): string;
}

/** Owns one selected conversation. Adapters provide transport and device persistence. */
export class ConversationController {
  readonly attachments: AttachmentsController | undefined;
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
  private historyGeneration = 0;
  private snapshotRequest = 0;
  private snapshotLoading = false;
  private readingAnchor: ConversationReadingAnchor | null = null;
  private resolvedSummaries: ConversationView["resolvedApprovals"];
  private resolvedActivity: ConversationView["toolActivity"] | undefined;
  constructor(private readonly options: ConversationControllerOptions) {
    this.attachments = options.attachments
      ? new AttachmentsController(options.selection, options.attachments, options.key)
      : undefined;
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
      history: {
        olderCursor: null,
        hasNewer: false,
        loading: null,
        error: false,
        anchor: null,
        revision: 0,
      },
      effectiveMode: null,
      cards: [],
      approvalsLoading: false,
      approvalsError: false,
      connection: "connecting",
      loading: true,
      error,
      draft: draft.text,
      mentionTokens: draft.mentionTokens ?? [],
      pending: draft.pending,
      steeringRunId: draft.pending?.steerRunId,
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
    const state = this.state.getSnapshot();
    if (
      this.resolvedSummaries !== state.resolvedApprovals ||
      this.resolvedActivity !== state.toolActivity
    ) {
      this.resolvedSummaries = state.resolvedApprovals;
      this.resolvedActivity = state.toolActivity;
      this.approvals.hydrateResolved(state.resolvedApprovals ?? [], state.toolActivity, (runId) => {
        const run = state.runs.find((item) => item.id === runId);
        const message = state.messages.find((item) => item.id === run?.messageId);
        return message ? message.sequence + 0.75 : state.cursor + 0.25;
      });
    }
    this.approvals.retainRuns(
      new Set(state.runs.map((run) => run.id)),
      state.activeRunsTruncated === true,
    );
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
    const request = ++this.snapshotRequest;
    this.snapshotLoading = true;
    this.closeSocket();
    ++this.historyGeneration;
    this.state.clearLiveReplies();
    this.update({
      connection,
      loading: !this.hasSnapshot,
      error: null,
      history: { ...this.view.history, loading: null, error: false },
    });
    try {
      const history = this.options.port.history;
      if (history) {
        const recent = await history({
          ...this.options.selection,
          limit: CONVERSATION_HISTORY_PAGE_SIZE,
        });
        if (this.disposed || generation !== this.generation) return;
        let pages = [recent];
        let hasNewer = false;
        const messages = this.state.getSnapshot().messages;
        const oldest = messages[0];
        const newest = messages.at(-1);
        if (this.hasSnapshot && this.readingAnchor && oldest && newest) {
          hasNewer = (recent.messages.at(-1)?.sequence ?? 0) > newest.sequence;
          const before =
            newest.sequence < recent.cursor
              ? { ...this.options.selection, beforeSequence: newest.sequence + 1 }
              : undefined;
          const page = await history({
            ...this.options.selection,
            limit: Math.min(100, messages.length),
            ...(before ? { before } : {}),
          });
          if (this.disposed || generation !== this.generation) return;
          pages = [page];
          while (
            pages[0]!.olderCursor &&
            pages[0]!.messages[0]!.sequence > oldest.sequence &&
            pages.reduce((count, item) => count + item.messages.length, 0) <
              MAX_LOADED_CONVERSATION_MESSAGES
          ) {
            const previous = await history({
              ...this.options.selection,
              limit: CONVERSATION_HISTORY_PAGE_SIZE,
              before: pages[0]!.olderCursor,
            });
            if (this.disposed || generation !== this.generation) return;
            pages.unshift(previous);
          }
        }
        if (this.disposed || generation !== this.generation) return;
        const snapshot = combineHistoryPages(pages, recent.cursor);
        if (!this.state.applySnapshot(snapshot)) throw new Error("Invalid conversation history");
        this.state.hydrateActiveRuns(
          [...(recent.activeRuns ?? []).map((item) => item.run), ...recent.runs],
          recent.messages.at(-1)?.id,
        );
        this.hydrateActiveApprovals(recent);
        this.update({
          history: {
            ...this.view.history,
            olderCursor: pages[0]!.olderCursor,
            hasNewer,
            loading: null,
            error: false,
            anchor: this.readingAnchor,
            revision: this.view.history.revision + 1,
          },
        });
        this.releaseHistory(hasNewer ? "earlier" : "later");
      } else {
        const snapshot = await this.options.port.snapshot(this.options.selection);
        if (this.disposed || generation !== this.generation) return;
        if (!this.state.applySnapshot(snapshot)) throw new Error("Invalid conversation snapshot");
        this.hydrateActiveApprovals(snapshot);
      }
      this.hasSnapshot = true;
      this.update({ loading: false });
      void this.refreshApprovals();
      this.openSocket();
    } catch {
      if (this.disposed || generation !== this.generation) return;
      this.update({ loading: false, error: "load" });
    } finally {
      if (request === this.snapshotRequest) this.snapshotLoading = false;
    }
  }
  private hydrateActiveApprovals(snapshot: ConversationSnapshot) {
    for (const item of snapshot.activeRuns ?? [])
      this.approvals.hydratePending(item.pendingApprovals, item.triggerMessage.sequence + 0.75);
  }
  /** Jump directly to the trigger's bounded page, without walking the intervening history. */
  async loadRun(runId: RunId): Promise<boolean> {
    const run = this.view.runs.find((item) => item.id === runId);
    if (!run) return false;
    if (!run.outsideWindow) return true;
    const history = this.options.port.history;
    if (
      !history ||
      !run.triggerMessageSequence ||
      this.disposed ||
      this.suspended ||
      this.snapshotLoading ||
      this.view.history.loading
    )
      return false;
    this.cancelTimer();
    const generation = ++this.generation;
    const request = ++this.snapshotRequest;
    ++this.historyGeneration;
    this.snapshotLoading = true;
    this.closeSocket();
    this.update({ history: { ...this.view.history, loading: "earlier", error: false } });
    try {
      const page = await history({
        ...this.options.selection,
        limit: CONVERSATION_HISTORY_PAGE_SIZE,
        before: { ...this.options.selection, beforeSequence: run.triggerMessageSequence + 1 },
      });
      if (this.disposed || generation !== this.generation) return false;
      if (
        !page.messages.some((message) => message.id === run.messageId) ||
        !this.state.applySnapshot(page)
      )
        throw new Error("Run page unavailable");
      this.hydrateActiveApprovals(page);
      this.readingAnchor = { messageId: run.messageId!, offset: 0 };
      this.update({
        history: {
          olderCursor: page.olderCursor,
          hasNewer: true,
          loading: null,
          error: false,
          anchor: this.readingAnchor,
          revision: this.view.history.revision + 1,
        },
      });
      this.openSocket();
      return true;
    } catch {
      if (!this.disposed && generation === this.generation) {
        this.update({ history: { ...this.view.history, loading: null, error: true } });
        this.openSocket();
      }
      return false;
    } finally {
      if (request === this.snapshotRequest) this.snapshotLoading = false;
    }
  }
  /** UI adapters supply a stable message identity and its viewport-relative offset. */
  setReadingAnchor(anchor: ConversationReadingAnchor | null) {
    if (this.disposed) return;
    this.readingAnchor = anchor;
  }
  /** An explicit jump releases the old reader window and establishes a fresh replay boundary. */
  async loadLatest(): Promise<void> {
    if (this.disposed || this.suspended || this.snapshotLoading) return;
    this.readingAnchor = null;
    await this.refreshSnapshot("snapshot-required");
  }
  private releaseHistory(direction: "earlier" | "later") {
    const messages = this.state.getSnapshot().messages;
    if (!this.options.port.history || messages.length <= MAX_LOADED_CONVERSATION_MESSAGES) return;
    let start = direction === "earlier" ? 0 : messages.length - MAX_LOADED_CONVERSATION_MESSAGES;
    const anchorIndex = messages.findIndex(
      (message) => message.id === this.readingAnchor?.messageId,
    );
    if (anchorIndex >= 0) {
      start = Math.max(
        anchorIndex - MAX_LOADED_CONVERSATION_MESSAGES + 1,
        Math.min(start, anchorIndex),
      );
    }
    const keep = messages.slice(start, start + MAX_LOADED_CONVERSATION_MESSAGES);
    this.state.retainMessages(new Set(keep.map((message) => message.id)));
    this.approvals.retainRuns(new Set(this.state.getSnapshot().runs.map((run) => run.id)));
    const olderCursor =
      start > 0 && keep[0]
        ? { ...this.options.selection, beforeSequence: keep[0].sequence }
        : this.view.history.olderCursor;
    this.update({
      history: {
        ...this.view.history,
        olderCursor,
        hasNewer: start + keep.length < messages.length || this.view.history.hasNewer,
        anchor: this.readingAnchor,
        revision: this.view.history.revision + 1,
      },
    });
  }
  async loadEarlier(): Promise<boolean> {
    const history = this.options.port.history;
    const before = this.view.history.olderCursor;
    if (
      !history ||
      !before ||
      this.disposed ||
      this.suspended ||
      this.snapshotLoading ||
      this.view.history.loading
    )
      return false;
    const generation = ++this.historyGeneration;
    this.update({ history: { ...this.view.history, loading: "earlier", error: false } });
    try {
      const page = await history({
        ...this.options.selection,
        limit: CONVERSATION_HISTORY_PAGE_SIZE,
        before,
      });
      if (this.disposed || generation !== this.historyGeneration) return false;
      if (!this.state.applyHistory(page)) throw new Error("Invalid conversation history");
      this.update({
        history: {
          ...this.view.history,
          olderCursor: page.olderCursor,
          loading: null,
          error: false,
          anchor: this.readingAnchor,
          revision: this.view.history.revision + 1,
        },
      });
      this.releaseHistory("earlier");
      this.update();
      return true;
    } catch {
      if (!this.disposed && generation === this.historyGeneration)
        this.update({ history: { ...this.view.history, loading: null, error: true } });
      return false;
    }
  }
  /** The wire cursor reads backwards. Walk bounded pages to find the immediate newer window. */
  async loadLater(): Promise<boolean> {
    const history = this.options.port.history;
    if (
      !history ||
      !this.view.history.hasNewer ||
      this.disposed ||
      this.suspended ||
      this.snapshotLoading ||
      this.view.history.loading
    )
      return false;
    const generation = ++this.historyGeneration;
    const tail = this.state.getSnapshot().messages.at(-1)?.sequence ?? 0;
    this.update({ history: { ...this.view.history, loading: "later", error: false } });
    try {
      let page = await history({
        ...this.options.selection,
        limit: CONVERSATION_HISTORY_PAGE_SIZE,
      });
      if (this.disposed || generation !== this.historyGeneration) return false;
      let candidate = page;
      let candidateIsLatest = true;
      let currentIsLatest = true;
      while (page.messages[0] && page.messages[0].sequence > tail && page.olderCursor) {
        candidate = page;
        candidateIsLatest = currentIsLatest;
        page = await history({
          ...this.options.selection,
          limit: CONVERSATION_HISTORY_PAGE_SIZE,
          before: page.olderCursor,
        });
        currentIsLatest = false;
        if (this.disposed || generation !== this.historyGeneration) return false;
      }
      if (page.messages.some((message) => message.sequence > tail)) {
        candidate = page;
        candidateIsLatest = currentIsLatest;
      }
      if (this.disposed || generation !== this.historyGeneration) return false;
      if (!this.state.applyHistory(candidate)) throw new Error("Invalid conversation history");
      this.update({
        history: {
          ...this.view.history,
          hasNewer: !candidateIsLatest,
          loading: null,
          error: false,
          anchor: this.readingAnchor,
          revision: this.view.history.revision + 1,
        },
      });
      this.releaseHistory("later");
      this.update();
      return true;
    } catch {
      if (!this.disposed && generation === this.historyGeneration)
        this.update({ history: { ...this.view.history, loading: null, error: true } });
      return false;
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
        onClose: (code, reason) => {
          if (this.disposed || generation !== this.generation) return;
          const endings = {
            SPACE_MEMBER_REMOVED: "removed",
            SPACE_MEMBER_LEFT: "left",
            SPACE_DELETING: "deleting",
            SESSION_ENDED: "session-ended",
          } as const;
          const subscriptionEnd =
            reason && Object.hasOwn(endings, reason)
              ? endings[reason as keyof typeof endings]
              : undefined;
          if (subscriptionEnd || code === 4001)
            this.update({ subscriptionEnd: subscriptionEnd ?? "session-ended" });
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
    if (frame.type === "screen.event") return;
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
      const applied = this.state.applyEvent(frame.entry, !this.view.history.hasNewer);
      if (applied === "snapshot-required") {
        void this.refreshSnapshot("snapshot-required");
        return;
      }
      if (applied === "ignored") return;
      if (applied === "applied" && frame.entry.event.kind === "computer.state")
        this.options.computer?.applyEvent(frame.entry.event);
      if (applied === "applied") this.approvals.applyEvent(frame.entry.event);
      if (applied === "applied" && !this.view.history.hasNewer) this.releaseHistory("later");
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
    if (this.view.history.hasNewer && !this.view.runs.some((run) => run.id === frame.runId)) return;
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
      const snapshot = this.options.port.history
        ? await this.options.port.history({
            ...this.options.selection,
            limit: CONVERSATION_HISTORY_PAGE_SIZE,
          })
        : await this.options.port.snapshot(this.options.selection);
      if (this.disposed || generation !== this.generation) return;
      if (
        this.state.applyRunDetails([
          ...snapshot.runs,
          ...(snapshot.activeRuns ?? []).map((item) => item.run),
        ])
      )
        this.update();
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
    ++this.historyGeneration;
    ++this.generation;
    ++this.approvalsGeneration;
    this.cancelTimer();
    this.closeSocket();
    this.state.clearLiveReplies();
    this.update({
      connection: "reconnecting",
      approvalsLoading: false,
      history: { ...this.view.history, loading: null },
    });
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
  beginSteering(runId: RunId): boolean {
    const run = this.view.runs.find((item) => item.id === runId);
    if (
      this.disposed ||
      this.view.pending ||
      !run ||
      !["queued", "running", "waiting"].includes(run.state)
    )
      return false;
    this.update({ steeringRunId: runId, sendCode: null });
    return true;
  }
  clearSteering() {
    if (!this.view.pending) this.update({ steeringRunId: undefined });
  }
  async send(): Promise<boolean> {
    if (
      this.disposed ||
      this.view.sending ||
      (!this.view.draft.trim() && !this.attachments?.ids().length)
    )
      return false;
    if (this.attachments && !this.attachments.ready()) return false;
    if (this.view.pending && this.view.pending.text !== this.view.draft) return false;
    const mentions = this.view.steeringRunId ? [] : mentionIds(this.view.mentionTokens ?? []);
    const pending = this.view.pending ?? {
      text: this.view.draft,
      idempotencyKey: this.options.key(),
      ...(this.attachments?.ids().length ? { attachmentIds: this.attachments.ids() } : {}),
      ...(this.view.steeringRunId ? { steerRunId: this.view.steeringRunId } : {}),
      ...(mentions.length ? { mentions } : {}),
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
    if (port.effectiveMode) {
      void port
        .effectiveMode({ spaceId: this.options.selection.spaceId })
        .then((effectiveMode) => {
          if (!this.disposed && generation === this.approvalsGeneration)
            this.update({ effectiveMode });
        })
        .catch(() => {});
    }
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
      if (!this.state.receiveMessage(message, !this.view.history.hasNewer))
        throw new Error("Invalid conversation receipt");
      this.releaseHistory("later");
      const draft = this.view.draft === pending.text ? "" : this.view.draft;
      this.update({
        sending: false,
        pending: null,
        draft,
        mentionTokens: draft ? this.view.mentionTokens : [],
        steeringRunId: undefined,
        sendCode: null,
      });
      this.persist(draft, null);
      this.attachments?.sent(pending.attachmentIds ?? []);
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
    this.attachments?.dispose();
    if (this.disposed) return;
    this.disposed = true;
    ++this.approvalsGeneration;
    ++this.historyGeneration;
    ++this.generation;
    this.cancelTimer();
    this.closeSocket();
    this.listeners.clear();
  }
}

const sendFailureCodes = [
  "ATTACHMENT_EXPIRED",
  "ATTACHMENT_INVALID",
  "ATTACHMENT_LIMIT",
  "GROUP_MIN_AGENTS",
  "GROUP_AGENT_NOT_PARTICIPANT",
  "GROUP_AGENT_LIMIT",
  "AGENT_TARGET_UNAVAILABLE",
  "RUN_NOT_ACTIVE",
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

function combineHistoryPages(
  pages: readonly ConversationHistory[],
  cursor: number,
): ConversationHistory {
  const latest = pages.at(-1)!;
  const participants = new Map(
    pages.flatMap((page) => page.participants ?? []).map((item) => [item.accountId, item]),
  );
  const approvals = new Map(
    pages.flatMap((page) => page.resolvedApprovals ?? []).map((item) => [item.requestId, item]),
  );
  return {
    ...latest,
    cursor,
    messages: [
      ...new Map(
        pages
          .flatMap((page) => page.messages)
          .filter((item) => item.sequence <= cursor)
          .map((item) => [item.id, item]),
      ).values(),
    ].sort((a, b) => a.sequence - b.sequence),
    runs: [...new Map(pages.flatMap((page) => page.runs).map((item) => [item.id, item])).values()],
    segments: [
      ...new Map(
        pages
          .flatMap((page) => page.segments)
          .filter((item) => item.sequence <= cursor)
          .map((item) => [item.id, item]),
      ).values(),
    ].sort((a, b) => a.sequence - b.sequence),
    toolActivity: pages.flatMap((page) => page.toolActivity ?? []),
    participants: [...participants.values()],
    resolvedApprovals: [...approvals.values()],
    olderCursor: pages[0]!.olderCursor,
    toolActivityTruncated: pages.some((page) => page.toolActivityTruncated),
    participantsTruncated: pages.some((page) => page.participantsTruncated),
    resolvedApprovalsTruncated: pages.some((page) => page.resolvedApprovalsTruncated),
    runsTruncated: pages.some((page) => page.runsTruncated),
    segmentsTruncated: pages.some((page) => page.segmentsTruncated),
  };
}
