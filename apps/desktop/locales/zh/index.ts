import i18n from "@raypx/i18n/messages/zh";
import auth from "@raypx/auth/messages/zh";
import account from "@raypx/account/messages/zh";
import pages from "@raypx/pages/messages/zh";
import skills from "@raypx/skills/messages/zh";
import agents from "@raypx/agents/messages/zh";
import jobs from "@raypx/jobs/messages/zh";
import memory from "@raypx/memory/messages/zh";
import analytics from "@raypx/analytics/messages/zh";
import blocks from "@raypx/blocks/messages/zh";
import instances from "@raypx/instances/messages/zh";
import desktopLogin from "./desktopLogin.json" with { type: "json" };
import engine from "./engine.json" with { type: "json" };
import localWorkspace from "./localWorkspace.json" with { type: "json" };

export default {
  ...i18n,
  ...auth,
  ...account,
  ...agents,
  ...pages,
  ...skills,
  ...memory,
  ...jobs,
  ...analytics,
  ...blocks,
  ...instances,
  desktopLogin,
  engine,
  localWorkspace,
} as const;
