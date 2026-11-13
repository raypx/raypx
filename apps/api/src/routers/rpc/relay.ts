import type { RpcBoundary } from "./boundary.js";
export function createRelayHandlers({
  os,
  controlCall,
  withRpcPermission,
}: Pick<RpcBoundary, "os" | "controlCall" | "withRpcPermission">) {
  return {
    ticket: os.relay.ticket
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(({ context }) =>
        controlCall(context, (control, auth) => control.credentials.ticket(auth)),
      ),
  };
}
