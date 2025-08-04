import type { Session } from "@raypx/auth/client"
import { z } from "zod"

export const AuthConfigSchema = z.object({
  signIn: z.string(),
  signUp: z.string(),
  verifyMfa: z.string(),
  callback: z.string(),
  passwordReset: z.string(),
  passwordUpdate: z.string(),
  googleOneTap: z.boolean().optional(),
})

export type AuthConfig = z.infer<typeof AuthConfigSchema>

export interface AuthProviderProps {
  children: React.ReactNode
  config: AuthConfig
}

export interface AuthContextType {
  session: Session | null
  config: AuthConfig
}
