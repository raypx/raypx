import type { RpcBoundary } from "./boundary.ts";
export function createApprovalsHandlers({
  os,
  controlCall,
}: Pick<RpcBoundary, "os" | "controlCall">) {
  return {
    list: os.approvals.list.handler(({ context }) =>
      controlCall(context, "approvals.read", (control, auth) =>
        control.tasks.listApprovals(auth.user.id),
      ),
    ),
  };
}
