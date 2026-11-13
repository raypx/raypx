import i18n from "@raypx/i18n/messages/en";
import auth from "@raypx/auth/messages/en";
import account from "@raypx/account/messages/en";
import tasks from "@raypx/tasks/messages/en";
import memory from "@raypx/memory/messages/en";
import jobs from "@raypx/jobs/messages/en";
import analytics from "@raypx/analytics/messages/en";
import blocks from "@raypx/blocks/messages/en";
import instances from "@raypx/instances/messages/en";
import desktopAuthorization from "./desktopAuthorization.js";
import dash from "./dash.js";
import users from "./users.js";
import site from "./site.js";
import guest from "./guest.js";
import legal from "./legal.js";

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
  desktopAuthorization,
  dash,
  users,
  site,
  guest,
  legal,
} as const;
