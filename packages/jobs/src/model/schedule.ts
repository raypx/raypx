import { Cron } from "croner";

export class JobError extends Error {
  constructor(
    readonly code: string,
    readonly uncertain = false,
  ) {
    super(code);
    this.name = "JobError";
  }
}
export interface JobSchedule {
  cron: string;
  timezone: string;
}
/** Pure calendar calculation. Runtime timer ownership stays with the composition root. */
export function nextJobRuns(schedule: JobSchedule, after: Date = new Date(), count = 5): string[] {
  if (
    schedule.cron.trim().split(/\s+/).length !== 5 ||
    !Number.isFinite(after.getTime()) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 10
  )
    throw new JobError("INVALID_CRON");
  let cron: Cron | undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone: schedule.timezone }).resolvedOptions();
    cron = new Cron(schedule.cron, { timezone: schedule.timezone, paused: true });
    const runs = cron.nextRuns(count, after);
    if (!runs.length) throw new JobError("INVALID_CRON");
    return runs.map((value) => value.toISOString());
  } catch {
    throw new JobError("INVALID_CRON");
  } finally {
    cron?.stop();
  }
}
