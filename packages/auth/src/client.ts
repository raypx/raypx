import {
  adminClient,
  apiKeyClient,
  emailOTPClient,
  magicLinkClient,
  multiSessionClient,
  oneTapClient,
  organizationClient,
  usernameClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { envs } from "./envs"
import {
  ac,
  admin as adminRole,
  superadmin as superAdminRole,
  user as userRole,
} from "./permissions"

// Environment variables
const env = envs()

const plugins = [
  organizationClient(),
  magicLinkClient(),
  apiKeyClient(),
  usernameClient(),
  adminClient({
    ac,
    roles: {
      user: userRole,
      admin: adminRole,
      superadmin: superAdminRole,
    },
  }),
  emailOTPClient(),
  multiSessionClient(),
  oneTapClient({
    clientId: env.NEXT_PUBLIC_AUTH_GOOGLE_ID ?? "",
  }),
]

// Create the client
export const client = createAuthClient({
  baseURL: env.NEXT_PUBLIC_AUTH_URL,
  plugins,
})

// Export the client
export const {
  signIn,
  signUp,
  useSession,
  signOut,
  forgetPassword,
  resetPassword,
  changePassword,
  listAccounts,
  unlinkAccount,
  linkSocial,
  admin,
  deleteUser,
  accountInfo,
  sendVerificationEmail,
  listSessions,
  revokeSession,
  updateUser,
  $store,
} = client

export * from "./client/socials"
// Export the types
export * from "./types"

export type UseSession = ReturnType<typeof useSession>

export type { Session, User } from "better-auth"

export * from "./components"
