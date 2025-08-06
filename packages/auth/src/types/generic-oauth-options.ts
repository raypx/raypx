import type { SocialProvider } from "../components/social-providers"
import type { AuthClient } from "./auth-client"

export type GenericOAuthOptions = {
  /**
   * Custom OAuth Providers
   * @default []
   */
  providers: SocialProvider[]
  /**
   * Custom generic OAuth sign in function
   */
  signIn?: (
    params: Parameters<AuthClient["signIn"]["oauth2"]>[0],
  ) => Promise<unknown>
}
