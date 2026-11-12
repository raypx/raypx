import { useTranslations } from "../../i18n.js";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { AccountDetails } from "@raypx/account/client";
import { useAuthActions } from "@raypx/auth/hooks";
import { PasswordChangeDialog, PasswordSetupEmail } from "@raypx/auth/client";

import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { apiUrl, authClient, webUrl } from "../auth/client.js";
import { accountQuery } from "../auth/account-query.js";
import { PermissionBoundary } from "../auth/components/permission-boundary.js";
import { SessionBoundary, SignInGate } from "../auth/components/session-boundary.js";
import { AccountSessions } from "../auth/components/account-sessions.js";
import { ProfileSettings } from "../auth/components/profile-settings.js";
import { InstanceRegistration } from "../auth/components/instance-registration.js";
import { analytics } from "../analytics/client.js";
import { AccountSettingsContent, AccountSettingsPanel } from "./account-settings.js";
import type { SettingsSection } from "./navigation.js";

function PrivateSettings({ children }: { children: (accountId: string) => ReactNode }) {
  const t = useTranslations("auth");
  return (
    <SessionBoundary
      guest={<SignInGate heading="h2" title={t("signedOut")} description={t("signedOutIntro")} />}
    >
      {(accountId) => (
        <PermissionBoundary key={accountId} accountId={accountId} permission="account.manage">
          {children(accountId)}
        </PermissionBoundary>
      )}
    </SessionBoundary>
  );
}

export default function AccountSettingsDialog({
  section,
  onSectionChange,
  onClose,
}: {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
}) {
  const session = authClient.useSession();
  const user = session.isPending || session.error ? null : session.data?.user;
  const queries = useQueryClient();
  const router = useRouter();
  const c = useTranslations("common");
  async function reload() {
    await queries.invalidateQueries({ queryKey: ["account"] });
    await router.invalidate();
  }
  return (
    <AccountSettingsPanel
      key={user?.id ?? "guest"}
      section={section}
      onSectionChange={onSectionChange}
      onClose={onClose}
    >
      <AccountSettingsContent value="account">
        <PrivateSettings>
          {(id) => <AccountProfile key={id} accountId={id} reload={reload} onClose={onClose} />}
        </PrivateSettings>
      </AccountSettingsContent>
      <AccountSettingsContent value="instances">
        <PrivateSettings>
          {(id) => <InstanceRegistration key={id} accountId={id} />}
        </PrivateSettings>
      </AccountSettingsContent>
      <AccountSettingsContent value="password" className="min-w-0">
        <PrivateSettings>
          {(id) =>
            user?.id === id && (
              <PasswordSettings key={id} accountId={id} email={user.email} reload={reload} />
            )
          }
        </PrivateSettings>
      </AccountSettingsContent>
      <AccountSettingsContent value="sessions" className="min-w-0">
        <PrivateSettings>
          {(id) =>
            session.data?.session.id ? (
              <AccountSessions
                key={id}
                client={authClient}
                currentSessionId={session.data.session.id}
              />
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p role="alert">{c("networkError")}</p>
                <Button variant="outline" onClick={() => void session.refetch()}>
                  {c("retry")}
                </Button>
              </div>
            )
          }
        </PrivateSettings>
      </AccountSettingsContent>
    </AccountSettingsPanel>
  );
}

function PasswordSettings({
  accountId,
  email,
  reload,
}: {
  accountId: string;
  email: string;
  reload: () => Promise<void>;
}) {
  const c = useTranslations("common");
  const t = useTranslations("auth");
  const query = useQuery({
    queryKey: ["linked-accounts", apiUrl, accountId],
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient.listAccounts({
        fetchOptions: { signal, cache: "no-store" },
      });
      if (error || !Array.isArray(data) || data.some((account) => account.userId !== accountId))
        throw new Error("Linked accounts unavailable");
      return data.some((account) => account.providerId === "credential");
    },
  });
  const recoveryLink = (
    <Link
      to="/forgot-password"
      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {t("forgot")}
    </Link>
  );
  if (query.isPending) return <LoadingState label={c("loading")} />;
  if (query.isError)
    return (
      <div className="flex flex-wrap items-center gap-4">
        <p role="alert">{c("networkError")}</p>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  if (!query.data) return <PasswordSetupEmail client={authClient} email={email} webUrl={webUrl} />;
  return (
    <PasswordChangeDialog
      client={authClient}
      recoveryLink={recoveryLink}
      onChanged={async () => {
        const result = await authClient.getSession({
          fetchOptions: { signal: AbortSignal.timeout(10_000) },
        });
        if (result.error || result.data?.user.id !== accountId)
          throw new Error("Session refresh failed");
        await reload();
      }}
    />
  );
}

function AccountProfile({
  accountId,
  reload,
  onClose,
}: {
  accountId: string;
  reload: () => Promise<void>;
  onClose: () => void;
}) {
  const query = useQuery({ ...accountQuery(), queryKey: ["account", apiUrl, accountId] });
  const auth = useAuthActions({ client: authClient, webUrl });
  const queries = useQueryClient();
  const router = useRouter();
  const c = useTranslations("common");
  const t = useTranslations("auth");
  if (query.isPending) return <LoadingState label={c("loading")} />;
  const state = query.data;
  if (state?.status === "signed-out")
    return <SignInGate heading="h2" title={t("signedOut")} description={t("signedOutIntro")} />;
  if (query.isError || state?.status !== "signed-in" || state.account.id !== accountId)
    return (
      <div className="flex flex-wrap items-center gap-4 py-9">
        <p role="alert">{c("networkError")}</p>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  return (
    <AccountDetails
      account={state.account}
      busy={auth.busy || query.isFetching}
      onSignOut={() =>
        auth.signOut(async () => {
          analytics.reset();
          queries.clear();
          await router.invalidate();
          onClose();
        })
      }
    >
      <ProfileSettings client={authClient} name={state.account.name} onSaved={reload} />
      {auth.error && (
        <p role="alert" className="mb-5 text-destructive">
          {c("networkError")}
        </p>
      )}
    </AccountDetails>
  );
}
