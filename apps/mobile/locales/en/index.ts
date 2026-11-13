import common from "@raypx/i18n/messages/en";
import auth from "@raypx/auth/messages/en";
import agents from "@raypx/agents/messages/en";
import mobile from "./mobile.json";

export default { ...common, ...auth, ...agents, mobile } as const;
