import { createEnv, observabilityEnv } from "@raypx/config";

export const envs = () => createEnv(observabilityEnv);
