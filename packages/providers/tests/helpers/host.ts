import type {
  AdapterEvent,
  AdapterPorts,
  AgentTransport,
  ExecutionHandle,
  TransportFactory,
  AskApproval,
} from "../../src/core/index.js";

/** Controlled host used by process and SDK adapters without importing an application. */
export function createTestProviderHost(
  ask: AskApproval = async () => ({ type: "deny", note: "" }),
) {
  let current = true;
  const events: AdapterEvent[] = [];
  const ports: AdapterPorts = {
    approval: { ask, hook: () => ({ url: "http://127.0.0.1/hook", token: "fixture" }) },
    current: () => current,
    emit: (event) => {
      events.push(event);
    },
  };
  return {
    ports,
    events,
    replace: () => {
      current = false;
    },
  };
}

/** kill and completion are separate: tests explicitly release the final transport drain. */
export function createTestTransport() {
  let receive: (message: Record<string, unknown>) => void = () => {};
  let drain!: (code: number) => void;
  const sent: unknown[] = [];
  const requests: { method: string; params: unknown }[] = [];
  let killed = false;
  const transport: AgentTransport = {
    completed: new Promise<number>((resolve) => {
      drain = resolve;
    }),
    send: (value) => {
      sent.push(value);
    },
    request: async (method, params) => {
      requests.push({ method, params });
      return { thread: { id: "test-session" }, turn: { id: "test-turn" } };
    },
    control: async (params) => {
      requests.push({ method: "control", params });
      return {};
    },
    kill: async () => {
      killed = true;
    },
  };
  const factory: TransportFactory = (_executable, _args, _directory, onMessage) => {
    receive = onMessage;
    return transport;
  };
  return {
    factory,
    sent,
    requests,
    receive: (message: Record<string, unknown>) => receive(message),
    drain: () => drain(0),
    get killed() {
      return killed;
    },
  };
}

/** Observe the drain promise without forcing test runners or assertion libraries into fixtures. */
export function observeDrain(handle: ExecutionHandle) {
  let drained = false;
  void handle.completed.then(() => {
    drained = true;
  });
  return () => drained;
}
