import { createEnv, redisEnv } from "@raypx/config";

export const envs = () => createEnv(redisEnv);

export const env = envs();
