"use client"

import { toast } from "@raypx/ui/components/toast"
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { useAuthData } from "../hooks/use-auth-data"
import { type AuthViewPaths, authViewPaths } from "../shared/auth-view-paths"
import { getSearchParam } from "../shared/utils"
import type { AdditionalFields } from "../types/additional-fields"
import type { AnyAuthClient } from "../types/any-auth-client"
import type { AuthClient } from "../types/auth-client"
import type { AuthMutators } from "../types/auth-mutators"
import type { AvatarOptions } from "../types/avatar-options"
import type { CaptchaOptions } from "../types/captcha-options"
import type { CredentialsOptions } from "../types/credentials-options"
import type { DeleteUserOptions } from "../types/delete-user-options"
import type { GenericOAuthOptions } from "../types/generic-oauth-options"
import type { GravatarOptions } from "../types/gravatar-options"
import type { AuthHooks } from "../types/hooks"
import type {
  OrganizationOptions,
  OrganizationOptionsContext,
} from "../types/organization-options"
import type { SettingsOptions } from "../types/settings-options"
import type { SignUpOptions } from "../types/sign-up-options"
import type { SocialOptions } from "../types/social"
import { RecaptchaV3 } from "./captcha/recaptcha-v3"
import type { AuthConfig } from "./types"
import { AuthConfigSchema } from "./types"

const defaultNavigate = (href: string) => {
  window.location.href = href
}

const defaultReplace = (href: string) => {
  window.location.replace(href)
}

export interface AuthContextType {
  authClient: AuthClient
  /**
   * Additional fields for users
   */
  additionalFields?: AdditionalFields
  /**
   * API Key plugin configuration
   */
  apiKey?:
    | {
        /**
         * Prefix for API Keys
         */
        prefix?: string
        /**
         * Metadata for API Keys
         */
        metadata?: Record<string, unknown>
      }
    | boolean
  /**
   * Avatar configuration
   * @default undefined
   */
  avatar?: AvatarOptions
  /**
   * Base path for the auth views
   * @default "/auth"
   */
  basePath: string
  /**
   * Front end base URL for auth API callbacks
   */
  baseURL?: string
  /**
   * Captcha configuration
   */
  captcha?: CaptchaOptions
  credentials?: CredentialsOptions
  /**
   * Default redirect URL after authenticating
   * @default "/"
   */
  redirectTo: string
  /**
   * Enable or disable user change email support
   * @default true
   */
  changeEmail?: boolean
  /**
   * User Account deletion configuration
   * @default undefined
   */
  deleteUser?: DeleteUserOptions
  /**
   * Show Verify Email card for unverified emails
   */
  emailVerification?: boolean
  /**
   * Freshness age for Session data
   * @default 60 * 60 * 24
   */
  freshAge: number
  /**
   * Generic OAuth provider configuration
   */
  genericOAuth?: GenericOAuthOptions
  /**
   * Gravatar configuration
   */
  gravatar?: boolean | GravatarOptions
  hooks: AuthHooks
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
   * Enable or disable Multi Session support
   * @default false
   */
  multiSession?: boolean
  mutators: AuthMutators
  /**
   * Whether the name field should be required
   * @default true
   */
  nameRequired?: boolean
  /**
   * Enable or disable One Tap support
   * @default false
   */
  oneTap?: boolean
  /**
   * Perform some User updates optimistically
   * @default false
   */
  optimistic?: boolean
  organization?: OrganizationOptionsContext
  /**
   * Enable or disable Passkey support
   * @default false
   */
  passkey?: boolean
  /**
   * Forces better-auth-tanstack to refresh the Session on the auth callback page
   * @default false
   */
  persistClient?: boolean
  settings?: SettingsOptions
  /**
   * Sign Up configuration
   */
  signUp?: SignUpOptions
  /**
   * Social provider configuration
   */
  social?: SocialOptions
  /**
   * Enable or disable two-factor authentication support
   * @default undefined
   */
  twoFactor?: ("otp" | "totp")[]
  viewPaths: AuthViewPaths
  /**
   * Navigate to a new URL
   * @default window.location.href
   */
  navigate: typeof defaultNavigate
  /**
   * Called whenever the Session changes
   */
  onSessionChange?: () => void | Promise<void>
  /**
   * Replace the current URL
   * @default navigate
   */
  replace: typeof defaultReplace
}

export type AuthProviderProps = {
  children: ReactNode
  /**
   * Better Auth client returned from createAuthClient
   * @default Required
   * @remarks `AuthClient`
   */
  authClient: AnyAuthClient
  /**
   * Avatar configuration
   * @default undefined
   */
  avatar?: boolean | Partial<AvatarOptions>
  /**
   * User Account deletion configuration
   * @default undefined
   */
  deleteUser?: DeleteUserOptions | boolean
  /**
   * ADVANCED: Custom hooks for fetching auth data
   */
  hooks?: Partial<AuthHooks>
  /**
   * Settings configuration
   * @default { fields: ["image", "name"] }
   */
  settings?: boolean | Partial<SettingsOptions>
  /**
   * Customize the paths for the auth views
   * @default authViewPaths
   * @remarks `AuthViewPaths`
   */
  viewPaths?: Partial<AuthViewPaths>
  /**
   * ADVANCED: Custom mutators for updating auth data
   */
  mutators?: Partial<AuthMutators>
  /**
   * Organization plugin configuration
   */
  organization?: OrganizationOptions | boolean
  /**
   * Enable or disable Credentials support
   * @default `{ forgotPassword: true }`
   */
  credentials?: boolean | CredentialsOptions
  /**
   * Enable or disable Sign Up form
   * @default { fields: ["name"] }
   */
  signUp?: SignUpOptions | boolean
} & Partial<
  Omit<
    AuthContextType,
    | "authClient"
    | "viewPaths"
    | "localization"
    | "mutators"
    | "toast"
    | "hooks"
    | "avatar"
    | "settings"
    | "deleteUser"
    | "credentials"
    | "signUp"
    | "organization"
  >
>

export const AuthContext = createContext<AuthContextType>(
  {} as unknown as AuthContextType,
)

export type { AuthConfig }
export { AuthConfigSchema }

export const AuthProvider = ({
  children,
  authClient: authClientProp,
  avatar: avatarProp,
  settings: settingsProp,
  deleteUser: deleteUserProp,
  social: socialProp,
  genericOAuth: genericOAuthProp,
  basePath = "/auth",
  baseURL = "",
  captcha,
  redirectTo = "/",
  credentials: credentialsProp,
  changeEmail = true,
  freshAge = 60 * 60 * 24,
  hooks: hooksProp,
  mutators: mutatorsProp,
  nameRequired = true,
  organization: organizationProp,
  signUp: signUpProp = true,
  viewPaths: viewPathsProp,
  navigate,
  replace,
  ...props
}: AuthProviderProps) => {
  const authClient = authClientProp as AuthClient

  const avatar = useMemo<AvatarOptions | undefined>(() => {
    if (!avatarProp) return

    if (avatarProp === true) {
      return {
        extension: "png",
        size: 128,
      }
    }

    return {
      upload: avatarProp.upload,
      extension: avatarProp.extension || "png",
      size: avatarProp.size || (avatarProp.upload ? 256 : 128),
    }
  }, [avatarProp])

  const settings = useMemo<SettingsOptions | undefined>(() => {
    if (settingsProp === false) return

    if (settingsProp === true || settingsProp === undefined) {
      return {
        fields: ["image", "name"],
      }
    }

    // Remove trailing slash from basePath
    const basePath = settingsProp.basePath?.endsWith("/")
      ? settingsProp.basePath.slice(0, -1)
      : settingsProp.basePath

    return {
      url: settingsProp.url,
      basePath,
      fields: settingsProp.fields || ["image", "name"],
    }
  }, [settingsProp])

  const deleteUser = useMemo<DeleteUserOptions | undefined>(() => {
    if (!deleteUserProp) return

    if (deleteUserProp === true) {
      return {
        verification: undefined,
      }
    }

    return deleteUserProp
  }, [deleteUserProp])

  const social = useMemo<SocialOptions | undefined>(() => {
    if (!socialProp) return
    return socialProp
  }, [socialProp])

  const genericOAuth = useMemo<GenericOAuthOptions | undefined>(() => {
    if (!genericOAuthProp) return
    return genericOAuthProp
  }, [genericOAuthProp])

  const credentials = useMemo<CredentialsOptions | undefined>(() => {
    if (credentialsProp === false) return

    if (credentialsProp === true) {
      return {
        confirmPassword: undefined,
        forgotPassword: true,
        passwordValidation: undefined,
        rememberMe: undefined,
        username: undefined,
      }
    }

    return {
      confirmPassword: credentialsProp?.confirmPassword,
      forgotPassword: credentialsProp?.forgotPassword ?? true,
      passwordValidation: credentialsProp?.passwordValidation,
      rememberMe: credentialsProp?.rememberMe,
      username: credentialsProp?.username,
    }
  }, [credentialsProp])

  const signUp = useMemo<SignUpOptions | undefined>(() => {
    if (signUpProp === false) return

    if (signUpProp === true || signUpProp === undefined) {
      return {
        fields: ["name"],
      }
    }

    return {
      fields: signUpProp.fields || ["name"],
    }
  }, [signUpProp])

  const organization = useMemo<OrganizationOptionsContext | undefined>(() => {
    if (!organizationProp) return

    if (organizationProp === true) {
      return {
        customRoles: [],
      }
    }

    let logo: OrganizationOptionsContext["logo"] | undefined

    if (organizationProp.logo === true) {
      logo = {
        extension: "png",
        size: 128,
      }
    } else if (organizationProp.logo) {
      logo = {
        upload: organizationProp.logo.upload,
        extension: organizationProp.logo.extension || "png",
        size:
          organizationProp.logo.size || organizationProp.logo.upload
            ? 256
            : 128,
      }
    }

    return {
      ...organizationProp,
      logo,
      customRoles: organizationProp.customRoles || [],
    }
  }, [organizationProp])

  const defaultMutators = useMemo(() => {
    return {
      deleteApiKey: (params) =>
        authClient.apiKey.delete({
          ...params,
          fetchOptions: { throw: true },
        }),
      deletePasskey: (params) =>
        authClient.passkey.deletePasskey({
          ...params,
          fetchOptions: { throw: true },
        }),
      revokeDeviceSession: (params) =>
        authClient.multiSession.revoke({
          ...params,
          fetchOptions: { throw: true },
        }),
      revokeSession: (params) =>
        authClient.revokeSession({
          ...params,
          fetchOptions: { throw: true },
        }),
      setActiveSession: (params) =>
        authClient.multiSession.setActive({
          ...params,
          fetchOptions: { throw: true },
        }),
      updateUser: (params) =>
        authClient.updateUser({
          ...params,
          fetchOptions: { throw: true },
        }),
      unlinkAccount: (params) =>
        authClient.unlinkAccount({
          ...params,
          fetchOptions: { throw: true },
        }),
    } as AuthMutators
  }, [authClient])

  const defaultHooks = useMemo(() => {
    const hooks = {
      useSession: authClient.useSession,
      useListAccounts: () =>
        useAuthData({
          queryFn: authClient.listAccounts,
          cacheKey: "listAccounts",
        }),
      useListDeviceSessions: () =>
        useAuthData({
          queryFn: authClient.multiSession.listDeviceSessions,
          cacheKey: "listDeviceSessions",
        }),
      useListSessions: () =>
        useAuthData({
          queryFn: authClient.listSessions,
          cacheKey: "listSessions",
        }),
      useListPasskeys: authClient.useListPasskeys,
      useListApiKeys: () =>
        useAuthData({
          queryFn: authClient.apiKey.list,
          cacheKey: "listApiKeys",
        }),
      useActiveOrganization: authClient.useActiveOrganization,
      useListOrganizations: authClient.useListOrganizations,
      useHasPermission: (params) =>
        useAuthData({
          queryFn: () => authClient.organization.hasPermission(params),
          cacheKey: `hasPermission:${JSON.stringify(params)}`,
        }),
      useInvitation: (params) =>
        useAuthData({
          queryFn: () => authClient.organization.getInvitation(params),
          cacheKey: `invitation:${JSON.stringify(params)}`,
        }),
    } as AuthHooks
    return hooks
  }, [authClient])

  const viewPaths = useMemo(() => {
    return { ...authViewPaths, ...viewPathsProp } as AuthViewPaths
  }, [viewPathsProp])

  const hooks = useMemo(() => {
    return { ...defaultHooks, ...hooksProp } as AuthHooks
  }, [defaultHooks, hooksProp])

  const mutators = useMemo(() => {
    return { ...defaultMutators, ...mutatorsProp } as AuthMutators
  }, [defaultMutators, mutatorsProp])

  // Remove trailing slash from baseURL
  baseURL = baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL

  // Remove trailing slash from basePath
  basePath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath

  const { data: sessionData } = hooks.useSession()

  const errorShown = useRef(false)
  useEffect(() => {
    if (errorShown.current) return

    const error = getSearchParam("error")
    if (error) {
      errorShown.current = true
      console.log({ error })
      toast.error(error)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        authClient,
        avatar,
        basePath: basePath === "/" ? "" : basePath,
        baseURL,
        captcha,
        redirectTo,
        changeEmail,
        credentials,
        deleteUser,
        freshAge,
        genericOAuth,
        hooks,
        mutators,
        nameRequired,
        organization,
        settings,
        signUp,
        social,
        navigate: navigate || defaultNavigate,
        replace: replace || navigate || defaultReplace,
        viewPaths,
        ...props,
      }}
    >
      {sessionData &&
        organization &&
        (hooks.useActiveOrganization === authClient.useActiveOrganization ||
          hooks.useListOrganizations === authClient.useListOrganizations) && (
          <OrganizationRefetcher />
        )}
      {captcha?.provider === "google-recaptcha-v3" ? (
        <RecaptchaV3>{children}</RecaptchaV3>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}

const OrganizationRefetcher = () => {
  const { hooks } = useContext(AuthContext)
  const { data: sessionData } = hooks.useSession()
  const { data: activeOrganization, refetch: refetchActiveOrganization } =
    hooks.useActiveOrganization()
  const { data: organizations, refetch: refetchListOrganizations } =
    hooks.useListOrganizations()

  useEffect(() => {
    if (!sessionData?.user.id) return
    if (activeOrganization) refetchActiveOrganization?.()
    if (organizations) refetchListOrganizations?.()
  }, [
    sessionData?.user.id,
    refetchActiveOrganization,
    refetchListOrganizations,
  ])

  return null
}
