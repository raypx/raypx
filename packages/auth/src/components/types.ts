import type { Session, User } from "@raypx/auth/client"
import { z } from "zod"
import type { SocialOptions } from "../types/social"

export const AuthConfigSchema = z.object({
  signIn: z.string(),
  signUp: z.string(),
  verifyMfa: z.string(),
  callback: z.string(),
  passwordReset: z.string(),
  passwordUpdate: z.string(),
  forgotPassword: z.string(),
  googleOneTap: z.boolean().optional(),
})

export type AuthConfig = z.infer<typeof AuthConfigSchema>

export interface AuthProviderProps {
  children: React.ReactNode
  config: AuthConfig
  social?: SocialOptions
  twoFactor?: ("otp" | "totp")[]
  /**
   * Enable or disable Magic Link support
   * @default false
   */
  magicLink?: boolean
  /**
   * Enable or disable Email OTP support
   * @default false
   */
  emailOTP?: boolean
  /**
   * Enable or disable One Tap support
   * @default false
   */
  oneTap?: boolean
  /**
   * Called whenever the Session changes
   */
  onSessionChange?: () => void | Promise<void>
  /**
   * Enable or disable Passkey support
   * @default false
   */
  passkey?: boolean
}

export interface AuthContextType {
  session?: Session
  user?: User
  config: AuthConfig
}
