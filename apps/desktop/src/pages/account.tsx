import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle, UserCircle } from "@phosphor-icons/react";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { apiClient, authClient } from "../account";

export function AccountPage() {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const session = authClient.useSession();
  const [account, setAccount] = useState<{ id: string; name: string; email: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const userId = session.data?.user.id;
  useEffect(() => {
    let active = true;
    setAccount(null);
    setFailed(false);
    if (userId)
      void apiClient.account
        .get({})
        .then((value) => {
          if (active) setAccount(value);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    return () => {
      active = false;
    };
  }, [userId, attempt]);
  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page account-page">
      <header className="page-heading">
        <h1>{t("accountTitle")}</h1>
        <p>{t("accountIntro")}</p>
      </header>
      {session.isPending ? (
        <div className="account-loading" role="status" aria-label={c("loading")}>
          <span className="skeleton avatar-skeleton" />
          <span className="skeleton line-skeleton" />
          <span className="skeleton line-skeleton short" />
        </div>
      ) : session.error ? (
        <div className="empty-panel">
          <p role="alert">{c("networkError")}</p>
          <Button variant="outline" onClick={() => void session.refetch()}>
            {c("retry")}
          </Button>
        </div>
      ) : !session.data ? (
        <div className="account-empty">
          <UserCircle size={48} weight="thin" />
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
            <span className="account-avatar">
              {(account?.name ?? session.data.user.name).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2>{account?.name ?? session.data.user.name}</h2>
              <p>{account?.email ?? session.data.user.email}</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>{t("name")}</dt>
              <dd>{account?.name ?? session.data.user.name}</dd>
            </div>
            <div>
              <dt>{t("email")}</dt>
              <dd>{account?.email ?? session.data.user.email}</dd>
            </div>
            <div>
              <dt>{c("status")}</dt>
              <dd>
                <span className="status-label">
                  <CheckCircle size={16} />
                  {t("verifiedLabel")}
                </span>
              </dd>
            </div>
          </dl>
          {failed && (
            <div role="alert" className="notice error">
              {c("networkError")}{" "}
              <Button variant="ghost" onClick={() => setAttempt((value) => value + 1)}>
                {c("retry")}
              </Button>
            </div>
          )}
          <Button variant="outline" disabled={busy} onClick={() => void signOut()}>
            {busy ? c("working") : c("signOut")}
          </Button>
        </div>
      )}
    </section>
  );
}
