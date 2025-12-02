import { createEnv, storageEnv } from "@raypx/config";

export const envs = () => createEnv(storageEnv);

export const env = envs();
