import type { RpcBoundary } from "./boundary.js";
export function createJobsHandlers({ os, jobsCall }: Pick<RpcBoundary, "os" | "jobsCall">) {
  return {
    list: os.jobs.list.handler(({ context }) =>
      jobsCall(context, "jobs.list", false, (service, userId) => service.list(userId)),
    ),
    history: os.jobs.history.handler(({ context, input }) =>
      jobsCall(context, "jobs.history", false, (service, userId) => service.history(userId, input)),
    ),
    create: os.jobs.create.handler(({ context, input }) =>
      jobsCall(context, "jobs.create", true, (service, userId) => service.create(userId, input)),
    ),
    update: os.jobs.update.handler(({ context, input }) =>
      jobsCall(context, "jobs.update", true, (service, userId) => service.update(userId, input)),
    ),
    remove: os.jobs.remove.handler(({ context, input }) =>
      jobsCall(context, "jobs.remove", true, (service, userId) => service.remove(userId, input)),
    ),
    run: os.jobs.run.handler(({ context, input }) =>
      jobsCall(context, "jobs.run", true, (service, userId) => service.run(userId, input)),
    ),
  };
}
