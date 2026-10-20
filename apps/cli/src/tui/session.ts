import type { JobDefinition, JobRun } from "@raypx/contracts/local";
import type { TuiTerminal } from "./terminal";
import { messages, outputLines, safeText, type TuiLocale } from "./text";

export interface TuiService {
  listJobs(): Promise<JobDefinition[]>;
  history(jobId: string): Promise<JobRun[]>;
  run(jobId: string): Promise<JobRun>;
}

type SessionOptions = {
  profile: string;
  locale: TuiLocale;
  isClosing: () => boolean;
  quit: () => void;
};
const PAGE_SIZE = 20;
const MAX_DISPLAY_CHARS = 16_384;

export async function runSession(
  terminal: TuiTerminal,
  service: TuiService,
  options: SessionOptions,
) {
  let locale = options.locale;
  const copy = () => messages[locale];
  const write = (text: string) => terminal.write(text + "\n");
  const label = (value: string) => safeText(value, true);
  const closing = options.isClosing;
  async function read(prompt: string, signal?: AbortSignal) {
    if (closing()) return null;
    const answer = await terminal.read(prompt, signal);
    if (answer === null && !signal?.aborted) options.quit();
    return answer?.trim() ?? null;
  }
  function report(error: unknown) {
    const errorText = error instanceof Error ? label(error.message).slice(0, 300) : "";
    write(`${copy().error}${errorText ? `: ${errorText}` : "."}\n${copy().retry}`);
  }
  function select<T>(answer: string, rows: T[], page: number) {
    if (!/^[1-9]\d*$/.test(answer)) return undefined;
    const index = Number(answer) - 1;
    if (!Number.isSafeInteger(index) || index < page * PAGE_SIZE || index >= (page + 1) * PAGE_SIZE)
      return undefined;
    return rows[index];
  }
  function pageRows<T>(rows: T[], page: number, render: (row: T, index: number) => string) {
    rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach((row, offset) => {
      write(`${page * PAGE_SIZE + offset + 1}. ${render(row, offset)}`);
    });
    if (rows.length > PAGE_SIZE) write(copy().nextPage);
  }
  function changePage(answer: string, page: number, count: number) {
    if (answer === "n") return Math.min(page + 1, Math.max(0, Math.ceil(count / PAGE_SIZE) - 1));
    return Math.max(0, page - 1);
  }
  async function showRun(run: JobRun) {
    write(`\n${copy().run}: ${label(run.id)}`);
    write(`${copy().status}: ${copy().statuses[run.status]}`);
    write(`${copy().exitCode}: ${run.exitCode ?? "?"}`);
    write(`${copy().started}: ${label(run.startedAt)}`);
    write(`${copy().finished}: ${run.finishedAt ? label(run.finishedAt) : "?"}`);
    write(`${copy().output}:`);
    const lines = run.output
      ? outputLines(run.output.slice(0, MAX_DISPLAY_CHARS), process.stdout.columns ?? 80)
      : [copy().noOutput];
    if (run.output.length > MAX_DISPLAY_CHARS) write(copy().truncated);
    let page = 0;
    while (!closing()) {
      // Prefix every output line so external text cannot impersonate UI controls.
      for (const line of lines.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) write(`| ${line}`);
      const more = (page + 1) * PAGE_SIZE < lines.length;
      const answer = await read(more ? copy().more : copy().continue);
      if (answer === null) return;
      if (answer === "q") {
        options.quit();
        return;
      }
      if (answer === "b" || (!more && answer === "")) return;
      if (answer === "" && more) page++;
      else write(copy().invalid);
    }
  }
  async function history(job: JobDefinition) {
    const rows = await service.history(job.id);
    let page = 0;
    while (!closing()) {
      write(`\n${copy().history}: ${label(job.name)}`);
      if (!rows.length) write(copy().noHistory);
      pageRows(
        rows,
        page,
        (run) => `${label(run.startedAt)}  ${copy().statuses[run.status]}  ${label(run.id)}`,
      );
      const answer = await read(copy().chooseRun);
      if (answer === null || answer === "b") return;
      if (answer === "q") {
        options.quit();
        return;
      }
      if (answer === "n" || answer === "p") {
        page = changePage(answer, page, rows.length);
        continue;
      }
      const run = select(answer, rows, page);
      if (run) await showRun(run);
      else write(copy().invalid);
    }
  }
  async function runOnce(job: JobDefinition) {
    const confirmation = await read(copy().confirm);
    if (confirmation === null) return;
    if (confirmation === "q") {
      options.quit();
      return;
    }
    if (confirmation !== "yes") {
      write(copy().declined);
      return;
    }
    if (closing()) return;
    write(copy().running);
    const completed = service.run(job.id).then(
      (run) => ({ type: "result" as const, run }),
      (error: unknown) => ({ type: "error" as const, error }),
    );
    async function raceRead(prompt: string) {
      const controller = new AbortController();
      try {
        return await Promise.race([
          completed,
          read(prompt, controller.signal).then((answer) => ({ type: "input" as const, answer })),
        ]);
      } finally {
        controller.abort();
      }
    }
    while (!closing()) {
      let event = await raceRead(copy().runningPrompt);
      if (event.type === "input" && event.answer === "q") {
        event = await raceRead(copy().cancel);
        if (event.type === "input" && event.answer === "yes") {
          options.quit();
          return;
        }
      }
      if (event.type === "result") {
        await showRun(event.run);
        return;
      }
      if (event.type === "error") throw event.error;
      if (event.answer === null) return;
      write(copy().busy);
    }
  }
  async function detail(job: JobDefinition) {
    while (!closing()) {
      write(`\n${label(job.name)}\n${label(job.id)}`);
      write(
        `${copy().schedule}: ${label(job.cron)}  ${label(job.timezone)} (${job.enabled ? copy().enabled : copy().disabled})`,
      );
      write(`${copy().next}: ${job.enabled ? label(job.nextRuns[0] ?? "?") : copy().disabled}`);
      const action =
        job.action.type === "command.run"
          ? `${job.action.command.executable} ${JSON.stringify(job.action.command.args)} (${job.action.command.cwd})`
          : `${job.action.type} (${job.action.rootId}/${job.action.path})`;
      write(`${copy().action}: ${label(action)}`);
      write(copy().detail);
      const answer = await read(copy().prompt);
      if (answer === null || answer === "b") return;
      if (answer === "q") {
        options.quit();
        return;
      }
      try {
        if (answer === "r") await runOnce(job);
        else if (answer === "h") await history(job);
        else write(copy().invalid);
      } catch (error) {
        if (!closing()) report(error);
      }
    }
  }
  async function tasks() {
    let rows = await service.listJobs();
    let page = 0;
    while (!closing()) {
      write(`\n${copy().tasks} (${rows.length})`);
      if (!rows.length) write(copy().noJobs);
      pageRows(
        rows,
        page,
        (job) => `${label(job.name)}  [${job.enabled ? copy().enabled : copy().disabled}]`,
      );
      const answer = await read(copy().choose);
      if (answer === null || answer === "b") return;
      if (answer === "q") {
        options.quit();
        return;
      }
      if (answer === "r") {
        rows = await service.listJobs();
        page = 0;
        continue;
      }
      if (answer === "n" || answer === "p") {
        page = changePage(answer, page, rows.length);
        continue;
      }
      const job = select(answer, rows, page);
      if (job) await detail(job);
      else write(copy().invalid);
    }
  }
  while (!closing()) {
    write(`\nRaypx\n${copy().profile}: ${label(options.profile)}\n${copy().local}`);
    try {
      const rows = await service.listJobs();
      write(`${copy().tasks}: ${rows.length}`);
      if (!rows.length) write(copy().noJobs);
    } catch (error) {
      report(error);
    }
    if (closing()) break;
    write(copy().home);
    const answer = await read(copy().prompt);
    if (answer === null) break;
    if (answer === "q") {
      options.quit();
      break;
    }
    if (answer === "l") {
      locale = locale === "en" ? "zh" : "en";
      continue;
    }
    if (answer === "r") continue;
    if (answer === "t") {
      try {
        await tasks();
      } catch (error) {
        if (!closing()) report(error);
      }
    } else write(copy().invalid);
  }
  write(copy().goodbye);
}
