import type { HostAgentPort } from "../../src/runtime/daemon/remote/agent-port.ts";
/** Map explicit test ports to recorded command labels; production has no method router. */
export function agentPort(
  request: (method: string, input: Record<string, unknown>) => Promise<unknown>,
): HostAgentPort {
  return {
    observed: (input) => request("observed.remote", input),
    projects: (input) => request("agents.projects", input) as ReturnType<HostAgentPort["projects"]>,
    capabilities: (input) =>
      request("agents.capabilities", input) as ReturnType<HostAgentPort["capabilities"]>,
    events: (input) => request("agents.events", input) as ReturnType<HostAgentPort["events"]>,
    replay: (input) => request("agents.replay", input) as ReturnType<HostAgentPort["replay"]>,
    snapshot: (input) => request("agents.snapshot", input) as ReturnType<HostAgentPort["snapshot"]>,
    remote: (input) => request("agents.remote", input) as ReturnType<HostAgentPort["remote"]>,
    checkpoint: (input) => request("agents.checkpoint", input),
    detach: (input) => request("agents.detach", input),
  };
}
