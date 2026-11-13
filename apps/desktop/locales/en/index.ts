import i18n from "@raypx/i18n/messages/en";
import auth from "@raypx/auth/messages/en";
import account from "@raypx/account/messages/en";
import tasks from "@raypx/tasks/messages/en";
import agents from "@raypx/agents/messages/en";
import memory from "@raypx/memory/messages/en";
import jobs from "@raypx/jobs/messages/en";
import analytics from "@raypx/analytics/messages/en";
import blocks from "@raypx/blocks/messages/en";
import instances from "@raypx/instances/messages/en";
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
