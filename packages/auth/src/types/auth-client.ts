import {
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

export const authClient = createAuthClient({
  plugins: [
    apiKeyClient(),
    multiSessionClient(),
    passkeyClient(),
    oneTapClient({
      clientId: "",
    }),
    genericOAuthClient(),
    anonymousClient(),
    usernameClient(),
    magicLinkClient(),
    emailOTPClient(),
    twoFactorClient(),
    organizationClient(),
  ],
})

export type AuthClient = typeof authClient

export type Session = Get<AuthClient, "$Infer.Session.session">
export type User = Get<AuthClient, "$Infer.Session.user">
