import type { Pages } from "@raypx/auth/client"
import { z } from "zod"

const authPagesSchema = z.object({
  SIGN_IN: z.string(),
  SIGN_UP: z.string(),
  VERIFY_MFA: z.string(),
  CALLBACK: z.string(),
  PASSWORD_RESET: z.string(),
  PASSWORD_UPDATE: z.string(),
  GOOGLE_ONE_TAP: z.boolean().optional(),
  FORGOT_PASSWORD: z.string(),
}) satisfies z.ZodType<Pages>

export const authPages = authPagesSchema.parse({
  SIGN_IN: "/signin",
  SIGN_UP: "/signup",
  VERIFY_MFA: "/verify",
  CALLBACK: "/callback",
  PASSWORD_RESET: "/password-reset",
  PASSWORD_UPDATE: "/update-password",
  FORGOT_PASSWORD: "/forgot-password",
})
