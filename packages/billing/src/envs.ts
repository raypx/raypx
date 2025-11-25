import { billingEnv, createEnv } from "@raypx/config";

export const envs = () => createEnv(billingEnv);
