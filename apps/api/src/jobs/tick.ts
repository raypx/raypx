import type { CloudJobsService } from "@raypx/jobs/server";
import type { ApiLogging } from "../logging.js";

export function createScheduleTick(
  service: CloudJobsService,
  logger: ApiLogging,
  enabled: boolean,
) {
  return async () => {
    const event = logger.createLogger({ operation: "job.schedules" });
    try {
      const result = enabled
        ? await service.tick()
        : { enabled: false, claimed: 0, reconciled: 0, failed: 0 };
      event.emit({
        status: 200,
        job: {
          name: "schedules:tick",
          status: result.enabled ? "completed" : "disabled",
          claimed: String(result.claimed),
          reconciled: String(result.reconciled),
          failed: String(result.failed),
        },
      });
      return result;
    } catch {
      const error = new Error("Schedule task failed");
      event.error(error);
      event.emit({ status: 500, code: "JOB_FAILED" });
      throw error;
    }
  };
}
