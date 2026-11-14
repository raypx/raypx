import type { DeviceComputer, DeviceComputerSelection } from "@raypx/core/computers";
import type { SpaceId } from "@raypx/core/spaces";
import type { ConversationId } from "@raypx/core/agents";
import type { ConversationSelection } from "./port.js";

export interface DeviceComputersPort {
  list(this: void, input: { spaceId: SpaceId }): Promise<{ devices: DeviceComputer[] }>;
  createPairing(
    this: void,
    input: { spaceId: SpaceId },
  ): Promise<{ code: string; expiresAt: string }>;
  requestGrant(
    this: void,
    input: { spaceId: SpaceId; deviceId: string },
  ): Promise<{ requestId: string }>;
  revokeGrant(
    this: void,
    input: {
      spaceId: SpaceId;
      deviceId: string;
      grantId: string;
    },
  ): Promise<{ ok: true }>;
  revoke(this: void, input: { spaceId: SpaceId; deviceId: string }): Promise<{ ok: true }>;
  getSelection(
    this: void,
    input: ConversationSelection,
  ): Promise<{ selection: DeviceComputerSelection | null }>;
  select(
    this: void,
    input: ConversationSelection & { selection: DeviceComputerSelection | null },
  ): Promise<{ selection: DeviceComputerSelection | null }>;
}

/** Native confirmation is owned by the host, never by a renderer confirmation. */
export interface NativeDeviceConfirmation {
  pair(code: string): Promise<boolean>;
  grant(input: { spaceId: SpaceId; deviceId: string }): Promise<boolean>;
}

export interface DeviceComputersView {
  devices: readonly DeviceComputer[];
  selection: DeviceComputerSelection | null;
  pairing: { code: string; expiresAt: string } | null;
  loading: boolean;
  busy: boolean;
  error: boolean;
  grantRequested: boolean;
}

/** Projections only. The server admits every selection and operation. */
export class DeviceComputersController {
  private view: DeviceComputersView = {
    devices: [],
    selection: null,
    pairing: null,
    loading: true,
    busy: false,
    error: false,
    grantRequested: false,
  };
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private revision = 0;
  constructor(
    readonly spaceId: SpaceId,
    private readonly port: DeviceComputersPort,
    private readonly conversationId?: ConversationId,
    readonly native?: NativeDeviceConfirmation,
  ) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<DeviceComputersView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async refresh() {
    if (this.disposed) return;
    const revision = ++this.revision;
    try {
      const [result, selected] = await Promise.all([
        this.port.list({ spaceId: this.spaceId }),
        this.conversationId
          ? this.port.getSelection({ spaceId: this.spaceId, conversationId: this.conversationId })
          : Promise.resolve(null),
      ]);
      if (revision !== this.revision || this.disposed) return;
      this.update({
        devices: result.devices,
        ...(selected ? { selection: selected.selection } : {}),
        loading: false,
        error: false,
      });
    } catch {
      if (revision === this.revision) this.update({ loading: false, error: true });
    }
  }
  private async mutate(operation: () => Promise<unknown>) {
    if (this.disposed || this.view.busy) return false;
    ++this.revision;
    this.update({ busy: true, error: false });
    try {
      await operation();
      await this.refresh();
      return !this.disposed;
    } catch {
      this.update({ error: true });
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  pair() {
    return this.mutate(async () => {
      const pairing = await this.port.createPairing({ spaceId: this.spaceId });
      if (this.disposed) return;
      this.update({ pairing });
      if (this.native && (await this.native.pair(pairing.code))) this.clearPairing();
    });
  }
  clearPairing() {
    this.update({ pairing: null });
  }
  requestGrant(deviceId: string) {
    return this.mutate(async () => {
      await this.port.requestGrant({ spaceId: this.spaceId, deviceId });
      this.update({ grantRequested: true });
    });
  }
  revoke(deviceId: string) {
    return this.mutate(() => this.port.revoke({ spaceId: this.spaceId, deviceId }));
  }
  revokeGrant(deviceId: string, grantId: string) {
    return this.mutate(() => this.port.revokeGrant({ spaceId: this.spaceId, deviceId, grantId }));
  }
  select(selection: DeviceComputerSelection | null) {
    const conversationId = this.conversationId;
    if (!conversationId) return Promise.resolve(false);
    return this.mutate(async () => {
      const result = await this.port.select({ spaceId: this.spaceId, conversationId, selection });
      this.update({ selection: result.selection });
    });
  }
  dispose() {
    this.clearPairing();
    this.disposed = true;
    ++this.revision;
    this.listeners.clear();
  }
}
