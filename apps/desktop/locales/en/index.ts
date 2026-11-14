import i18n from "@raypx/i18n/messages/en";
import auth from "@raypx/auth/messages/en";
import account from "@raypx/account/messages/en";
import pages from "@raypx/pages/messages/en";
import skills from "@raypx/skills/messages/en";
import agents from "@raypx/agents/messages/en";
import jobs from "@raypx/jobs/messages/en";
import memory from "@raypx/memory/messages/en";
import analytics from "@raypx/analytics/messages/en";
import blocks from "@raypx/blocks/messages/en";
import instances from "@raypx/instances/messages/en";
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
