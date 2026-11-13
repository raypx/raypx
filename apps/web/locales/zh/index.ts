import i18n from "@raypx/i18n/messages/zh";
import auth from "@raypx/auth/messages/zh";
import account from "@raypx/account/messages/zh";
import agents from "@raypx/agents/messages/zh";
import memory from "@raypx/memory/messages/zh";
import analytics from "@raypx/analytics/messages/zh";
import blocks from "@raypx/blocks/messages/zh";
import instances from "@raypx/instances/messages/zh";
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
