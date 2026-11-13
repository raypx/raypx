import { ORPCError } from "@orpc/server";
import { JobError } from "@raypx/core/jobs";
import type { CloudJobsService } from "@raypx/jobs/server";
import type { AccountRateLimit, RpcContext } from "../../middleware/rpc.js";
import type { RpcBoundary } from "./boundary.js";
export function createJobsHandlers({
  os,
  options,
  requirePermission,
  checkTrustedOrigin,
  enforceAccountLimit,
}: Pick<
  RpcBoundary,
  "os" | "options" | "requirePermission" | "checkTrustedOrigin" | "enforceAccountLimit"
>) {
  async function jobsCall<T>(
    context: RpcContext,
    limit: AccountRateLimit,
    write: boolean,
    run: (service: CloudJobsService, userId: string) => Promise<T>,
  ) {
    const auth = await requirePermission(context, "automations.manage");
    if (write) checkTrustedOrigin(context);
    await enforceAccountLimit(context, auth, limit);
    if (!options.cloudJobs) throw new ORPCError("SERVICE_UNAVAILABLE");
    try {
      return await run(options.cloudJobs, auth.user.id);
    } catch (error) {
      if (!(error instanceof JobError)) throw error;
      const code =
        error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : ["INVALID_JOB", "INVALID_CRON", "INVALID_INPUT"].includes(error.code)
            ? "BAD_REQUEST"
            : error.code === "AUTH_REQUIRED"
              ? "UNAUTHORIZED"
              : ["CONTROL_UNAVAILABLE", "JOBS_DISABLED"].includes(error.code)
                ? "SERVICE_UNAVAILABLE"
                : "CONFLICT";
      throw new ORPCError(code, {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }

  return {
    list: os.jobs.list.handler(({ context }) =>
      jobsCall(context, { procedure: "jobs.list", window: 60, max: 60 }, false, (service, userId) =>
        service.list(userId),
      ),
    ),
    history: os.jobs.history.handler(({ context, input }) =>
      jobsCall(
        context,
        { procedure: "jobs.history", window: 60, max: 60 },
        false,
        (service, userId) => service.history(userId, input),
      ),
    ),
    create: os.jobs.create.handler(({ context, input }) =>
      jobsCall(
        context,
        { procedure: "jobs.create", window: 60, max: 10 },
        true,
        (service, userId) => service.create(userId, input),
      ),
    ),
    update: os.jobs.update.handler(({ context, input }) =>
      jobsCall(
        context,
        { procedure: "jobs.update", window: 60, max: 20 },
        true,
        (service, userId) => service.update(userId, input),
      ),
    ),
    remove: os.jobs.remove.handler(({ context, input }) =>
      jobsCall(
        context,
        { procedure: "jobs.remove", window: 60, max: 10 },
        true,
        (service, userId) => service.remove(userId, input),
      ),
    ),
    run: os.jobs.run.handler(({ context, input }) =>
      jobsCall(context, { procedure: "jobs.run", window: 60, max: 10 }, true, (service, userId) =>
        service.run(userId, input),
      ),
    ),
  };
}
