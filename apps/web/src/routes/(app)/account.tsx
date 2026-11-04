import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard";
import { InstanceRegistration } from "../../features/auth/components/instance-registration";
import { SignInGate } from "../../features/auth/components/session-boundary";
import { LoadingState } from "@raypx/ui/loading-state";
import { AccountDetails } from "@raypx/account/client";
import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { useAuthActions } from "@raypx/auth/hooks";
import { PasswordChangeDialog } from "@raypx/auth/client";
import { authClient, webUrl } from "../../features/auth/client";
import { useQueryClient } from "@tanstack/react-query";
import { AccountSessions } from "../../features/auth/components/account-sessions";
import { ProfileSettings } from "../../features/auth/components/profile-settings";
import {
  AccountSettingsContent,
  AccountSettingsPanel,
} from "../../features/settings/account-settings";

export const Route = createFileRoute("/(app)/account")({
  beforeLoad: webPageGuard("/account"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "common.account", layout: "document" } },
  loader: ({ context }) => context.account,
  component: AccountPage,
});

function AccountPage() {
  const state = Route.useLoaderData();
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuthActions({ client: authClient, webUrl });
  const session = authClient.useSession();
  const [refreshing, setRefreshing] = useState(false);
  const busy = auth.busy || refreshing;
  async function reload() {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["account"] });
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  }
  if (
    state.status === "signed-out" ||
    (state.status === "signed-in" && !session.isPending && !session.error && !session.data)
  )
    return <SignInGate heading="h1" title={t("signedOut")} description={t("signedOutIntro")} />;
  if (
    state.status === "signed-in" &&
    !session.error &&
    (session.isPending || session.data?.user.id !== state.account.id)
  )
    return <LoadingState label={c("loading")} />;
  return (
    <section>
      {state.status === "unavailable" || session.error ? (
        <div className="flex flex-wrap items-center gap-4 py-9">
          <p role="alert">{c("networkError")}</p>
          <Button variant="outline" disabled={busy} onClick={() => void reload()}>
            {c("retry")}
          </Button>
        </div>
      ) : (
        <AccountSettingsPanel key={state.account.id}>
          <AccountSettingsContent value="account">
            <AccountDetails
              account={state.account}
              busy={busy}
              onSignOut={() =>
                auth.signOut(() => {
                  // Drop every account-scoped query before the guard re-reads the session.
                  queryClient.clear();
                  return router.invalidate();
                })
              }
            >
              <ProfileSettings
                key={`profile:${state.account.id}`}
                client={authClient}
                name={state.account.name}
                onSaved={reload}
              />
            </AccountDetails>
          </AccountSettingsContent>
          <AccountSettingsContent value="instances">
            <InstanceRegistration
              key={`instances:${state.account.id}`}
              accountId={state.account.id}
            />
          </AccountSettingsContent>
          <AccountSettingsContent
            value="password"
            className="rounded-xl border border-border bg-background p-5"
          >
            <PasswordChangeDialog
              key={`password:${state.account.id}`}
              client={authClient}
              onChanged={async () => {
                const result = await authClient.getSession({
                  fetchOptions: { signal: AbortSignal.timeout(10_000) },
                });
                if (result.error || !result.data) throw new Error("Session refresh failed");
                await reload();
              }}
            />
          </AccountSettingsContent>
          <AccountSettingsContent
            value="sessions"
            className="rounded-xl border border-border bg-background p-5"
          >
            {session.data?.session.id ? (
              <AccountSessions
                key={`sessions:${state.account.id}`}
                client={authClient}
                currentSessionId={session.data.session.id}
              />
            ) : (
              <section className="mt-8 border-t border-border pt-6" aria-label={t("sessionsTitle")}>
                <p role={session.isPending ? "status" : "alert"}>
                  {session.error
                    ? c("networkError")
                    : session.isPending
                      ? c("loading")
                      : t("sessionUnauthorized")}
                </p>
                {!session.isPending && (
                  <Button variant="outline" onClick={() => void session.refetch()}>
                    {c("retry")}
                  </Button>
                )}
                {!session.isPending && !session.error && (
                  <a href="/login" className="ml-3 underline">
                    {c("signIn")}
                  </a>
                )}
              </section>
            )}
          </AccountSettingsContent>
          {auth.error && (
            <p
              role="alert"
              className="mb-5 flex items-center gap-2 rounded-lg bg-destructive/8 px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
            >
              {c("networkError")}
            </p>
          )}
        </AccountSettingsPanel>
      )}
    </section>
  );
}
