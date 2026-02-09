import { createEnv, emailEnv } from "@raypx/config";

export const envs = () => createEnv(emailEnv);

export const env = envs();
