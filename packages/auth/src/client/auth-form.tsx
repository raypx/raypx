import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Mail, CircleCheck } from "lucide-react";
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
  client: AuthActionClient;
  webUrl: string;
  search: string;
  onSignedIn: AuthActionSuccess;
  LinkComponent: ComponentType<AuthFormLinkProps>;
}

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function AuthForm({
  mode,
  client,
  webUrl,
  search,
  onSignedIn,
  LinkComponent,
}: AuthFormProps) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const auth = useAuthActions({ client, locale, webUrl });
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
    <section className="mx-auto grid max-w-[1056px] grid-cols-[minmax(200px,1fr)_minmax(280px,1fr)] gap-18 px-14 pt-22 pb-20 max-[1100px]:gap-9 max-[760px]:block max-[760px]:px-6 max-[760px]:pt-8.5 max-[760px]:pb-14">
      <div className="pt-13.5 max-[760px]:hidden">
        <div className="mb-7 grid size-14 place-items-center rounded-[14px] border border-border">
          <Mail size={32} strokeWidth={1.5} />
        </div>
        <h1 className="max-w-[13ch] text-4xl leading-[1.15]">{t("title")}</h1>
        <p className="mt-4.5 max-w-[32ch] text-muted-foreground">{t("intro")}</p>
      </div>
      <div className="w-full max-w-90 max-[760px]:mx-auto">
        <LinkComponent
          to="account"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <ArrowLeft size={16} />
          {c("account")}
        </LinkComponent>
        <h2 className="mb-5 text-[23px]">{title}</h2>
        {mode === "forgot-password" && (
          <p className="-mt-2 mb-6 text-[13px] text-muted-foreground">{t("resetIntro")}</p>
        )}
        {mode === "verify-email" && (
          <p className="-mt-2 mb-6 text-[13px] text-muted-foreground">
            {verified ? t("verified") : t("verifyIntro")}
          </p>
        )}
        {params.has("error") && (
          <p
            role="alert"
            className="mb-5 flex items-center gap-2 rounded-lg bg-destructive/8 px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
          >
            {t("invalidLink")}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mb-5 flex items-center gap-2 rounded-lg bg-muted px-3.5 py-3 text-[13px] [overflow-wrap:anywhere]"
          >
            <CircleCheck size={18} />
            {message}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mb-5 flex items-center gap-2 rounded-lg bg-destructive/8 px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        )}
        {!verified && (
          <form onSubmit={submit} className="flex flex-col gap-4.75 [&>button]:mt-1">
            {mode === "signup" && (
              <label htmlFor="auth-name" className="flex flex-col gap-1.75 text-[13px] font-medium">
                {t("name")}
                <Input
                  id="auth-name"
                  className="min-h-[39px]"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={120}
                  disabled={busy}
                />
              </label>
            )}
            {mode !== "reset-password" && (
              <label
                htmlFor="auth-email"
                className="flex flex-col gap-1.75 text-[13px] font-medium"
              >
                {t("email")}
                <Input
                  id="auth-email"
                  className="min-h-[39px]"
                  type="email"
                  name="email"
                  autoComplete="email"
                  defaultValue={params.get("email") ?? ""}
                  required
                  disabled={busy}
                />
              </label>
            )}
            {(mode === "login" || mode === "signup" || mode === "reset-password") && (
              <label
                htmlFor="auth-password"
                className="flex flex-col gap-1.75 text-[13px] font-medium"
              >
                {t(mode === "reset-password" ? "newPassword" : "password")}
                <Input
                  id="auth-password"
                  className="min-h-[39px]"
                  type="password"
                  name="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={mode === "login" ? 1 : 8}
                  maxLength={128}
                  required
                  disabled={busy}
                />
              </label>
            )}
            {mode === "login" && (
              <LinkComponent
                to="forgot-password"
                className="-mt-2 self-end text-xs font-medium underline decoration-border underline-offset-4 hover:decoration-current"
              >
                {t("forgot")}
              </LinkComponent>
            )}
            <Button
              type="submit"
              size="lg"
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
            className="mt-4.5 inline-block text-xs font-medium underline decoration-border underline-offset-4 hover:decoration-current"
          >
            {t("resend")}
          </LinkComponent>
        )}
        <div className="mt-6.5 text-xs text-muted-foreground">
          {mode === "login" ? (
            <>
              {t("noAccount")}{" "}
              <LinkComponent
                to="signup"
                className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-current"
              >
                {t("create")}
              </LinkComponent>
            </>
          ) : (
            <LinkComponent
              to="login"
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-current"
            >
              {c("signIn")}
            </LinkComponent>
          )}
        </div>
      </div>
    </section>
  );
}
