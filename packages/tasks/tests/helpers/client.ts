import type { TaskWorkspacePort } from "../../src/model/port.js";

type Overrides = {
  tasks?: Partial<TaskWorkspacePort["tasks"]>;
  devices?: Partial<TaskWorkspacePort["devices"]>;
  approvals?: Partial<TaskWorkspacePort["approvals"]>;
  observed?: Partial<NonNullable<TaskWorkspacePort["observed"]>>;
  subscribe?: TaskWorkspacePort["subscribe"];
};
const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected client call");
};

/** Complete the port while rejecting any use case the scenario did not arrange. */
export function createTaskClient<T extends Overrides>(overrides: T) {
  return {
    ...overrides,
    tasks: {
      list: unexpected,
      get: unexpected,
      create: unexpected,
      followUp: unexpected,
      cancel: unexpected,
      input: unexpected,
      ...overrides.tasks,
    },
    devices: { list: unexpected, ...overrides.devices },
    approvals: { list: unexpected, decide: unexpected, ...overrides.approvals },
    subscribe: overrides.subscribe ?? (() => () => {}),
    ...(overrides.observed
      ? {
          observed: {
            list: unexpected,
            get: unexpected,
            decide: unexpected,
            ...overrides.observed,
          },
        }
      : {}),
  } satisfies TaskWorkspacePort;
}
