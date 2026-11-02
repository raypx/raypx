import { createRuntime as runtime } from "../../src/runtime";
import { createHost as host } from "../../src/runtime/host";
import { startDaemon as daemon } from "../../src/runtime/daemon/server";
import type { InstanceAccess } from "../../src/runtime/instances";
export const enrolledInstance: InstanceAccess = {
  assert: async () => {},
  status: async () => ({ state: "registered" }),
};
export const createRuntime = (options: Parameters<typeof runtime>[0] = {}) =>
  runtime({ ...options, instanceAccess: enrolledInstance });
export const createHost = (options: Parameters<typeof host>[0]) =>
  host({ ...options, instanceAccess: enrolledInstance });
export const startDaemon = (options: Parameters<typeof daemon>[0] = {}) =>
  daemon({ ...options, instanceAccess: enrolledInstance });
