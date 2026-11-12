import i18n from "@raypx/i18n/messages/zh";
import auth from "@raypx/auth/messages/zh";
import account from "@raypx/account/messages/zh";
import tasks from "@raypx/tasks/messages/zh";
import memory from "@raypx/memory/messages/zh";
import jobs from "@raypx/jobs/messages/zh";
import analytics from "@raypx/analytics/messages/zh";
import blocks from "@raypx/blocks/messages/zh";
import instances from "@raypx/instances/messages/zh";
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
  dash,
  users,
  site,
  guest,
  legal,
} as const;
