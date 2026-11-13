import i18n from "@raypx/i18n/messages/zh";
import auth from "@raypx/auth/messages/zh";
import account from "@raypx/account/messages/zh";
import tasks from "@raypx/tasks/messages/zh";
import memory from "@raypx/memory/messages/zh";
import jobs from "@raypx/jobs/messages/zh";
import analytics from "@raypx/analytics/messages/zh";
import blocks from "@raypx/blocks/messages/zh";
import instances from "@raypx/instances/messages/zh";
import desktopLogin from "./desktopLogin.js";
import files from "./files.js";
import terminal from "./terminal.js";
import engine from "./engine.js";
import command from "./command.js";
import localWorkspace from "./localWorkspace.js";

export default {
  ...i18n,
  ...auth,
  ...account,
  ...tasks,
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
