import type { SpaceScope } from "@raypx/spaces/server";
import type {
  DeviceComputerSelection,
  ComputerDirectory,
  ComputerFile,
} from "@raypx/core/computers";
import type {
  DeviceMemberReadRequest,
  DeviceMemberReadResult,
} from "@raypx/contracts/device-connector";
import type { ConnectedDevice, ConnectorIdentity } from "./devices.js";

export interface DeviceMemberFilesRepository {
  cleanup(): Promise<void>;
  prepare(
    scope: SpaceScope,
    selection: DeviceComputerSelection,
    operation: DeviceMemberReadRequest["operation"],
  ): Promise<{
    request: DeviceMemberReadRequest;
    identity: ConnectorIdentity;
    route: { owner: string; fence: number };
  }>;
  complete(device: ConnectedDevice, id: string, result: DeviceMemberReadResult): Promise<void>;
  take(scope: SpaceScope, id: string): Promise<DeviceMemberReadResult | null>;
  remove(scope: SpaceScope, id: string): Promise<void>;
}
export interface DeviceMemberFilesService {
  listDirectory(
    scope: SpaceScope,
    device: DeviceComputerSelection,
    path: string,
    limit: number,
  ): Promise<ComputerDirectory>;
  readFile(
    scope: SpaceScope,
    device: DeviceComputerSelection,
    path: string,
    maxBytes: number,
  ): Promise<ComputerFile>;
}
