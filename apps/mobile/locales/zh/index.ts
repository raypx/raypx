import common from "@raypx/i18n/messages/zh";
import auth from "@raypx/auth/messages/zh";
import agents from "@raypx/agents/messages/zh";
import mobile from "./mobile.json";

export default { ...common, ...auth, ...agents, mobile } as const;
