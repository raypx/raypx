import { AcknowledgedStream } from "@raypx/client/relay";
import {
  conversationClientFrameSchema,
  MAX_CONVERSATION_FRAME_BYTES,
  type ConversationServerFrame,
} from "@raypx/contracts/api";
import { InvalidConversationCursor } from "@raypx/core/conversation";
import { SpaceNotFound, type SpaceId, type SpaceEvent } from "@raypx/core/spaces";
import type { ConversationId } from "@raypx/core/agents";
import type { AuthSession } from "@raypx/core/auth";
import type {
  ConversationFanout,
  ConversationsRepository,
  LiveReplies,
} from "@raypx/agents/server";
import type { SpaceAccess, SpaceFanout, SpaceScope } from "@raypx/spaces/server";

interface AuthorizedSubscription {
  spaceId: SpaceId;
  controller: AbortController;
}
interface SpaceSubscription extends AuthorizedSubscription {
  stream: AcknowledgedStream;
  running: boolean;
  dirty: boolean;
}

interface Subscription {
  spaceId: SpaceId;
  conversationId: ConversationId;
  stream: AcknowledgedStream;
  controller: AbortController;
  running: boolean;
  dirty: boolean;
  liveOffsets: Map<string, { segmentId: string; offset: number }>;
  committedSegments: Map<string, string>;
}
interface Connection {
  accountId: string;
  headers: Headers;
  send(frame: ConversationServerFrame): void;
  close(code: number, reason: string): void;
  subscriptions: Map<string, Subscription>;
  spaceSubscriptions: Map<string, SpaceSubscription>;
  checking: boolean;
}
const streamId = (spaceId: string, conversationId: string) =>
  JSON.stringify([spaceId, conversationId]);

/** One in-flight event per subscription. Only an exact applied ACK advances its cursor. */
export class ConversationStream {
  private readonly peers = new Map<string, Connection>();
  private unsubscribe: (() => Promise<void>) | undefined;
  private unsubscribeLive: (() => void) | undefined;
  private unsubscribeSpace: (() => Promise<void>) | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    private readonly options: {
      spaces: SpaceAccess;
      conversations: ConversationsRepository;
      readSession(headers: Headers): Promise<AuthSession | null>;
      fanout: ConversationFanout;
      pollMs?: number;
      live?: LiveReplies;
      spaceFanout?: SpaceFanout;
      spaceEvents?: {
        events(scope: SpaceScope, after: number, limit: number): Promise<SpaceEvent[]>;
      };
    },
  ) {}
  async start() {
    this.unsubscribe = await this.options.fanout.subscribe((notice) => {
      for (const peer of this.peers.values())
        for (const subscription of peer.subscriptions.values())
          if (subscription.conversationId === notice.conversationId) this.wake(peer, subscription);
    });
    this.unsubscribeLive = this.options.live?.subscribe((id) => {
      for (const peer of this.peers.values())
        for (const subscription of peer.subscriptions.values())
          if (subscription.conversationId === id) this.wake(peer, subscription);
    });
    this.unsubscribeSpace = await this.options.spaceFanout?.subscribe((notice) => {
      for (const peer of this.peers.values()) {
        const subscribed =
          peer.spaceSubscriptions.has(notice.spaceId) ||
          [...peer.subscriptions.values()].some((item) => item.spaceId === notice.spaceId);
        if (!subscribed) continue;
        if (
          notice.kind === "space.deleted" ||
          (notice.kind === "space.member.removed" && notice.accountId === peer.accountId)
        ) {
          // Abort ACK waiters synchronously; no further event can escape while checking admission.
          let reason = "SPACE_MEMBER_REMOVED";
          if (notice.kind === "space.deleted") reason = "SPACE_DELETING";
          else if (notice.reason === "left") reason = "SPACE_MEMBER_LEFT";
          this.fail(peer, 4003, reason);
          continue;
        }
        const subscription = peer.spaceSubscriptions.get(notice.spaceId);
        if (subscription) this.wakeSpace(peer, subscription);
      }
    });
    // Hints may be lost during LISTEN reconnects. Polling also rechecks idle memberships/sessions.
    this.timer = setInterval(() => {
      for (const peer of this.peers.values()) void this.check(peer);
    }, this.options.pollMs ?? 1_000);
  }
  open(
    id: string,
    accountId: string,
    headers: Headers,
    socket: Pick<Connection, "send" | "close">,
  ) {
    this.peers.set(id, {
      ...socket,
      accountId,
      headers,
      subscriptions: new Map(),
      spaceSubscriptions: new Map(),
      checking: false,
    });
    socket.send({ type: "ready", version: 1 });
  }
  close(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    for (const subscription of peer.subscriptions.values()) subscription.controller.abort();
    peer.subscriptions.clear();
    for (const subscription of peer.spaceSubscriptions.values()) subscription.controller.abort();
    peer.spaceSubscriptions.clear();
  }
  private fail(peer: Connection, code: number, reason: string) {
    for (const [id, candidate] of this.peers) if (candidate === peer) this.close(id);
    peer.close(code, reason);
  }
  receive(id: string, value: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    try {
      if (new TextEncoder().encode(value).byteLength > MAX_CONVERSATION_FRAME_BYTES)
        throw new Error("Frame limit");
      const frame = conversationClientFrameSchema.parse(JSON.parse(value));
      if (
        frame.type === "space.subscribe" ||
        frame.type === "space.ack" ||
        frame.type === "space.unsubscribe"
      ) {
        if (!this.options.spaceEvents) throw new Error("Space subscriptions unavailable");
        const previous = peer.spaceSubscriptions.get(frame.spaceId);
        const key = JSON.stringify(["space", frame.spaceId]);
        if (frame.type === "space.ack") {
          if (!previous?.stream.acknowledge({ streamId: key, sequence: frame.sequence }))
            throw new Error("Unexpected ACK");
          return;
        }
        previous?.controller.abort();
        peer.spaceSubscriptions.delete(frame.spaceId);
        if (frame.type === "space.unsubscribe") return;
        if (peer.subscriptions.size + peer.spaceSubscriptions.size >= 32)
          throw new Error("Subscription limit");
        const stream = new AcknowledgedStream();
        stream.reset({ streamId: key, sequence: frame.after });
        const subscription: SpaceSubscription = {
          spaceId: frame.spaceId,
          controller: new AbortController(),
          stream,
          running: false,
          dirty: false,
        };
        peer.spaceSubscriptions.set(frame.spaceId, subscription);
        this.wakeSpace(peer, subscription);
        return;
      }
      const key = streamId(frame.spaceId, frame.conversationId);
      const previous = peer.subscriptions.get(key);
      if (frame.type === "ack") {
        if (!previous?.stream.acknowledge({ streamId: key, sequence: frame.sequence }))
          throw new Error("Unexpected ACK");
        return;
      }
      previous?.controller.abort();
      peer.subscriptions.delete(key);
      if (frame.type === "unsubscribe") return;
      if (peer.subscriptions.size + peer.spaceSubscriptions.size >= 32)
        throw new Error("Subscription limit");
      const stream = new AcknowledgedStream();
      stream.reset({ streamId: key, sequence: frame.after });
      const subscription: Subscription = {
        spaceId: frame.spaceId,
        conversationId: frame.conversationId,
        stream,
        controller: new AbortController(),
        running: false,
        dirty: false,
        liveOffsets: new Map(),
        committedSegments: new Map(),
      };
      peer.subscriptions.set(key, subscription);
      this.wake(peer, subscription);
    } catch {
      this.fail(peer, 4000, "Invalid frame");
    }
  }
  private async authorize(peer: Connection, subscription: AuthorizedSubscription) {
    const auth = await this.options.readSession(peer.headers);
    if (
      !auth ||
      auth.user.id !== peer.accountId ||
      auth.session.expiresAt.getTime() <= Date.now()
    ) {
      this.fail(peer, 4001, "SESSION_ENDED");
      return undefined;
    }
    const scope = await this.options.spaces.resolve(auth.user.id, subscription.spaceId);
    if (subscription.controller.signal.aborted) return undefined;
    return scope;
  }
  private async rejected(peer: Connection, subscription: AuthorizedSubscription, error: unknown) {
    if (subscription.controller.signal.aborted) return;
    if (error instanceof SpaceNotFound) {
      let reason = error.subscriptionEndReason;
      if (!reason) {
        // Membership/deletion may have changed between admission and the scoped
        // read. Recover its durable cause rather than reporting that race generically.
        try {
          await this.options.spaces.resolve(peer.accountId, subscription.spaceId);
        } catch (current) {
          if (current instanceof SpaceNotFound) reason = current.subscriptionEndReason;
        }
      }
      if (!subscription.controller.signal.aborted)
        this.fail(peer, 4003, reason ?? "Subscription unavailable");
    } else if (error instanceof InvalidConversationCursor) this.fail(peer, 4000, "Invalid cursor");
    else this.fail(peer, 1013, "Stream unavailable");
  }
  private async check(peer: Connection) {
    if (peer.checking) return;
    peer.checking = true;
    try {
      for (const subscription of peer.subscriptions.values()) {
        try {
          if (await this.authorize(peer, subscription)) this.wake(peer, subscription);
        } catch (error) {
          await this.rejected(peer, subscription, error);
        }
      }
      for (const subscription of peer.spaceSubscriptions.values()) {
        try {
          if (await this.authorize(peer, subscription)) this.wakeSpace(peer, subscription);
        } catch (error) {
          await this.rejected(peer, subscription, error);
        }
      }
    } finally {
      peer.checking = false;
    }
  }
  private wakeSpace(peer: Connection, subscription: SpaceSubscription) {
    subscription.dirty = true;
    if (subscription.running) return;
    subscription.running = true;
    void this.drainSpace(peer, subscription)
      .catch((error: unknown) => this.rejected(peer, subscription, error))
      .finally(() => {
        subscription.running = false;
        if (subscription.dirty && !subscription.controller.signal.aborted)
          this.wakeSpace(peer, subscription);
      });
  }
  private async drainSpace(peer: Connection, subscription: SpaceSubscription) {
    const { signal } = subscription.controller;
    while (subscription.dirty && !signal.aborted) {
      subscription.dirty = false;
      const scope = await this.authorize(peer, subscription);
      if (!scope || !this.options.spaceEvents) return;
      const events = await this.options.spaceEvents.events(
        scope,
        subscription.stream.cursor!.sequence,
        100,
      );
      if (signal.aborted) return;
      for (const event of events) {
        if (!(await this.authorize(peer, subscription))) return;
        await subscription.stream.wait(
          { streamId: JSON.stringify(["space", subscription.spaceId]), sequence: event.id },
          signal,
          () => peer.send({ type: "space.event", spaceId: subscription.spaceId, event }),
        );
      }
      if (events.length === 100) subscription.dirty = true;
    }
  }
  private wake(peer: Connection, subscription: Subscription) {
    subscription.dirty = true;
    if (subscription.running) return;
    subscription.running = true;
    void this.drain(peer, subscription)
      .catch((error: unknown) => this.rejected(peer, subscription, error))
      .finally(() => {
        subscription.running = false;
        if (subscription.dirty && !subscription.controller.signal.aborted)
          this.wake(peer, subscription);
      });
  }
  private async drain(peer: Connection, subscription: Subscription) {
    const { signal } = subscription.controller;
    while (subscription.dirty && !signal.aborted) {
      subscription.dirty = false;
      const scope = await this.authorize(peer, subscription);
      if (!scope) return;
      const result = await this.options.conversations.events(
        scope,
        subscription.conversationId,
        subscription.stream.cursor!.sequence,
        100,
      );
      if (signal.aborted) return;
      if (result.status === "snapshot-required") {
        peer.send({
          type: "snapshot-required",
          spaceId: subscription.spaceId,
          conversationId: subscription.conversationId,
          cursor: result.cursor,
        });
        peer.subscriptions.delete(streamId(subscription.spaceId, subscription.conversationId));
        subscription.controller.abort();
        return;
      }
      for (const entry of result.events) {
        // A page can wait on an ACK. Reauthorize before delivering its next event.
        if (!(await this.authorize(peer, subscription))) return;
        if (entry.event.kind === "reply.segment")
          subscription.committedSegments.set(entry.event.segment.runId, entry.event.segment.id);
        await subscription.stream.wait(
          {
            streamId: streamId(subscription.spaceId, subscription.conversationId),
            sequence: entry.event.sequence,
          },
          signal,
          () => peer.send({ type: "event", entry }),
        );
      }
      const replies =
        this.options.live?.readAll(subscription.spaceId, subscription.conversationId) ?? [];
      const active = new Set<string>(replies.map((reply) => reply.runId));
      for (const runId of subscription.liveOffsets.keys())
        if (!active.has(runId)) subscription.liveOffsets.delete(runId);
      for (const runId of subscription.committedSegments.keys())
        if (!active.has(runId)) subscription.committedSegments.delete(runId);
      if (result.hasMore) {
        subscription.dirty = true;
        continue;
      }
      // Read synchronously after replay and authorization: the prefix and offset form one handoff.
      if (!(await this.authorize(peer, subscription))) return;
      // Capture synchronously after authorization; each Run owns an independent offset.
      for (const live of this.options.live?.readAll(
        subscription.spaceId,
        subscription.conversationId,
      ) ?? []) {
        if (subscription.committedSegments.get(live.runId) === live.segmentId) continue;
        const previous = subscription.liveOffsets.get(live.runId);
        if (previous?.segmentId !== live.segmentId) {
          peer.send({ ...live, type: "reply.prefix", offset: 0 });
          subscription.liveOffsets.set(live.runId, {
            segmentId: live.segmentId,
            offset: live.text.length,
          });
        } else if (live.text.length > previous.offset) {
          peer.send({
            ...live,
            type: "reply.delta",
            offset: previous.offset,
            text: live.text.slice(previous.offset),
          });
          previous.offset = live.text.length;
        }
      }
    }
  }
  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const peer of this.peers.values()) this.fail(peer, 1001, "Server shutting down");
    this.unsubscribeLive?.();
    this.unsubscribeLive = undefined;
    await this.unsubscribe?.();
    this.unsubscribe = undefined;
    await this.unsubscribeSpace?.();
    this.unsubscribeSpace = undefined;
  }
}
