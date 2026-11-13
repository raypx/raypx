import type { Computer, SpaceComputer } from "@raypx/core/computers";
import type { ConversationEvent } from "@raypx/core/conversation";
import type { SpaceId } from "@raypx/core/spaces";
import type { ComputerPort } from "./port.js";
import { ComputerFilesController } from "./computer-files.js";

export interface ComputerView {
  status: "loading" | "not-configured" | Computer["state"];
  failureCode: Computer["failureCode"];
  pending: "start" | "stop" | null;
  refreshing: boolean;
  error: "load" | "start" | "stop" | null;
}

/** A Space-scoped lifecycle projection. Only the server authorizes or performs work. */
export class ComputerController {
  readonly files: ComputerFilesController | null;
  private view: ComputerView = {
    status: "loading",
    failureCode: null,
    pending: null,
    refreshing: false,
    error: null,
  };
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private revision = 0;
  private read = 0;
  private computerId: Computer["id"] | undefined;
  private generation = 0;

  constructor(
    private readonly spaceId: SpaceId,
    private readonly port: ComputerPort,
  ) {
    const listDirectory = port.listDirectory;
    const readFile = port.readFile;
    this.files =
      listDirectory && readFile
        ? new ComputerFilesController(spaceId, { listDirectory, readFile })
        : null;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<ComputerView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private apply(result: SpaceComputer) {
    if (result.status === "not-configured") {
      this.computerId = undefined;
      this.generation = 0;
      this.update({ status: "not-configured", failureCode: null });
      return;
    }
    const computer = result.computer;
    if (computer && computer.spaceId !== this.spaceId) throw new Error("Wrong Space");
    if (computer && computer.generation < this.generation) return;
    this.computerId = computer?.id;
    this.generation = computer?.generation ?? 0;
    const status = computer?.state ?? "stopped";
    this.update({
      status: status === "destroyed" ? "stopped" : status,
      failureCode: computer?.failureCode ?? null,
    });
  }
  async refresh(): Promise<void> {
    if (this.disposed) return;
    const read = ++this.read;
    const revision = this.revision;
    this.update({ refreshing: true, error: this.view.error === "load" ? null : this.view.error });
    try {
      const result = await this.port.get({ spaceId: this.spaceId });
      if (this.disposed || read !== this.read || revision !== this.revision) return;
      this.apply(result);
      this.update({ refreshing: false });
    } catch {
      if (this.disposed || read !== this.read || revision !== this.revision) return;
      this.update({ refreshing: false, error: "load" });
    }
  }
  applyEvent(event: Extract<ConversationEvent, { kind: "computer.state" }>) {
    if (this.disposed || event.spaceId !== this.spaceId) return;
    if (event.generation < this.generation) return;
    if (this.computerId && this.computerId !== event.computerId) return;
    ++this.revision;
    this.computerId = event.computerId;
    this.generation = event.generation;
    this.update({
      status: event.state === "destroyed" ? "stopped" : event.state,
      failureCode: null,
      error: null,
    });
    // Events intentionally omit failure details; get also reconciles configuration.
    void this.refresh();
  }
  private canAct() {
    return (
      !this.disposed && !this.view.pending && !this.view.refreshing && this.view.error !== "load"
    );
  }
  async start(): Promise<boolean> {
    if (!this.canAct() || (this.view.status !== "stopped" && this.view.status !== "failed"))
      return false;
    this.update({ pending: "start", error: null });
    return this.perform("start");
  }
  async stop(confirm: () => Promise<boolean>): Promise<boolean> {
    if (!this.canAct() || this.view.status !== "running") return false;
    // Claim before opening confirmation: two activations share no second request.
    this.update({ pending: "stop", error: null });
    try {
      const accepted = await confirm();
      if (!accepted || this.disposed || this.view.status !== "running") {
        this.update({ pending: null });
        return false;
      }
    } catch {
      this.update({ pending: null, error: "stop" });
      return false;
    }
    return this.perform("stop");
  }
  private async perform(operation: "start" | "stop"): Promise<boolean> {
    const revision = ++this.revision;
    ++this.read;
    this.update({ refreshing: false });
    try {
      const result = await this.port[operation]({ spaceId: this.spaceId });
      if (this.disposed) return false;
      if (revision === this.revision) {
        // A reconnect read started during this command may contain its old state.
        ++this.revision;
        ++this.read;
        this.apply(result);
        this.update({ refreshing: false });
      } else await this.refresh();
      this.update({ pending: null });
      return result.status === "available" && result.computer?.state !== "failed";
    } catch {
      if (this.disposed) return false;
      this.update({ error: operation });
      // A lost response is uncertain; read before enabling a deliberate retry.
      await this.refresh();
      this.update({ pending: null });
      return false;
    }
  }
  dispose() {
    this.files?.dispose();
    this.disposed = true;
    ++this.read;
    ++this.revision;
    this.listeners.clear();
  }
}
