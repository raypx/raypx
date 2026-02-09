import { analyticsEnv, createEnv } from "@raypx/config";

export const envs = () => createEnv(analyticsEnv);

export const env = envs();
