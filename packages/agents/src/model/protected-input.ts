import type { ProtectedInputAnswer, ProtectedInputRequest } from "@raypx/core/protected-input";
import type { SpaceId } from "@raypx/core/spaces";
import { isRpcRateLimited, PENDING_READ_COOLDOWN_MS } from "./rpc-rate-limit.js";

export interface ProtectedInputsPort {
  pending(input: { spaceId: SpaceId }): Promise<ProtectedInputRequest[]>;
  answer(input: {
    spaceId: SpaceId;
    requestId: string;
    answer: ProtectedInputAnswer;
  }): Promise<ProtectedInputRequest>;
}
/** Observable state contains metadata only. Submitted values are never retained. */
export class ProtectedInputsController {
  private state = {
    requests: [] as ProtectedInputRequest[],
    error: false,
    busy: null as string | null,
  };
  private listeners = new Set<() => void>();
  private disposed = false;
  private loading: Promise<void> | undefined;
  private revision = 0;
  private invalidated = false;
  private retryAt = 0;
  constructor(
    private readonly port: ProtectedInputsPort,
    private readonly spaceId: SpaceId,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<typeof this.state>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  invalidate = (): Promise<void> => {
    if (this.loading) this.invalidated = true;
    return this.refresh();
  };
  reconcileCompletion(conversationId: string | undefined) {
    if (
      this.loading ||
      this.state.requests.some((request) => request.conversationId === conversationId)
    )
      return this.invalidate();
    return Promise.resolve();
  }
  refresh = (): Promise<void> => {
    if (this.disposed || Date.now() < this.retryAt) return Promise.resolve();
    if (this.loading) return this.loading;
    const revision = this.revision;
    this.loading = this.port
      .pending({ spaceId: this.spaceId })
      .then(
        (requests) => {
          if (revision === this.revision) this.update({ requests, error: false });
        },
        (error) => {
          if (revision !== this.revision) return;
          if (isRpcRateLimited(error)) this.retryAt = Date.now() + PENDING_READ_COOLDOWN_MS;
          this.update({ error: true });
        },
      )
      .finally(() => {
        this.loading = undefined;
        if (!this.invalidated) return;
        this.invalidated = false;
        return this.refresh();
      });
    return this.loading;
  };
  async answer(requestId: string, answer: ProtectedInputAnswer) {
    if (this.disposed || this.state.busy) return;
    this.revision++;
    this.update({ busy: requestId, error: false });
    try {
      const request = await this.port.answer({ spaceId: this.spaceId, requestId, answer });
      this.update({
        requests: this.state.requests.map((item) => (item.id === requestId ? request : item)),
      });
    } catch {
      this.update({ error: true });
    } finally {
      this.update({ busy: null });
    }
    await this.loading;
    await this.refresh();
  }
  activate() {
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
    this.invalidated = false;
    this.revision++;
    this.listeners.clear();
  }
}
