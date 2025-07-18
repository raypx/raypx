import { z } from "zod"

const AuthSchema = z.object({
  signIn: z.string().min(1),
  signUp: z.string().min(1),
  verifyMfa: z.string().min(1),
  callback: z.string().min(1),
  passwordReset: z.string().min(1),
  passwordUpdate: z.string().min(1),
})

const authConfig = AuthSchema.parse({
  signIn: "/sign-in",
  signUp: "/sign-up",
  verifyMfa: "/verify",
  callback: "/callback",
  passwordReset: "/password-reset",
  passwordUpdate: "/update-password",
} satisfies z.infer<typeof AuthSchema>)

export default authConfig
