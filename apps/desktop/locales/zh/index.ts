import i18n from "@raypx/i18n/messages/zh";
import auth from "@raypx/auth/messages/zh";
import account from "@raypx/account/messages/zh";
import tasks from "@raypx/tasks/messages/zh";
import agents from "@raypx/agents/messages/zh";
import memory from "@raypx/memory/messages/zh";
import jobs from "@raypx/jobs/messages/zh";
import analytics from "@raypx/analytics/messages/zh";
import blocks from "@raypx/blocks/messages/zh";
import instances from "@raypx/instances/messages/zh";
import desktopLogin from "./desktopLogin.json" with { type: "json" };
import files from "./files.json" with { type: "json" };
import terminal from "./terminal.json" with { type: "json" };
import engine from "./engine.json" with { type: "json" };
import command from "./command.json" with { type: "json" };
import localWorkspace from "./localWorkspace.json" with { type: "json" };

export default {
  ...i18n,
  ...auth,
  ...account,
  ...tasks,
  ...agents,
  ...memory,
  ...jobs,
  ...analytics,
  ...blocks,
  ...instances,
  desktopLogin,
  files,
  terminal,
  engine,
  command,
  localWorkspace,
} as const;
