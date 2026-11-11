import type { RpcBoundary } from "./boundary.js";
export function createRelayHandlers({ os, controlCall }: Pick<RpcBoundary, "os" | "controlCall">) {
  return {
    ticket: os.relay.ticket.handler(({ context }) =>
      controlCall(
        context,
        "tasks.read",
        (control, auth) => control.credentials.ticket(auth),
        "relay.ticket",
      ),
    ),
  };
}
