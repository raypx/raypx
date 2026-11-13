import type { RpcBoundary } from "./boundary.js";
export function createDevicesHandlers({
  os,
  controlCall,
  options,
}: Pick<RpcBoundary, "os" | "controlCall" | "options">) {
  return {
    register: os.devices.register.handler(({ input, context }) =>
      controlCall(
        context,
        "projects.read",
        (control, auth) => control.credentials.register(auth, input),
        { procedure: "devices.register", window: 60, max: 10 },
      ),
    ),
    refreshGrant: os.devices.refreshGrant.handler(({ input, context }) =>
      controlCall(
        context,
        "projects.read",
        (control, auth) => control.credentials.refreshGrant(auth, input),
        { procedure: "devices.refreshGrant", window: 60, max: 30 },
      ),
    ),
    list: os.devices.list.handler(({ context }) =>
      controlCall(context, "projects.read", (control, auth) =>
        control.credentials.listDevices(auth.user.id),
      ),
    ),
    revoke: os.devices.revoke.handler(({ input, context }) =>
      controlCall(context, "projects.read", async (control, auth) => {
        const result = await control.credentials.revoke(auth.user.id, input);
        await options.onRevoke?.(auth.user.id, input.deviceId);
        return result;
      }),
    ),
  };
}
