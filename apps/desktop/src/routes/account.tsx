import { useEffect, useRef } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, CircleUserRound } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { useAuthActions } from "@raypx/auth/hooks";
import type { AccountProfile } from "@raypx/contracts/api";
import { apiClient, authClient, webUrl } from "../account";

type AccountState =
  | { status: "signed-in"; account: AccountProfile }
  | { status: "signed-out" }
  | { status: "unavailable" };

export const Route = createFileRoute("/account")({
  ssr: false,
  preload: false,
  loader: async ({ abortController }): Promise<AccountState> => {
    try {
      const account = await apiClient.account.get(
        {},
        { signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(5000)]) },
      );
      return { status: "signed-in", account };
    } catch (error) {
      return error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED"
        ? { status: "signed-out" }
        : { status: "unavailable" };
    }
  },
  pendingComponent: AccountPending,
  component: AccountPage,
});

function AccountSkeleton() {
  const c = useTranslations("common");
  return (
    <div className="account-loading" role="status" aria-label={c("loading")}>
      <span className="skeleton avatar-skeleton" />
      <span className="skeleton line-skeleton" />
      <span className="skeleton line-skeleton short" />
    </div>
  );
}

function AccountPending() {
  const t = useTranslations("auth");
  return (
    <section className="page account-page">
      <header className="page-heading">
        <h1>{t("accountTitle")}</h1>
        <p>{t("accountIntro")}</p>
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
    <section className="page account-page">
      <header className="page-heading">
        <h1>{t("accountTitle")}</h1>
        <p>{t("accountIntro")}</p>
      </header>
      {identityChanged ? (
        <AccountSkeleton />
      ) : state.status === "unavailable" ? (
        <div className="empty-panel">
          <p role="alert">{c("networkError")}</p>
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            {c("retry")}
          </Button>
        </div>
      ) : state.status === "signed-out" ? (
        <div className="account-empty">
          <CircleUserRound size={48} strokeWidth={1} />
          <h2>{t("signedOut")}</h2>
          <p>{t("signedOutIntro")}</p>
          <div className="inline-actions">
            <Link to="/login" className="button-link">
              {c("signIn")}
              <ArrowRight size={16} />
            </Link>
            <Link to="/signup" className="text-link">
              {t("create")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="account-details">
          <div className="account-identity">
            <span className="account-avatar">{state.account.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h2>{state.account.name}</h2>
              <p>{state.account.email}</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>{t("name")}</dt>
              <dd>{state.account.name}</dd>
            </div>
            <div>
              <dt>{t("email")}</dt>
              <dd>{state.account.email}</dd>
            </div>
            <div>
              <dt>{c("status")}</dt>
              <dd>
                <span className="status-label">
                  <CircleCheck size={16} />
                  {t("verifiedLabel")}
                </span>
              </dd>
            </div>
          </dl>
          {auth.error && (
            <div role="alert" className="notice error">
              {c("networkError")}{" "}
              <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
                {c("retry")}
              </Button>
            </div>
          )}
          <Button variant="outline" disabled={busy} onClick={() => void auth.signOut(refresh)}>
            {busy ? c("working") : c("signOut")}
          </Button>
        </div>
      )}
    </section>
  );
}
