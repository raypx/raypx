import { useMemo } from "react";
import { auth } from "../auth";
import { AuthContext, type CredentialsOptions } from "../context";
import type { AuthHooks } from "../context/hooks";
import { useAuthData } from "../hooks/use-auth-data";

export type AuthProviderProps = {
  children: React.ReactNode;
  redirectTo: string;
  navigate: (href: string) => void;
  onSessionChange?: () => void | Promise<void>;
  replace: (href: string) => void;
  credentials?: boolean | CredentialsOptions;
};

const defaultNavigate = (href: string) => {
  window.location.href = href;
};

const defaultReplace = (href: string) => {
  window.location.replace(href);
};

export const AuthProvider = ({
  children,
  redirectTo = "/",
  navigate,
  onSessionChange,
  replace: _replace,
  credentials: credentialsProp,
}: AuthProviderProps) => {
  const credentials = useMemo<CredentialsOptions | undefined>(() => {
    if (credentialsProp === false) return;
    if (credentialsProp === true) return { forgotPassword: true };

    return {
      ...credentialsProp,
      forgotPassword: credentialsProp?.forgotPassword ?? true,
    };
  }, [credentialsProp]);

  const defaultHooks = useMemo(() => {
    return {
      useSession: auth.useSession,
      useListAccounts: () =>
        useAuthData({
          queryFn: auth.listAccounts,
          cacheKey: "listAccounts",
        }),
      useAccountInfo: (params) =>
        useAuthData({
          queryFn: () => auth.accountInfo(params),
          cacheKey: `accountInfo:${JSON.stringify(params)}`,
        }),
      useListDeviceSessions: () =>
        useAuthData({
          queryFn: auth.multiSession.listDeviceSessions,
          cacheKey: "listDeviceSessions",
        }),
      useListSessions: () =>
        useAuthData({
          queryFn: auth.listSessions,
          cacheKey: "listSessions",
        }),
      // useListPasskeys: auth.useListPasskeys, // Not available in better-auth 1.4.1
      useListApiKeys: () =>
        useAuthData({
          queryFn: auth.apiKey.list,
          cacheKey: "listApiKeys",
        }),
      useActiveOrganization: auth.useActiveOrganization,
      useListOrganizations: auth.useListOrganizations,
      // useHasPermission: (params) =>
      //   useAuthData({
      //     queryFn: () =>
      //       auth.$fetch("/organization/has-permission", {
      //         method: "POST",
      //         body: params,
      //       }),
      //     cacheKey: `hasPermission:${JSON.stringify(params)}`,
      //   }),
      // useInvitation: (params) =>
      //   useAuthData({
      //     queryFn: () => auth.organization.getInvitation(params),
      //     cacheKey: `invitation:${JSON.stringify(params)}`,
      //   }),
      // useListInvitations: (params) =>
      //   useAuthData({
      //     queryFn: () =>
      //       auth.$fetch(
      //         `/organization/list-invitations?organizationId=${params?.query?.organizationId || ""}`,
      //       ),
      //     cacheKey: `listInvitations:${JSON.stringify(params)}`,
      //   }),
      // useListUserInvitations: () =>
      //   useAuthData({
      //     queryFn: () => auth.$fetch("/organization/list-user-invitations"),
      //     cacheKey: `listUserInvitations`,
      //   }),
      // useListMembers: (params) =>
      //   useAuthData({
      //     queryFn: () =>
      //       auth.$fetch(
      //         `/organization/list-members?organizationId=${params?.query?.organizationId || ""}`,
      //       ),
      //     cacheKey: `listMembers:${JSON.stringify(params)}`,
      //   }),
    } as AuthHooks;
  }, [auth]);

  const hooks = useMemo(() => {
    return defaultHooks;
  }, [defaultHooks]);
  return (
    <AuthContext.Provider
      value={{
        auth,
        hooks,
        redirectTo,
        navigate: navigate || defaultNavigate,
        onSessionChange,
        replace: defaultReplace,
        credentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
