import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleCheck } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { useAuthActions, type AuthActionClient, type AuthActionSuccess } from "../hooks";

export type AuthMode = "login" | "signup" | "forgot-password" | "reset-password" | "verify-email";

export interface AuthFormLinkProps {
  to: "account" | "login" | "signup" | "forgot-password" | "verify-email";
  className: string;
  children: ReactNode;
}

export interface AuthFormProps {
  mode: AuthMode;
  backLabel?: string | undefined;
  client: AuthActionClient;
  webUrl: string;
  search: string;
  onSignedIn: AuthActionSuccess;
  callbackURLs?: { verify: string; reset: string } | undefined;
  LinkComponent: ComponentType<AuthFormLinkProps>;
}

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function AuthForm({
  mode,
  backLabel,
  client,
  webUrl,
  search,
  onSignedIn,
  callbackURLs,
  LinkComponent,
}: AuthFormProps) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const auth = useAuthActions({
    client,
    locale,
    webUrl,
    ...(callbackURLs ? { callbackURLs } : {}),
  });
  const { busy } = auth;
  const error = !auth.error
    ? ""
    : auth.error.kind !== "auth"
      ? c("networkError")
      : auth.error.key === "generic"
        ? c("error")
        : t(auth.error.key);
  const [message, setMessage] = useState("");
  const params = new URLSearchParams(search);
  const verified = params.get("verified") === "1";
  const title =
    mode === "signup"
      ? t("signup")
      : mode === "login"
        ? t("login")
        : mode === "verify-email"
          ? t("verify")
          : t("reset");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = formText(data, "email");
    const password = formText(data, "password");
    setMessage("");
    const result =
      mode === "signup"
        ? await auth.signUp({ name: formText(data, "name"), email, password })
        : mode === "login"
          ? await auth.signIn({ email, password }, onSignedIn)
          : mode === "forgot-password"
            ? await auth.requestPasswordReset({ email })
            : mode === "reset-password"
              ? await auth.resetPassword({
                  newPassword: password,
                  token: params.get("token") ?? "",
                })
              : await auth.sendVerificationEmail({ email });
    if (result.status !== "success") return;
    if (mode === "signup") setMessage(t("verifyIntro"));
    else if (mode !== "login")
      setMessage(
        t(
          mode === "forgot-password"
            ? "resetSent"
            : mode === "reset-password"
              ? "resetSaved"
              : "verifySent",
        ),
      );
  }
  return (
    <section className="w-full max-w-md px-6 py-10 lg:px-8">
      {/* Card container */}
      <div className="rounded-xl border border-border bg-card p-8 shadow-soft lg:p-10">
        <LinkComponent
          to="account"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          {backLabel ?? c("account")}
        </LinkComponent>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {mode === "login" || mode === "signup" ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
          ) : null}
          {mode === "forgot-password" && (
            <p className="text-sm leading-relaxed text-muted-foreground">{t("resetIntro")}</p>
          )}
          {mode === "verify-email" && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {verified ? t("verified") : t("verifyIntro")}
            </p>
          )}
        </div>
        {params.has("error") && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive [overflow-wrap:anywhere]"
          >
            {t("invalidLink")}
          </div>
        )}
        {message && (
          <div
            role="status"
            className="mt-6 flex items-start gap-2.5 rounded-lg border border-border bg-muted px-4 py-3 text-sm [overflow-wrap:anywhere]"
          >
            <CircleCheck size={18} className="mt-0.5 shrink-0 text-success" />
            {message}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive [overflow-wrap:anywhere]"
          >
            {error}
          </div>
        )}
        {!verified && (
          <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
            {mode === "signup" && (
              <label htmlFor="auth-name" className="flex flex-col gap-2 text-sm font-medium">
                {t("name")}
                <Input
                  id="auth-name"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={120}
                  disabled={busy}
                  className="h-11 transition-shadow focus-visible:ring-2"
                />
              </label>
            )}
            {mode !== "reset-password" && (
              <label htmlFor="auth-email" className="flex flex-col gap-2 text-sm font-medium">
                {t("email")}
                <Input
                  id="auth-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  defaultValue={params.get("email") ?? ""}
                  required
                  disabled={busy}
                  className="h-11 transition-shadow focus-visible:ring-2"
                />
              </label>
            )}
            {(mode === "login" || mode === "signup" || mode === "reset-password") && (
              <label htmlFor="auth-password" className="flex flex-col gap-2 text-sm font-medium">
                {t(mode === "reset-password" ? "newPassword" : "password")}
                <Input
                  id="auth-password"
                  type="password"
                  name="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={mode === "login" ? 1 : 8}
                  maxLength={128}
                  required
                  disabled={busy}
                  className="h-11 transition-shadow focus-visible:ring-2"
                />
              </label>
            )}
            {mode === "login" && (
              <LinkComponent
                to="forgot-password"
                className="-mt-2 self-end text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-current"
              >
                {t("forgot")}
              </LinkComponent>
            )}
            <Button
              type="submit"
              size="lg"
              className="mt-2 h-11 font-medium shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
              disabled={busy || (mode === "reset-password" && !params.get("token"))}
            >
              {busy
                ? c("working")
                : mode === "login"
                  ? c("signIn")
                  : mode === "signup"
                    ? t("create")
                    : mode === "forgot-password"
                      ? t("sendReset")
                      : mode === "reset-password"
                        ? t("reset")
                        : t("resend")}
              <ArrowRight size={16} />
            </Button>
          </form>
        )}
        {mode === "login" && (
          <LinkComponent
            to="verify-email"
            className="mt-6 inline-block text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-current"
          >
            {t("resend")}
          </LinkComponent>
        )}
        <div className="mt-6 text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              {t("noAccount")}{" "}
              <LinkComponent
                to="signup"
                className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-current"
              >
                {t("create")}
              </LinkComponent>
            </>
          ) : (
            <LinkComponent
              to="login"
              className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-current"
            >
              {c("signIn")}
            </LinkComponent>
          )}
        </div>
      </div>
    </section>
  );
}
