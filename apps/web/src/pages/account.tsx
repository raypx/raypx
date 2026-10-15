import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, CheckCircle, UserCircle } from "@phosphor-icons/react";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { authClient, type AccountState } from "../account";

export function AccountPage({ state }: { state: AccountState }) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function reload() {
    setBusy(true);
    try {
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) setFailed(true);
      else await router.invalidate();
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
      {state.status === "unavailable" ? (
        <div className="empty-panel">
          <p role="alert">{c("networkError")}</p>
          <Button variant="outline" disabled={busy} onClick={() => void reload()}>
            {c("retry")}
          </Button>
        </div>
      ) : state.status === "signed-out" ? (
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
                  <CheckCircle size={16} />
                  {t("verifiedLabel")}
                </span>
              </dd>
            </div>
          </dl>
          {failed && (
            <p role="alert" className="notice error">
              {c("networkError")}
            </p>
          )}
          <Button variant="outline" disabled={busy} onClick={() => void signOut()}>
            {busy ? c("working") : c("signOut")}
          </Button>
        </div>
      )}
    </section>
  );
}
