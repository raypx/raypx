import { emailEnv } from "@raypx/env";

export const env = {
  RESEND_FROM: emailEnv.server.RESEND_FROM,
  AUTH_RESEND_KEY: emailEnv.server.AUTH_RESEND_KEY,
};
