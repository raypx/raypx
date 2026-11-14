import type {
  ComputerScreenEvent,
  ComputerScreenFrame,
  ComputerScreenInput,
  ComputerScreenState,
} from "@raypx/core/computers";
import type { SpaceId } from "@raypx/core/spaces";
import type { ConversationSocket, ConversationSocketPort } from "./port.js";

export interface ComputerScreenPort {
  screenAvailability(this: void, input: { spaceId: SpaceId }): Promise<ComputerScreenState>;
  startScreen(this: void, input: { spaceId: SpaceId }): Promise<ComputerScreenState>;
  stopScreen(this: void, input: { spaceId: SpaceId }): Promise<ComputerScreenState>;
  acquireControl(
    this: void,
    input: { spaceId: SpaceId; viewerId: string },
  ): Promise<ComputerScreenState>;
  renewControl(
    this: void,
    input: { spaceId: SpaceId; grantId: string },
  ): Promise<ComputerScreenState>;
  releaseControl(
    this: void,
    input: { spaceId: SpaceId; grantId: string },
  ): Promise<ComputerScreenState>;
  forceReleaseControl(this: void, input: { spaceId: SpaceId }): Promise<ComputerScreenState>;
  screenInput(
    this: void,
    input: { spaceId: SpaceId; grantId: string; input: ComputerScreenInput },
  ): Promise<{ accepted: true }>;
}
export interface ComputerScreenView {
  state: ComputerScreenState | null;
  frame: ComputerScreenFrame | null;
  pending: boolean;
  connected: boolean;
  paused: boolean;
  error: string | null;
}

/** Pixels stay in this disposable projection; no draft, log or query cache stores them. */
export class ComputerScreenController {
  private view: ComputerScreenView = {
    state: null,
    frame: null,
    pending: false,
    connected: false,
    paused: false,
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private socket: ConversationSocket | undefined;
  private epoch = 0;
  private connectionEpoch = 0;
  private stateRevision = 0;
  private active = false;
  private disposed = false;
  private renewal: ReturnType<typeof setInterval> | undefined;
  private reconnect: ReturnType<typeof setTimeout> | undefined;
  private inputQueue: Promise<void> = Promise.resolve();
  private inputs = 0;
  private currentViewerId: string = "";
  get viewerId() {
    return this.currentViewerId;
  }
  constructor(
    readonly spaceId: SpaceId,
    readonly accountId: string,
    private readonly port: ComputerScreenPort,
    private readonly sockets: ConversationSocketPort,
    private readonly key: () => string = () => crypto.randomUUID(),
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  get controlling() {
    return (
      this.view.state?.status === "available" &&
      this.view.connected &&
      this.view.state.control?.accountId === this.accountId &&
      this.ownedGrant === this.view.state.control.id
    );
  }
  private ownedGrant: string | null = null;
  private update(patch: Partial<ComputerScreenView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private apply(state: ComputerScreenState) {
    // A stream state sampled before acquisition can arrive after its RPC result.
    // Retain the owned selector; only matching current state enables control.
    ++this.stateRevision;
    this.update({ state });
  }
  async open() {
    if (this.active || this.disposed) return;
    this.active = true;
    this.renewal = setInterval(() => void this.renew(), 10_000);
    await this.refresh();
  }
  async refresh() {
    const epoch = this.epoch;
    const revision = this.stateRevision;
    try {
      const state = await this.port.screenAvailability({ spaceId: this.spaceId });
      if (epoch !== this.epoch || !this.active || revision !== this.stateRevision) return;
      this.apply(state);
      this.update({ error: null });
      if (state.status === "available" && state.running && !this.view.paused) this.connect();
      else this.disconnect();
    } catch {
      if (epoch === this.epoch && this.active && revision === this.stateRevision)
        this.update({ error: "SCREEN_UNAVAILABLE" });
    }
  }
  private disconnect() {
    ++this.connectionEpoch;
    const socket = this.socket;
    this.socket = undefined;
    this.ownedGrant = null;
    socket?.close();
    this.update({ connected: false, frame: null });
  }
  private connect() {
    if (this.socket || !this.active || this.disposed) return;
    const viewerId = this.key();
    this.currentViewerId = viewerId;
    const epoch = this.epoch;
    const connection = ++this.connectionEpoch;
    const transport: { socket: ConversationSocket | undefined } = { socket: undefined };
    let pendingReady = false;
    let subscribed = false;
    const current = () =>
      epoch === this.epoch && connection === this.connectionEpoch && this.active && !this.disposed;
    const subscribe = () => {
      const socket = transport.socket;
      if (!socket || !current() || subscribed) return;
      subscribed = true;
      socket.send({ type: "screen.subscribe", version: 1, spaceId: this.spaceId, viewerId });
    };
    const opened = this.sockets.connect({
      onFrame: (frame) => {
        if (!current()) return;
        if (frame.type === "ready") {
          pendingReady = true;
          subscribe();
          return;
        }
        if (
          frame.type !== "screen.event" ||
          frame.spaceId !== this.spaceId ||
          frame.viewerId !== viewerId
        )
          return;
        this.receive(frame.event);
        if (!current()) return;
        transport.socket?.send({
          type: "screen.ack",
          version: 1,
          spaceId: this.spaceId,
          viewerId,
          sequence: frame.sequence,
        });
      },
      onClose: (_code, reason) => {
        if (!current()) return;
        ++this.connectionEpoch;
        this.socket = undefined;
        this.ownedGrant = null;
        this.update({ connected: false, frame: null, error: reason || "SCREEN_UNAVAILABLE" });
        if (reason === "SCREEN_STOPPED") this.reconcileStopped();
      },
      onError: () => {
        if (current()) this.update({ error: "SCREEN_UNAVAILABLE" });
      },
    });
    if (!current()) {
      opened.close();
      return;
    }
    transport.socket = opened;
    this.socket = opened;
    if (pendingReady) subscribe();
  }
  private receive(event: ComputerScreenEvent) {
    if (event.kind === "frame") {
      this.update({ frame: event.frame, connected: true, error: null });
      return;
    }
    if (event.kind === "state") {
      this.apply(event.state);
      this.update({ connected: true });
      return;
    }
    this.ownedGrant = null;
    this.update({ connected: false, frame: null, error: event.reason });
    this.disconnect();
    if (event.reason === "SCREEN_STOPPED") this.reconcileStopped();
    else if (event.reason === "SCREEN_STREAM_EXPIRED" && this.active)
      this.reconnect = setTimeout(() => void this.refresh(), 1000);
  }
  private reconcileStopped() {
    const state = this.view.state;
    if (state?.status === "available")
      this.apply({ ...state, running: false, control: null, agentInputPaused: false });
    // The stream can end before its final state frame. Reconcile the authoritative
    // stop immediately; a fresh read can discover a restart without overwriting
    // newer command state because refresh checks both the epoch and revision.
    void this.refresh();
  }
  private async command(action: () => Promise<ComputerScreenState>, acquire = false) {
    if (this.view.pending || this.disposed || !this.active) return false;
    const epoch = this.epoch;
    const connection = this.connectionEpoch;
    this.update({ pending: true, error: null });
    try {
      const state = await action();
      if (
        epoch !== this.epoch ||
        !this.active ||
        (acquire && connection !== this.connectionEpoch)
      ) {
        if (acquire && state.status === "available" && state.control?.accountId === this.accountId)
          void this.port
            .releaseControl({ spaceId: this.spaceId, grantId: state.control.id })
            .catch(() => {});
        return false;
      }
      if (acquire && state.status === "available") this.ownedGrant = state.control?.id ?? null;
      this.apply(state);
      if (state.status === "available" && state.running && !this.view.paused) this.connect();
      else {
        this.disconnect();
        this.update({ frame: null });
      }
      return true;
    } catch (error) {
      if (epoch === this.epoch && (!acquire || connection === this.connectionEpoch)) {
        const data = (error as { data?: { error?: { code?: unknown } } })?.data?.error?.code;
        this.update({ error: typeof data === "string" ? data : "SCREEN_UNAVAILABLE" });
      }
      return false;
    } finally {
      if (epoch === this.epoch) this.update({ pending: false });
    }
  }
  start() {
    return this.command(() => this.port.startScreen({ spaceId: this.spaceId }));
  }
  stop() {
    return this.command(() => this.port.stopScreen({ spaceId: this.spaceId }));
  }
  acquire() {
    if (!this.view.connected || this.controlling) return Promise.resolve(false);
    return this.command(
      () => this.port.acquireControl({ spaceId: this.spaceId, viewerId: this.viewerId }),
      true,
    );
  }
  release() {
    const grantId = this.ownedGrant;
    if (!grantId) return Promise.resolve(false);
    return this.command(async () => {
      const state = await this.port.releaseControl({ spaceId: this.spaceId, grantId });
      if (this.ownedGrant === grantId) this.ownedGrant = null;
      return state;
    });
  }
  forceRelease() {
    return this.command(() => this.port.forceReleaseControl({ spaceId: this.spaceId }));
  }
  private async renew() {
    const grantId = this.ownedGrant;
    if (!this.controlling || !grantId || this.view.pending) return;
    const epoch = this.epoch;
    const connection = this.connectionEpoch;
    try {
      const state = await this.port.renewControl({ spaceId: this.spaceId, grantId });
      if (
        epoch === this.epoch &&
        connection === this.connectionEpoch &&
        grantId === this.ownedGrant
      )
        this.apply(state);
    } catch {
      if (
        epoch === this.epoch &&
        connection === this.connectionEpoch &&
        grantId === this.ownedGrant
      ) {
        this.ownedGrant = null;
        this.update({ error: "SCREEN_CONTROL_EXPIRED" });
        void this.refresh();
      }
    }
  }
  input(input: ComputerScreenInput) {
    const grantId = this.ownedGrant;
    if (!this.controlling || !grantId || !this.view.connected || this.inputs >= 32) return;
    const epoch = this.epoch;
    const connection = this.connectionEpoch;
    ++this.inputs;
    this.inputQueue = this.inputQueue
      .then(async () => {
        if (
          epoch !== this.epoch ||
          connection !== this.connectionEpoch ||
          !this.controlling ||
          grantId !== this.ownedGrant
        )
          return;
        try {
          await this.port.screenInput({ spaceId: this.spaceId, grantId, input });
        } catch {
          if (
            epoch !== this.epoch ||
            connection !== this.connectionEpoch ||
            grantId !== this.ownedGrant
          )
            return;
          this.ownedGrant = null;
          this.update({ error: "SCREEN_INPUT_REFUSED" });
          void this.refresh();
        }
      })
      .finally(() => {
        --this.inputs;
      });
  }
  flushInput(): Promise<void> {
    return this.inputQueue;
  }
  async togglePause() {
    if (this.controlling) await this.release();
    this.update({ paused: !this.view.paused, frame: null });
    if (this.view.paused) this.disconnect();
    else await this.refresh();
  }
  close() {
    this.active = false;
    ++this.epoch;
    clearInterval(this.renewal);
    clearTimeout(this.reconnect);
    const grantId = this.ownedGrant;
    this.disconnect();
    this.ownedGrant = null;
    if (grantId) void this.port.releaseControl({ spaceId: this.spaceId, grantId }).catch(() => {});
    this.update({ state: null, frame: null, pending: false, error: null });
  }
  dispose() {
    this.close();
    this.disposed = true;
    this.listeners.clear();
  }
}
