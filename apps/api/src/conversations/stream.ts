import { AcknowledgedStream } from "@raypx/client/events";
import {
  conversationClientFrameSchema,
  MAX_CONVERSATION_FRAME_BYTES,
  MAX_SCREEN_STREAM_FRAME_BYTES,
  type ConversationFeedFrame,
  type ConversationFeedSelection,
  type ConversationServerFrame,
} from "@raypx/contracts/api";
import { InvalidConversationCursor } from "@raypx/core/conversation";
import { SpaceNotFound, type SpaceId, type SpaceEvent } from "@raypx/core/spaces";
import type { AuthSession } from "@raypx/core/auth";
import type {
  ConversationFanout,
  ConversationsRepository,
  LiveReplies,
} from "@raypx/agents/server";
import type { SpaceAccess, SpaceFanout, SpaceScope } from "@raypx/spaces/server";
import type { ComputerScreensService } from "@raypx/computers/server";

interface AuthorizedSubscription {
  spaceId: SpaceId;
  controller: AbortController;
}
interface SpaceSubscription extends AuthorizedSubscription {
  stream: AcknowledgedStream;
  running: boolean;
  dirty: boolean;
}
interface ScreenSubscription extends AuthorizedSubscription {
  viewerId: string;
  stream: AcknowledgedStream;
}

interface SessionConnection {
  accountId: string;
  headers: Headers;
  close(code?: number, reason?: string): void;
}
interface Feed extends AuthorizedSubscription, SessionConnection {
  conversationId: ConversationFeedSelection["conversationId"];
  cursor: number;
  write(frame: ConversationFeedFrame): Promise<void>;
  ready: boolean;
  running: boolean;
  dirty: boolean;
  checking: boolean;
  liveOffsets: Map<string, { segmentId: string; offset: number }>;
  committedSegments: Map<string, string>;
}
interface Connection extends SessionConnection {
  send(frame: ConversationServerFrame): void;
  spaceSubscriptions: Map<string, SpaceSubscription>;
  screenSubscription?: ScreenSubscription;
  checking: boolean;
}

/** Feeds wait for HTTP backpressure. Space and Screen sockets require exact ACKs. */
export class ConversationStream {
  private readonly peers = new Map<string, Connection>();
  private readonly feeds = new Map<string, Feed>();
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
      screens?: ComputerScreensService;
      spaceEvents?: {
        events(scope: SpaceScope, after: number, limit: number): Promise<SpaceEvent[]>;
      };
    },
  ) {}
  async start() {
    this.unsubscribe = await this.options.fanout.subscribe((notice) => {
      for (const feed of this.feeds.values())
        if (feed.conversationId === notice.conversationId) this.wake(feed);
    });
    this.unsubscribeLive = this.options.live?.subscribe((id) => {
      for (const feed of this.feeds.values()) if (feed.conversationId === id) this.wake(feed);
    });
    this.unsubscribeSpace = await this.options.spaceFanout?.subscribe((notice) => {
      let reason: string | undefined;
      if (notice.kind === "space.deleted") reason = "SPACE_DELETING";
      else if (notice.kind === "space.member.removed")
        reason = notice.reason === "left" ? "SPACE_MEMBER_LEFT" : "SPACE_MEMBER_REMOVED";
      const revoked = (accountId: string) =>
        notice.kind === "space.deleted" || notice.accountId === accountId;
      if (reason)
        for (const feed of this.feeds.values())
          if (feed.spaceId === notice.spaceId && revoked(feed.accountId))
            this.fail(feed, 4003, reason);
      for (const peer of this.peers.values()) {
        const subscribed =
          peer.spaceSubscriptions.has(notice.spaceId) ||
          peer.screenSubscription?.spaceId === notice.spaceId;
        if (reason && subscribed && revoked(peer.accountId)) {
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
      for (const feed of this.feeds.values()) void this.checkFeed(feed);
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
      spaceSubscriptions: new Map(),
      checking: false,
    });
    socket.send({ type: "ready", version: 1 });
  }
  close(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    for (const subscription of peer.spaceSubscriptions.values()) subscription.controller.abort();
    peer.spaceSubscriptions.clear();
    peer.screenSubscription?.controller.abort();
    delete peer.screenSubscription;
  }
  openFeed(
    id: string,
    accountId: string,
    headers: Headers,
    selection: ConversationFeedSelection,
    sink: Pick<Feed, "write" | "close">,
  ) {
    const feed: Feed = {
      ...sink,
      close: (code, reason) => {
        this.closeFeed(id);
        sink.close(code, reason);
      },
      spaceId: selection.spaceId,
      conversationId: selection.conversationId,
      cursor: selection.after,
      accountId,
      headers,
      controller: new AbortController(),
      ready: false,
      running: false,
      dirty: false,
      checking: false,
      liveOffsets: new Map(),
      committedSegments: new Map(),
    };
    this.feeds.set(id, feed);
    this.wake(feed);
  }
  closeFeed(id: string) {
    const feed = this.feeds.get(id);
    this.feeds.delete(id);
    feed?.controller.abort();
  }
  private fail(peer: SessionConnection, code: number, reason: string) {
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
        frame.type === "screen.subscribe" ||
        frame.type === "screen.ack" ||
        frame.type === "screen.unsubscribe"
      ) {
        if (!this.options.screens) throw new Error("Screen unavailable");
        const previous = peer.screenSubscription;
        const key = JSON.stringify(["screen", frame.spaceId, frame.viewerId]);
        if (frame.type === "screen.ack") {
          if (
            previous?.spaceId !== frame.spaceId ||
            previous.viewerId !== frame.viewerId ||
            !previous.stream.acknowledge({ streamId: key, sequence: frame.sequence })
          )
            throw new Error("Unexpected ACK");
          return;
        }
        if (frame.type === "screen.unsubscribe") {
          if (previous?.spaceId === frame.spaceId && previous.viewerId === frame.viewerId) {
            previous.controller.abort();
            delete peer.screenSubscription;
          }
          return;
        }
        if (previous) throw new Error("Screen subscription limit");
        const subscription: ScreenSubscription = {
          spaceId: frame.spaceId,
          viewerId: frame.viewerId,
          controller: new AbortController(),
          stream: new AcknowledgedStream(),
        };
        subscription.stream.reset({ streamId: key, sequence: 0 });
        peer.screenSubscription = subscription;
        void this.drainScreen(peer, subscription)
          .catch((error: unknown) => this.rejected(peer, subscription, error))
          .finally(() => {
            subscription.controller.abort();
            if (peer.screenSubscription === subscription) delete peer.screenSubscription;
          });
        return;
      }
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
        if (peer.spaceSubscriptions.size >= 32) throw new Error("Subscription limit");
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
    } catch {
      this.fail(peer, 4000, "Invalid frame");
    }
  }
  private async authorize(peer: SessionConnection, subscription: AuthorizedSubscription) {
    if (subscription.controller.signal.aborted) return undefined;
    const auth = await this.options.readSession(peer.headers);
    if (subscription.controller.signal.aborted) return undefined;
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
  private async rejected(
    peer: SessionConnection,
    subscription: AuthorizedSubscription,
    error: unknown,
  ) {
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
      for (const subscription of peer.spaceSubscriptions.values()) {
        try {
          if (await this.authorize(peer, subscription)) this.wakeSpace(peer, subscription);
        } catch (error) {
          await this.rejected(peer, subscription, error);
        }
      }
      if (peer.screenSubscription) {
        try {
          await this.authorize(peer, peer.screenSubscription);
        } catch (error) {
          if (peer.screenSubscription) await this.rejected(peer, peer.screenSubscription, error);
        }
      }
    } finally {
      peer.checking = false;
    }
  }
  private async drainScreen(peer: Connection, subscription: ScreenSubscription) {
    const scope = await this.authorize(peer, subscription);
    if (!scope || !this.options.screens) return;
    const key = JSON.stringify(["screen", subscription.spaceId, subscription.viewerId]);
    let sequence = 0;
    for await (const event of this.options.screens.stream(scope, {
      viewerId: subscription.viewerId,
      signal: subscription.controller.signal,
      recheck: async () => {
        const current = await this.authorize(peer, subscription);
        if (!current) throw new Error("SESSION_EXPIRED");
        return current;
      },
    })) {
      if (subscription.controller.signal.aborted || !(await this.authorize(peer, subscription)))
        return;
      const frame: ConversationServerFrame = {
        type: "screen.event",
        spaceId: subscription.spaceId,
        viewerId: subscription.viewerId,
        sequence: ++sequence,
        event,
      };
      if (
        new TextEncoder().encode(JSON.stringify(frame)).byteLength > MAX_SCREEN_STREAM_FRAME_BYTES
      )
        throw new Error("Screen frame limit");
      await subscription.stream.wait(
        { streamId: key, sequence },
        subscription.controller.signal,
        () => peer.send(frame),
      );
      if (event.kind === "closed") return;
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
  private async checkFeed(feed: Feed) {
    if (!feed.running) {
      this.wake(feed);
      return;
    }
    if (feed.checking) return;
    feed.checking = true;
    try {
      await this.authorize(feed, feed);
    } catch (error) {
      await this.rejected(feed, feed, error);
    } finally {
      feed.checking = false;
    }
  }
  private wake(subscription: Feed) {
    subscription.dirty = true;
    if (subscription.running) return;
    subscription.running = true;
    void this.drain(subscription)
      .catch((error: unknown) => this.rejected(subscription, subscription, error))
      .finally(() => {
        subscription.running = false;
        if (subscription.dirty && !subscription.controller.signal.aborted) this.wake(subscription);
      });
  }
  private async drain(subscription: Feed) {
    const { signal } = subscription.controller;
    while (subscription.dirty && !signal.aborted) {
      subscription.dirty = false;
      const scope = await this.authorize(subscription, subscription);
      if (!scope) return;
      const result = await this.options.conversations.events(
        scope,
        subscription.conversationId,
        subscription.cursor,
        100,
      );
      if (signal.aborted) return;
      if (!subscription.ready) {
        await subscription.write({ type: "ready", version: 1 });
        subscription.ready = true;
      }
      if (signal.aborted) return;
      if (result.status === "snapshot-required") {
        if (!(await this.authorize(subscription, subscription))) return;
        await subscription.write({
          type: "snapshot-required",
          spaceId: subscription.spaceId,
          conversationId: subscription.conversationId,
          cursor: result.cursor,
        });
        subscription.close();
        return;
      }
      for (const entry of result.events) {
        // A page can wait on HTTP backpressure. Reauthorize before delivering its next event.
        if (!(await this.authorize(subscription, subscription))) return;
        if (entry.event.kind === "reply.segment")
          subscription.committedSegments.set(entry.event.segment.runId, entry.event.segment.id);
        await subscription.write({ type: "event", entry });
        subscription.cursor = entry.event.sequence;
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
      for (const live of replies) {
        if (subscription.committedSegments.get(live.runId) === live.segmentId) continue;
        if (!(await this.authorize(subscription, subscription))) return;
        const previous = subscription.liveOffsets.get(live.runId);
        if (previous?.segmentId !== live.segmentId) {
          await subscription.write({ ...live, type: "reply.prefix", offset: 0 });
          subscription.liveOffsets.set(live.runId, {
            segmentId: live.segmentId,
            offset: live.text.length,
          });
        } else if (live.text.length > previous.offset) {
          await subscription.write({
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
    for (const feed of this.feeds.values()) this.fail(feed, 1001, "Server shutting down");
    this.unsubscribeLive?.();
    this.unsubscribeLive = undefined;
    await this.unsubscribe?.();
    this.unsubscribe = undefined;
    await this.unsubscribeSpace?.();
    this.unsubscribeSpace = undefined;
  }
}
