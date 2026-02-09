import { authEnv, createEnv } from "@raypx/config";

export const envs = () => createEnv(authEnv);

export const env = envs();
