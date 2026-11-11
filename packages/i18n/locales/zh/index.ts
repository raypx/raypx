import access from "./access.js";
import analytics from "./analytics.js";
import auth from "./auth.js";
import automations from "./automations.js";
import command from "./command.js";
import common from "./common.js";
import dash from "./dash.js";
import engine from "./engine.js";
import files from "./files.js";
import guest from "./guest.js";
import instances from "./instances.js";
import legal from "./legal.js";
import localWorkspace from "./localWorkspace.js";
import memory from "./memory.js";
import settings from "./settings.js";
import site from "./site.js";
import tasks from "./tasks.js";
import terminal from "./terminal.js";
import users from "./users.js";

export default {
  access,
  analytics,
  auth,
  automations,
  command,
  common,
  dash,
  engine,
  files,
  guest,
  instances,
  legal,
  localWorkspace,
  memory,
  settings,
  site,
  tasks,
  terminal,
  users,
} as const;
