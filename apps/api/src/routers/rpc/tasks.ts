import type { RpcSetup } from "./setup.js";
export function createTasksHandlers({
  os,
  callControl,
  withRpcPermission,
}: Pick<RpcSetup, "os" | "callControl" | "withRpcPermission">) {
  const canRead = withRpcPermission();
  return {
    list: os.tasks.list
      .use(canRead)
      .handler(({ input, context }) =>
        callControl(context, (control, auth) => control.tasks.listTasks(auth.user.id, input)),
      ),
    get: os.tasks.get
      .use(canRead)
      .handler(({ input, context }) =>
        callControl(context, (control, auth) =>
          control.tasks.getTask(auth.user.id, input.id, input.after, input.beforeActivity),
        ),
      ),
  };
}
