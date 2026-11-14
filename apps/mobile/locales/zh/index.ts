import common from "@raypx/i18n/messages/zh";
import auth from "@raypx/auth/messages/zh";
import agents from "@raypx/agents/messages/zh";
import jobs from "@raypx/jobs/messages/zh";
import memory from "@raypx/memory/messages/zh";
import pages from "@raypx/pages/messages/zh";
import skills from "@raypx/skills/messages/zh";
import mobile from "./mobile.json";

import mobilecapabilities from "./mobile-capabilities.json";

import mobileresources from "./mobile-resources.json";

export default {
  ...common,
  ...auth,
  ...agents,
  ...jobs,
  ...memory,
  ...pages,
  ...skills,
  mobile,
  "mobile-capabilities": mobilecapabilities,
  "mobile-resources": mobileresources,
} as const;
