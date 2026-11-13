import { ORPCError } from "@orpc/server";
import { JobError } from "@raypx/core/jobs";
import type { CloudJobsService } from "@raypx/jobs/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcBoundary } from "./boundary.js";

type Status = "NOT_FOUND" | "BAD_REQUEST" | "UNAUTHORIZED" | "SERVICE_UNAVAILABLE";
const statuses: Readonly<Record<string, Status>> = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_JOB: "BAD_REQUEST",
  INVALID_CRON: "BAD_REQUEST",
  INVALID_INPUT: "BAD_REQUEST",
  AUTH_REQUIRED: "UNAUTHORIZED",
  CONTROL_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  JOBS_DISABLED: "SERVICE_UNAVAILABLE",
};

export function createJobsHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: Pick<
  RpcBoundary,
  "os" | "options" | "withRpcPermission" | "requireTrustedOrigin" | "limitAccount"
>) {
  async function jobsCall<T>(
    context: AccountContext,
    run: (service: CloudJobsService, userId: string) => Promise<T>,
  ) {
    try {
      return await run(options.cloudJobs, context.auth.user.id);
    } catch (error) {
      if (!(error instanceof JobError)) throw error;
      throw new ORPCError(statuses[error.code] ?? "CONFLICT", {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }
  // Writes reject an untrusted Origin before they spend the account's quota.
  const canManage = withRpcPermission();

  return {
    list: os.jobs.list
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(({ context }) => jobsCall(context, (service, userId) => service.list(userId))),
    history: os.jobs.history
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(({ context, input }) =>
        jobsCall(context, (service, userId) => service.history(userId, input)),
      ),
    create: os.jobs.create
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 10 }))
      .handler(({ context, input }) =>
        jobsCall(context, (service, userId) => service.create(userId, input)),
      ),
    update: os.jobs.update
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 20 }))
      .handler(({ context, input }) =>
        jobsCall(context, (service, userId) => service.update(userId, input)),
      ),
    remove: os.jobs.remove
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 10 }))
      .handler(({ context, input }) =>
        jobsCall(context, (service, userId) => service.remove(userId, input)),
      ),
    run: os.jobs.run
      .use(canManage)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 10 }))
      .handler(({ context, input }) =>
        jobsCall(context, (service, userId) => service.run(userId, input)),
      ),
  };
}
