import common from "@raypx/i18n/messages/en";
import auth from "@raypx/auth/messages/en";
import agents from "@raypx/agents/messages/en";
import jobs from "@raypx/jobs/messages/en";
import memory from "@raypx/memory/messages/en";
import pages from "@raypx/pages/messages/en";
import skills from "@raypx/skills/messages/en";
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
