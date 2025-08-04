import type { AuthConfig } from "@raypx/auth/client"
import { z } from "zod"

const authConfigSchema = z.object({
  signIn: z.string(),
  signUp: z.string(),
  verifyMfa: z.string(),
  callback: z.string(),
  passwordReset: z.string(),
  passwordUpdate: z.string(),
  googleOneTap: z.boolean().optional(),
}) satisfies z.ZodType<AuthConfig>

const authConfig = authConfigSchema.parse({
  signIn: "/signin",
  signUp: "/signup",
  verifyMfa: "/verify",
  callback: "/callback",
  passwordReset: "/password-reset",
  passwordUpdate: "/update-password",
})

export default authConfig
