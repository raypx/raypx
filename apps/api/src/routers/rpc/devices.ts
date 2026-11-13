import type { RpcSetup } from "./setup.js";
export function createDevicesHandlers({
  os,
  callControl,
  options,
  withRpcPermission,
}: Pick<RpcSetup, "os" | "callControl" | "options" | "withRpcPermission">) {
  const canRead = withRpcPermission();
  return {
    register: os.devices.register
      .use(withRpcPermission({ window: 60, max: 10 }))
      .handler(({ input, context }) =>
        callControl(context, (control, auth) => control.credentials.register(auth, input)),
      ),
    refreshGrant: os.devices.refreshGrant
      .use(withRpcPermission({ window: 60, max: 30 }))
      .handler(({ input, context }) =>
        callControl(context, (control, auth) => control.credentials.refreshGrant(auth, input)),
      ),
    list: os.devices.list
      .use(canRead)
      .handler(({ context }) =>
        callControl(context, (control, auth) => control.credentials.listDevices(auth.user.id)),
      ),
    revoke: os.devices.revoke.use(canRead).handler(({ input, context }) =>
      callControl(context, async (control, auth) => {
        const result = await control.credentials.revoke(auth.user.id, input);
        await options.onRevoke?.(auth.user.id, input.deviceId);
        return result;
      }),
    ),
  };
}
