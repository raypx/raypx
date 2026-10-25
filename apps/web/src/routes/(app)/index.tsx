import { AccountDetails } from "@raypx/account/client";
import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { useAuthActions } from "@raypx/auth/hooks";
import { authClient, webUrl } from "../../features/auth/client";
import { useQueryClient } from "@tanstack/react-query";
import { AccountSessions } from "../../features/auth/components/account-sessions";
import { ProfileSettings } from "../../features/auth/components/profile-settings";

export const Route = createFileRoute("/(app)/")({
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
  return (
    <section className="mx-auto max-w-[900px] px-14 pt-13 pb-20 max-[760px]:px-6 max-[760px]:pt-8.5 max-[760px]:pb-14 max-[420px]:px-5">
      <header className="mb-10">
        <h1>{t("accountTitle")}</h1>
        <p className="mt-[9px] max-w-[65ch] text-muted-foreground">{t("accountIntro")}</p>
      </header>
      {state.status === "unavailable" ? (
        <div className="flex flex-wrap items-center gap-4 py-9">
          <p role="alert">{c("networkError")}</p>
          <Button variant="outline" disabled={busy} onClick={() => void reload()}>
            {c("retry")}
          </Button>
        </div>
      ) : (
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
          {session.data?.session.id ? (
            <AccountSessions
              key={`sessions:${state.account.id}`}
              client={authClient}
              currentSessionId={session.data.session.id}
            />
          ) : (
            <section className="mt-9 border-t border-border pt-7" aria-label={t("sessionsTitle")}>
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
          {auth.error && (
            <p
              role="alert"
              className="mb-5 flex items-center gap-2 rounded-lg bg-destructive/8 px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
            >
              {c("networkError")}
            </p>
          )}
        </AccountDetails>
      )}
    </section>
  );
}
