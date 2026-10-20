import { stripVTControlCharacters } from "node:util";

/** Display projection only. Stored command output and names are never rewritten. */
export function safeText(value: string, singleLine = false) {
  const text = stripVTControlCharacters(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\p{Cc}/gu, (character) => (character === "\n" || character === "\t" ? character : ""))
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
  return singleLine ? text.replace(/\s+/g, " ").slice(0, 180) : text;
}

/** Bound long output lines as well as total output, including on narrow terminals. */
export function outputLines(value: string, columns = 80) {
  const width = Math.max(12, Math.min(100, columns - 4));
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  return safeText(value)
    .replace(/\t/g, "    ")
    .split("\n")
    .flatMap((line) => {
      const result: string[] = [];
      let chunk = "";
      let used = 0;
      for (const { segment } of segmenter.segment(line)) {
        // Non-ASCII graphemes get two cells conservatively; terminal fonts decide
        // their exact width. No padding/alignment depends on this estimate.
        const cells = (segment.codePointAt(0) ?? 0) > 0x7f || segment.length > 1 ? 2 : 1;
        if (used + cells > width && chunk) {
          result.push(chunk);
          chunk = "";
          used = 0;
        }
        chunk += segment;
        used += cells;
      }
      result.push(chunk);
      return result;
    });
}

export const messages = {
  en: {
    profile: "Profile",
    local: "Local session. Scheduling stays with Desktop.",
    home: "[t] Tasks  [r] Refresh  [l] 中文  [q] Quit",
    tasks: "Tasks",
    noJobs: "No tasks in this profile. Create one with raypx jobs create, then refresh.",
    choose: "Task number, [r] refresh, [b] back, [q] quit: ",
    nextPage: "[n] Next page  [p] Previous page",
    detail: "[r] Run once  [h] History  [b] Back  [q] Quit",
    prompt: "Choose: ",
    enabled: "Enabled",
    disabled: "Disabled",
    schedule: "Schedule",
    next: "Next scheduled time",
    action: "Action",
    confirm: "Run this task once with your OS permissions? Type yes to run: ",
    declined: "Run not started.",
    running: "Running. [q] Cancel this session's work and quit.",
    runningPrompt: "Running: ",
    busy: "A task is running. Enter q to cancel this session and quit.",
    cancel: "Cancel this session's work and quit? Type yes to confirm: ",
    history: "History",
    noHistory: "No runs recorded for this task yet.",
    chooseRun: "Run number, [b] back, [q] quit: ",
    run: "Run",
    status: "Status",
    exitCode: "Exit code",
    started: "Started",
    finished: "Finished",
    output: "Output",
    noOutput: "No output retained.",
    truncated:
      "Display abbreviated. Retained history may also be shorter than the original output.",
    continue: "Press Enter to continue, [q] quit: ",
    more: "Press Enter for more output, [b] back, [q] quit: ",
    invalid: "Choose one of the listed options.",
    error: "Unable to complete the operation",
    retry: "You can refresh or choose the action again.",
    goodbye: "Session closed.",
    statuses: {
      running: "Running",
      success: "Success",
      failed: "Failed",
      cancelled: "Cancelled",
      interrupted: "Interrupted",
      skipped: "Skipped",
    },
  },
  zh: {
    profile: "配置",
    local: "本地会话。定时调度由 Desktop 负责。",
    home: "[t] 任务  [r] 刷新  [l] English  [q] 退出",
    tasks: "任务",
    noJobs: "此配置中还没有任务。使用 raypx jobs create 创建后刷新。",
    choose: "输入任务编号，[r] 刷新，[b] 返回，[q] 退出：",
    nextPage: "[n] 下一页  [p] 上一页",
    detail: "[r] 执行一次  [h] 历史  [b] 返回  [q] 退出",
    prompt: "请选择：",
    enabled: "已启用",
    disabled: "已停用",
    schedule: "计划",
    next: "下一次计划时间",
    action: "操作",
    confirm: "以你的系统权限执行此任务一次？输入 yes 开始：",
    declined: "未启动任务。",
    running: "正在运行。[q] 取消当前会话的工作并退出。",
    runningPrompt: "运行中：",
    busy: "任务正在运行。输入 q 可取消当前会话的工作并退出。",
    cancel: "取消当前会话的工作并退出？输入 yes 确认：",
    history: "历史",
    noHistory: "此任务还没有运行记录。",
    chooseRun: "输入运行编号，[b] 返回，[q] 退出：",
    run: "运行",
    status: "状态",
    exitCode: "退出码",
    started: "开始",
    finished: "结束",
    output: "输出",
    noOutput: "没有保留的输出。",
    truncated: "展示已截断。保留的历史输出也可能短于原始输出。",
    continue: "按 Enter 继续，[q] 退出：",
    more: "按 Enter 查看更多输出，[b] 返回，[q] 退出：",
    invalid: "请选择列出的选项。",
    error: "操作未能完成",
    retry: "可以刷新或再次选择该操作。",
    goodbye: "会话已关闭。",
    statuses: {
      running: "运行中",
      success: "成功",
      failed: "失败",
      cancelled: "已取消",
      interrupted: "已中断",
      skipped: "已跳过",
    },
  },
};

export type TuiLocale = keyof typeof messages;

export function terminalLocale(env: Record<string, string | undefined> = process.env): TuiLocale {
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || "en";
  return /^zh(?:[_\-.]|$)/i.test(locale) ? "zh" : "en";
}
