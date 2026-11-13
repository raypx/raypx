import { AcknowledgedStream } from "@raypx/client/relay";
import {
  conversationClientFrameSchema,
  MAX_CONVERSATION_FRAME_BYTES,
  type ConversationServerFrame,
} from "@raypx/contracts/api";
import { InvalidConversationCursor } from "@raypx/core/conversation";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { ConversationId } from "@raypx/core/agents";
import type { AuthSession } from "@raypx/core/auth";
import type { ConversationFanout, ConversationsRepository } from "@raypx/agents/server";
import type { SpaceAccess } from "@raypx/spaces/server";

interface Subscription {
  spaceId: SpaceId;
  conversationId: ConversationId;
  stream: AcknowledgedStream;
  controller: AbortController;
  running: boolean;
  dirty: boolean;
}
interface Connection {
  accountId: string;
  headers: Headers;
  send(frame: ConversationServerFrame): void;
  close(code: number, reason: string): void;
  subscriptions: Map<string, Subscription>;
  checking: boolean;
}
const streamId = (spaceId: string, conversationId: string) =>
  JSON.stringify([spaceId, conversationId]);

/** One in-flight event per subscription. Only an exact applied ACK advances its cursor. */
export class ConversationStream {
  private readonly peers = new Map<string, Connection>();
  private unsubscribe: (() => Promise<void>) | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    private readonly options: {
      spaces: SpaceAccess;
      conversations: ConversationsRepository;
      readSession(headers: Headers): Promise<AuthSession | null>;
      fanout: ConversationFanout;
      pollMs?: number;
    },
  ) {}
  async start() {
    this.unsubscribe = await this.options.fanout.subscribe((notice) => {
      for (const peer of this.peers.values())
        for (const subscription of peer.subscriptions.values())
          if (subscription.conversationId === notice.conversationId) this.wake(peer, subscription);
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
      if (peer.subscriptions.size >= 32) throw new Error("Subscription limit");
      const stream = new AcknowledgedStream();
      stream.reset({ streamId: key, sequence: frame.after });
      const subscription: Subscription = {
        spaceId: frame.spaceId,
        conversationId: frame.conversationId,
        stream,
        controller: new AbortController(),
        running: false,
        dirty: false,
      };
      peer.subscriptions.set(key, subscription);
      this.wake(peer, subscription);
    } catch {
      this.fail(peer, 4000, "Invalid frame");
    }
  }
  private async authorize(peer: Connection, subscription: Subscription) {
    const auth = await this.options.readSession(peer.headers);
    if (
      !auth ||
      auth.user.id !== peer.accountId ||
      auth.session.expiresAt.getTime() <= Date.now()
    ) {
      this.fail(peer, 4001, "Authentication required");
      return undefined;
    }
    const scope = await this.options.spaces.resolve(auth.user.id, subscription.spaceId);
    if (subscription.controller.signal.aborted) return undefined;
    return scope;
  }
  private rejected(peer: Connection, subscription: Subscription, error: unknown) {
    if (subscription.controller.signal.aborted) return;
    if (error instanceof SpaceNotFound) this.fail(peer, 4003, "Subscription unavailable");
    else if (error instanceof InvalidConversationCursor) this.fail(peer, 4000, "Invalid cursor");
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
          this.rejected(peer, subscription, error);
        }
      }
    } finally {
      peer.checking = false;
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
        await subscription.stream.wait(
          {
            streamId: streamId(subscription.spaceId, subscription.conversationId),
            sequence: entry.event.sequence,
          },
          signal,
          () => peer.send({ type: "event", entry }),
        );
      }
      if (result.hasMore) subscription.dirty = true;
    }
  }
  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const peer of this.peers.values()) this.fail(peer, 1001, "Server shutting down");
    await this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
