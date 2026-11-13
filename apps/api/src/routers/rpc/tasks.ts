import type { RpcBoundary } from "./boundary.js";
export function createTasksHandlers({
  os,
  controlCall,
  withRpcPermission,
}: Pick<RpcBoundary, "os" | "controlCall" | "withRpcPermission">) {
  const canRead = withRpcPermission();
  return {
    list: os.tasks.list
      .use(canRead)
      .handler(({ input, context }) =>
        controlCall(context, (control, auth) => control.tasks.listTasks(auth.user.id, input)),
      ),
    get: os.tasks.get
      .use(canRead)
      .handler(({ input, context }) =>
        controlCall(context, (control, auth) =>
          control.tasks.getTask(auth.user.id, input.id, input.after, input.beforeActivity),
        ),
      ),
  };
}
