import i18n from "@raypx/i18n/messages/en";
import auth from "@raypx/auth/messages/en";
import account from "@raypx/account/messages/en";
import tasks from "@raypx/tasks/messages/en";
import memory from "@raypx/memory/messages/en";
import jobs from "@raypx/jobs/messages/en";
import analytics from "@raypx/analytics/messages/en";
import blocks from "@raypx/blocks/messages/en";
import instances from "@raypx/instances/messages/en";
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
  files,
  terminal,
  engine,
  command,
  localWorkspace,
} as const;
