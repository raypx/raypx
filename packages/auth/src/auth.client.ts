import {
  adminClient,
  anonymousClient,
  apiKeyClient,
  emailOTPClient,
  genericOAuthClient,
  magicLinkClient,
  multiSessionClient,
  oneTapClient,
  organizationClient,
  passkeyClient,
  twoFactorClient,
  usernameClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import type { Get } from "type-fest"
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
  apiKeyClient(),
  organizationClient(),
  adminClient({
    ac,
    roles: {
      user: userRole,
      admin: adminRole,
      superadmin: superAdminRole,
    },
  }),
  emailOTPClient(),
  passkeyClient(),
  twoFactorClient(),
  multiSessionClient(),
  genericOAuthClient(),
  anonymousClient(),
  usernameClient(),
  magicLinkClient(),
  oneTapClient({
    clientId: env.NEXT_PUBLIC_AUTH_GOOGLE_ID ?? "",
  }),
]

// Create the client
export const authClient = createAuthClient({
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
} = authClient
// Export the types

export type AuthClient = typeof authClient

export type UseSession = ReturnType<typeof useSession>

export type Session = Get<AuthClient, "$Infer.Session.session">
export type User = Get<AuthClient, "$Infer.Session.user">

export { authClient as client }
