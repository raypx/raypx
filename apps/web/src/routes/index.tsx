import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, CircleUserRound } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { useAuthActions } from "@raypx/auth/hooks";
import { authClient, loadAccount, webUrl } from "../features/auth/account";

export const Route = createFileRoute("/")({
  loader: () => loadAccount(),
  component: AccountPage,
});

function AccountPage() {
  const state = Route.useLoaderData();
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const router = useRouter();
  const auth = useAuthActions({ client: authClient, webUrl });
  const [refreshing, setRefreshing] = useState(false);
  const busy = auth.busy || refreshing;
  async function reload() {
    setRefreshing(true);
    try {
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <section className="page account-page">
      <header className="page-heading">
        <h1>{t("accountTitle")}</h1>
        <p>{t("accountIntro")}</p>
      </header>
      {state.status === "unavailable" ? (
        <div className="empty-panel">
          <p role="alert">{c("networkError")}</p>
          <Button variant="outline" disabled={busy} onClick={() => void reload()}>
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
            <p role="alert" className="notice error">
              {c("networkError")}
            </p>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void auth.signOut(() => router.invalidate())}
          >
            {busy ? c("working") : c("signOut")}
          </Button>
        </div>
      )}
    </section>
  );
}
