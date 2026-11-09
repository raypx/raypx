import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { AccountDetails } from "@raypx/account/client";
import { useAuthActions } from "@raypx/auth/hooks";
import { PasswordChangeDialog } from "@raypx/auth/client";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { apiUrl, authClient, webUrl } from "../auth/client.ts";
import { accountQuery } from "../auth/account-query.ts";
import { PermissionBoundary } from "../auth/components/permission-boundary.tsx";
import { SessionBoundary, SignInGate } from "../auth/components/session-boundary.tsx";
import { AccountSessions } from "../auth/components/account-sessions.tsx";
import { ProfileSettings } from "../auth/components/profile-settings.tsx";
import { InstanceRegistration } from "../auth/components/instance-registration.tsx";
import { analytics } from "../analytics/client.ts";
import { AccountSettingsContent, AccountSettingsPanel } from "./account-settings.tsx";
import type { SettingsSection } from "./navigation.ts";

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
  const accountId = session.isPending || session.error ? null : session.data?.user.id;
  const queries = useQueryClient();
  const router = useRouter();
  const c = useTranslations("common");
  async function reload() {
    await queries.invalidateQueries({ queryKey: ["account"] });
    await router.invalidate();
  }
  return (
    <AccountSettingsPanel
      key={accountId ?? "guest"}
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
          {(id) => (
            <PasswordChangeDialog
              key={id}
              client={authClient}
              onChanged={async () => {
                const result = await authClient.getSession({
                  fetchOptions: { signal: AbortSignal.timeout(10_000) },
                });
                if (result.error || !result.data) throw new Error("Session refresh failed");
                await reload();
              }}
            />
          )}
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
