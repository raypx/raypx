import type { SpaceEvent, SpaceId } from "@raypx/core/spaces";
import type { ConversationSocket, ConversationSocketPort, SpaceMembership } from "./port.js";

/** The stream carries invalidation, never admission. Reconcile against fresh membership. */
export class SpaceLiveController {
  private socket: ConversationSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private readonly cursors = new Map<SpaceId, number>();
  private memberships = new Map<SpaceId, SpaceMembership>();
  private readonly subscribed = new Set<SpaceId>();
  private ready = false;
  private disposed = false;
  private exited = false;
  private connecting = false;
  private reconcileRead = 0;
  private pending = Promise.resolve();

  constructor(
    private readonly options: {
      spaceId: SpaceId;
      accountId: string;
      socket: ConversationSocketPort;
      list(): Promise<SpaceMembership[]>;
      onMemberships(spaces: SpaceMembership[]): void;
      onEvent(event: SpaceEvent): void | Promise<void>;
      onExit(reason: "removed" | "unavailable"): void;
    },
  ) {}

  private current(generation: number) {
    return !this.disposed && !this.exited && generation === this.generation;
  }
  private closeSocket(unsubscribe = false) {
    const socket = this.socket;
    this.socket = undefined;
    this.ready = false;
    if (unsubscribe) {
      for (const spaceId of this.subscribed) {
        try {
          socket?.send({ version: 1, type: "space.unsubscribe", spaceId });
        } catch {
          // A lost transport cannot accept an unsubscribe; close still runs below.
        }
      }
    }
    this.subscribed.clear();
    try {
      socket?.close();
    } catch {
      // The generation already prevents late transport callbacks from applying.
    }
  }
  private exit(reason: "removed" | "unavailable") {
    if (this.disposed || this.exited) return;
    this.exited = true;
    ++this.generation;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.closeSocket(true);
    this.options.onExit(reason);
  }
  start() {
    if (this.disposed || this.exited || this.socket || this.connecting) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    const generation = ++this.generation;
    this.pending = Promise.resolve();
    const interrupted = (code?: number) => {
      if (!this.current(generation)) return;
      if (code === 4001) {
        this.exit("unavailable");
        return;
      }
      const nextGeneration = ++this.generation;
      this.closeSocket();
      void this.reconcileAt(nextGeneration)
        .catch(() => {})
        .finally(() => {
          if (!this.current(nextGeneration)) return;
          this.timer = setTimeout(() => this.start(), 1_000);
        });
    };
    // Access may have ended before the socket opens, or while a window was suspended.
    void this.reconcileAt(generation).catch(() => {});
    this.connecting = true;
    try {
      const socket = this.options.socket.connect({
        onFrame: (frame) => {
          // Queue synchronous transports too: the socket must exist before sending.
          this.pending = this.pending
            .then(async () => {
              if (!this.current(generation)) return;
              if (frame.type === "ready" && !this.ready) {
                await this.reconcileAt(generation);
                if (!this.current(generation)) return;
                this.ready = true;
                this.syncSubscriptions();
              }
              if (
                !this.ready ||
                frame.type !== "space.event" ||
                !this.subscribed.has(frame.spaceId) ||
                frame.event.spaceId !== frame.spaceId ||
                frame.event.id <= (this.cursors.get(frame.spaceId) ?? 0)
              )
                return;
              const event = frame.event;
              if (!this.alreadyReflected(event)) {
                // A discovery started before this event may contain an older name or role.
                ++this.reconcileRead;
                if (
                  event.kind === "space.member.removed" &&
                  event.payload.accountId === this.options.accountId
                ) {
                  if (event.spaceId === this.options.spaceId) this.exit("removed");
                  else await this.reconcileAt(generation);
                  return;
                }
                await this.options.onEvent(event);
                if (!this.current(generation)) return;
              }
              this.cursors.set(event.spaceId, event.id);
              this.socket?.send({
                version: 1,
                type: "space.ack",
                spaceId: event.spaceId,
                sequence: event.id,
              });
            })
            .catch(() => interrupted());
        },
        onClose: interrupted,
        onError: () => interrupted(),
      });
      if (this.current(generation)) this.socket = socket;
      else {
        try {
          socket.close();
        } catch {
          // A synchronous close callback has already fenced this transport.
        }
      }
    } catch {
      interrupted();
    } finally {
      this.connecting = false;
    }
  }

  private alreadyReflected(event: SpaceEvent) {
    const membership = this.memberships.get(event.spaceId);
    // Rejoining does not erase old membership events. A prior removal must not
    // evict the newly admitted member when subscribing from the beginning.
    if (
      event.kind !== "space.renamed" &&
      event.payload.accountId === this.options.accountId &&
      membership &&
      Date.parse(event.createdAt) <= Date.parse(membership.member.createdAt)
    )
      return true;
    return (
      event.kind === "space.renamed" &&
      membership !== undefined &&
      Date.parse(event.createdAt) < Date.parse(membership.space.updatedAt)
    );
  }

  reconcile() {
    return this.reconcileAt(this.generation);
  }
  private async reconcileAt(generation: number) {
    if (!this.current(generation)) return;
    const read = ++this.reconcileRead;
    const spaces = await this.options.list();
    if (!this.current(generation) || read !== this.reconcileRead) return;
    const membership = spaces.find(({ space }) => space.id === this.options.spaceId);
    if (!membership) {
      this.exit("unavailable");
      if (!this.disposed) this.options.onMemberships(spaces);
      return;
    }
    this.memberships = new Map(spaces.map((entry) => [entry.space.id, entry]));
    this.options.onMemberships(spaces);
    if (this.current(generation) && this.ready) this.syncSubscriptions();
  }

  private syncSubscriptions() {
    for (const spaceId of this.subscribed) {
      if (this.memberships.has(spaceId)) continue;
      this.socket?.send({ version: 1, type: "space.unsubscribe", spaceId });
      this.subscribed.delete(spaceId);
    }
    for (const spaceId of this.memberships.keys()) {
      if (this.subscribed.has(spaceId)) continue;
      this.socket?.send({
        version: 1,
        type: "space.subscribe",
        spaceId,
        after: this.cursors.get(spaceId) ?? 0,
      });
      this.subscribed.add(spaceId);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.closeSocket(true);
  }
}
