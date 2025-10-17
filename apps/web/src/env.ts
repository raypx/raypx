import { envs as auth } from "@raypx/auth/envs";
import { envs as db } from "@raypx/db/envs";
import { envs as email } from "@raypx/email/envs";
import { createEnv } from "@raypx/shared";

const dbEnv = db();
const authEnv = auth();
const emailEnv = email();

export const env = createEnv({
  extends: [dbEnv, authEnv, emailEnv],
  runtimeEnv: {},
});
