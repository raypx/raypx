import type { DeviceComputer, DeviceComputerSelection } from "@raypx/core/computers";
import type { SpaceScope } from "@raypx/spaces/server";
import type {
  DeviceConnectorCredential,
  DeviceConnectorRequest,
  DeviceConnectorEventData,
  DeviceDirectoryGrantWire,
} from "@raypx/contracts/device-connector";

export class DeviceComputerError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "PAIRING_EXPIRED"
      | "PAIRING_USED"
      | "ACCESS_DENIED"
      | "DEVICE_OFFLINE"
      | "DEVICE_REVOKED"
      | "STALE_FENCE"
      | "OUTCOME_UNKNOWN"
      | "LIMIT_EXCEEDED"
      | "INVALID_INPUT",
  ) {
    super(code);
    this.name = "DeviceComputerError";
  }
}
export interface ConnectorIdentity {
  deviceId: string;
  accountId: string;
  credentialRevision: number;
  presentedCredentialHash?: string;
}
export interface ConnectedDevice extends ConnectorIdentity {
  connectionFence: number;
  cursor: number;
  credential: DeviceConnectorCredential;
  grants: DeviceDirectoryGrantWire[];
}
export interface DeviceRunContext {
  spaceId: string;
  conversationId: string;
  runId: string;
  runFence: number;
  requesterAccountId: string;
  deviceId: string;
  grantId: string;
}
export interface DeviceRunGrant extends DeviceDirectoryGrantWire {
  name: string;
  generation: number;
  connectionFence: number;
  connectionOwner: string;
}
export interface DeviceComputersRepository {
  list(this: void, scope: SpaceScope): Promise<DeviceComputer[]>;
  createPairing(this: void, scope: SpaceScope): Promise<{ code: string; expiresAt: string }>;
  claim(
    this: void,
    input: { code: string; deviceName: string; platform?: string },
  ): Promise<{
    claimId: string;
    claimToken: string;
    accountId: string;
    accountLabel: string;
    spaceId: string;
    spaceLabel: string;
    expiresAt: string;
  }>;
  confirm(
    this: void,
    input: { claimId: string; claimToken: string },
  ): Promise<DeviceConnectorCredential>;
  prepareGrant(
    this: void,
    identity: ConnectorIdentity,
    spaceId: string,
    directory: string,
  ): Promise<{
    accountId: string;
    accountLabel: string;
    spaceId: string;
    spaceLabel: string;
    deviceId: string;
    deviceName: string;
    directory: string;
  }>;
  revokeAccount(this: void, accountId: string): Promise<void>;
  route(this: void, identity: ConnectorIdentity): Promise<{ owner: string; fence: number }>;
  authenticate(this: void, credential: string): Promise<ConnectorIdentity>;
  connect(this: void, identity: ConnectorIdentity, owner: string): Promise<ConnectedDevice>;
  ready(this: void, device: ConnectedDevice, owner: string): Promise<void>;
  heartbeat(this: void, device: ConnectedDevice, owner: string): Promise<void>;
  disconnect(this: void, device: ConnectedDevice, owner: string): Promise<void>;
  grants(this: void, identity: ConnectorIdentity): Promise<DeviceDirectoryGrantWire[]>;
  grant(
    this: void,
    identity: ConnectorIdentity,
    input: { spaceId: string; directory: string },
  ): Promise<DeviceDirectoryGrantWire>;
  revokeGrant(
    this: void,
    identity: ConnectorIdentity,
    spaceId: string,
    grantId: string,
  ): Promise<void>;
  revoke(this: void, identity: ConnectorIdentity): Promise<void>;
  owned(
    this: void,
    scope: SpaceScope,
    deviceId: string,
  ): Promise<ConnectorIdentity & { spaceLabel: string }>;
  getSelection(
    this: void,
    scope: SpaceScope,
    conversationId: string,
  ): Promise<DeviceComputerSelection | null>;
  select(
    this: void,
    scope: SpaceScope,
    conversationId: string,
    selection: DeviceComputerSelection | null,
  ): Promise<DeviceComputerSelection | null>;
  resolveRun(
    this: void,
    scope: SpaceScope,
    run: {
      id: string;
      conversationId: string;
      memberAccountId: string;
      computerId: string | null;
      startedAt: string | null;
      untrustedInput: boolean;
      parentRunId?: string | null;
      inboundProvenance?: unknown;
    },
  ): Promise<DeviceRunGrant | null>;
  admit(this: void, context: DeviceRunContext): Promise<DeviceRunGrant>;
  operationEvents(
    this: void,
    context: DeviceRunContext,
    operationId: string,
    after: number,
  ): Promise<{ sequence: number; event: DeviceConnectorEventData }[]>;
  beginOperation(
    this: void,
    context: DeviceRunContext,
    request: DeviceConnectorRequest,
  ): Promise<void>;
  event(
    this: void,
    device: ConnectedDevice,
    sequence: number,
    operationId: string,
    event: DeviceConnectorEventData,
  ): Promise<boolean>;
}
export interface DeviceComputersService {
  list(scope: SpaceScope): Promise<{ devices: DeviceComputer[] }>;
  createPairing(scope: SpaceScope): Promise<{ code: string; expiresAt: string }>;
  requestGrant(scope: SpaceScope, deviceId: string): Promise<{ requestId: string }>;
  revokeGrant(scope: SpaceScope, deviceId: string, grantId: string): Promise<{ ok: true }>;
  revoke(scope: SpaceScope, deviceId: string): Promise<{ ok: true }>;
  getSelection(
    scope: SpaceScope,
    conversationId: string,
  ): Promise<{ selection: DeviceComputerSelection | null }>;
  select(
    scope: SpaceScope,
    conversationId: string,
    selection: DeviceComputerSelection | null,
  ): Promise<{ selection: DeviceComputerSelection | null }>;
}
