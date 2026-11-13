import i18n from "@raypx/i18n/messages/en";
import auth from "@raypx/auth/messages/en";
import account from "@raypx/account/messages/en";
import agents from "@raypx/agents/messages/en";
import memory from "@raypx/memory/messages/en";
import analytics from "@raypx/analytics/messages/en";
import blocks from "@raypx/blocks/messages/en";
import instances from "@raypx/instances/messages/en";
import desktopAuthorization from "./desktopAuthorization.json" with { type: "json" };
import dash from "./dash.json" with { type: "json" };
import users from "./users.json" with { type: "json" };
import site from "./site.json" with { type: "json" };
import guest from "./guest.json" with { type: "json" };
import legal from "./legal.json" with { type: "json" };

export default {
  ...i18n,
  ...auth,
  ...account,
  ...agents,
  ...memory,
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
