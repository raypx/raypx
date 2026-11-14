import type { ProtectedInputAnswer, ProtectedInputRequest } from "@raypx/core/protected-input";
import type { SpaceId } from "@raypx/core/spaces";

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
  refresh = (): Promise<void> => {
    if (this.disposed) return Promise.resolve();
    if (this.loading) return this.loading;
    const revision = this.revision;
    this.loading = this.port
      .pending({ spaceId: this.spaceId })
      .then(
        (requests) => {
          if (revision === this.revision) this.update({ requests, error: false });
        },
        () => this.update({ error: true }),
      )
      .finally(() => {
        this.loading = undefined;
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
    this.revision++;
    this.listeners.clear();
  }
}
