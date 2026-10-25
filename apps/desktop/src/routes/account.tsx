import { readAccount } from "@raypx/account";
import { useQueryClient } from "@tanstack/react-query";
import {
  AccountDetails,
  AccountSkeleton,
  SignedOutAccount,
  type AccountLinkProps,
} from "@raypx/account/client";
import { useEffect, useRef } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { useAuthActions } from "@raypx/auth/hooks";
import { authClient, webUrl } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { signOutDesktopHost } from "../features/tasks/host-session";

export const Route = createFileRoute("/account")({
  ssr: false,
  preload: false,
  loader: ({ abortController }) => readAccount(taskClient, { signal: abortController.signal }),
  pendingComponent: AccountPending,
  component: AccountPage,
});

function AccountPending() {
  const t = useTranslations("auth");
  return (
    <section className="mx-auto max-w-[900px] px-14 pt-13 pb-20 max-[1100px]:px-8 max-[1100px]:pt-9 max-[1100px]:pb-14">
      <header className="mb-10">
        <h1>{t("accountTitle")}</h1>
        <p className="mt-[9px] max-w-[65ch] text-muted-foreground">{t("accountIntro")}</p>
      </header>
      <AccountSkeleton />
    </section>
  );
}

function AccountPage() {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const state = Route.useLoaderData();
  const refreshing = Route.useMatch({ select: (match) => !!match.isFetching });
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const auth = useAuthActions({ client: authClient, webUrl });
  const busy = auth.busy || refreshing;
  const sessionId =
    session.isPending || session.error ? undefined : (session.data?.user.id ?? null);
  const observedSessionId = useRef<string | null | undefined>(undefined);
  // Better Auth owns focus/broadcast synchronization; route data owns the profile.
  useEffect(() => {
    if (sessionId === undefined || auth.busy) return;
    const previous = observedSessionId.current;
    observedSessionId.current = sessionId;
    if (previous === sessionId) return;
    if (state.status === "signed-in" && state.account.id === sessionId) return;
    if (state.status === "signed-out" && sessionId === null) return;
    if (previous === undefined && state.status === "unavailable") return;
    void router.invalidate({ filter: (match) => match.routeId === Route.id });
  }, [sessionId, auth.busy, state, router]);
  const identityChanged =
    !auth.busy &&
    sessionId !== undefined &&
    state.status === "signed-in" &&
    state.account.id !== sessionId;
  function refresh() {
    auth.clearError();
    return router.invalidate({ filter: (match) => match.routeId === Route.id });
  }
  return (
    <section className="mx-auto max-w-[900px] px-14 pt-13 pb-20 max-[1100px]:px-8 max-[1100px]:pt-9 max-[1100px]:pb-14">
      <header className="mb-10">
        <h1>{t("accountTitle")}</h1>
        <p className="mt-[9px] max-w-[65ch] text-muted-foreground">{t("accountIntro")}</p>
      </header>
      {identityChanged ? (
        <AccountSkeleton />
      ) : state.status === "unavailable" ? (
        <div className="flex flex-wrap items-center gap-4 py-9">
          <p role="alert">{c("networkError")}</p>
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            {c("retry")}
          </Button>
        </div>
      ) : state.status === "signed-out" ? (
        <SignedOutAccount LinkComponent={AccountLink} />
      ) : (
        <AccountDetails
          account={state.account}
          busy={busy}
          onSignOut={() =>
            auth.signOut(async () => {
              await signOutDesktopHost(state.account.id);
              queryClient.clear();
              return refresh();
            })
          }
        >
          {auth.error && (
            <div
              role="alert"
              className="mb-5 flex items-center gap-2 rounded-lg bg-[color-mix(in_oklch,var(--destructive)_8%,var(--background))] px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
            >
              {c("networkError")}{" "}
              <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
                {c("retry")}
              </Button>
            </div>
          )}
        </AccountDetails>
      )}
    </section>
  );
}

function AccountLink({ to, className, children }: AccountLinkProps) {
  return (
    <Link to={`/${to}`} className={className}>
      {children}
    </Link>
  );
}
