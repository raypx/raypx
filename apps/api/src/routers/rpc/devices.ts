import type { RpcBoundary } from "./boundary.js";
export function createDevicesHandlers({
  os,
  controlCall,
  options,
  withRpcPermission,
}: Pick<RpcBoundary, "os" | "controlCall" | "options" | "withRpcPermission">) {
  const canRead = withRpcPermission();
  return {
    register: os.devices.register
      .use(withRpcPermission({ window: 60, max: 10 }))
      .handler(({ input, context }) =>
        controlCall(context, (control, auth) => control.credentials.register(auth, input)),
      ),
    refreshGrant: os.devices.refreshGrant
      .use(withRpcPermission({ window: 60, max: 30 }))
      .handler(({ input, context }) =>
        controlCall(context, (control, auth) => control.credentials.refreshGrant(auth, input)),
      ),
    list: os.devices.list
      .use(canRead)
      .handler(({ context }) =>
        controlCall(context, (control, auth) => control.credentials.listDevices(auth.user.id)),
      ),
    revoke: os.devices.revoke.use(canRead).handler(({ input, context }) =>
      controlCall(context, async (control, auth) => {
        const result = await control.credentials.revoke(auth.user.id, input);
        await options.onRevoke?.(auth.user.id, input.deviceId);
        return result;
      }),
    ),
  };
}
