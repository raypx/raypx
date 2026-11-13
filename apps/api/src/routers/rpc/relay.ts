import type { RpcSetup } from "./setup.js";
export function createRelayHandlers({
  os,
  callControl,
  withRpcPermission,
}: Pick<RpcSetup, "os" | "callControl" | "withRpcPermission">) {
  return {
    ticket: os.relay.ticket
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(({ context }) =>
        callControl(context, (control, auth) => control.credentials.ticket(auth)),
      ),
  };
}
