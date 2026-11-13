import type { RpcBoundary } from "./boundary.js";
export function createTasksHandlers({ os, controlCall }: Pick<RpcBoundary, "os" | "controlCall">) {
  return {
    list: os.tasks.list.handler(({ input, context }) =>
      controlCall(context, "tasks.read", (control, auth) =>
        control.tasks.listTasks(auth.user.id, input),
      ),
    ),
    get: os.tasks.get.handler(({ input, context }) =>
      controlCall(context, "tasks.read", (control, auth) =>
        control.tasks.getTask(auth.user.id, input.id, input.after, input.beforeActivity),
      ),
    ),
  };
}
