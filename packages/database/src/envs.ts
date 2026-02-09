import { createEnv, databaseEnv } from "@raypx/config";

export const envs = () => createEnv(databaseEnv);

export const env = envs();
