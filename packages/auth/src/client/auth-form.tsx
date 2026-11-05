import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import type { IconComponent } from "@raypx/icons";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { GithubIcon } from "@raypx/icons/github";
import { GoogleIcon } from "@raypx/icons/google";
import { LockIcon } from "@raypx/icons/lock";
import { LoginIcon } from "@raypx/icons/login";
import { MailIcon } from "@raypx/icons/mail";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Separator } from "@raypx/ui/components/ui/separator";
import { Input } from "@raypx/ui/components/ui/input";
import { cn } from "@raypx/ui/lib/utils";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { useAuthActions, type AuthActionClient, type AuthActionSuccess } from "../hooks.ts";
import type { SocialProvider } from "../types.ts";
import { authPolicy } from "../policy.ts";
import { readAuthLink, type AuthMode } from "./auth-link.ts";
import { formText } from "./form-text.ts";
import { PasswordField } from "./password-field.tsx";
import { useMailCooldown } from "./use-mail-cooldown.ts";
import { useAuthErrorMessage } from "./use-auth-error-message.ts";

export type { AuthMode } from "./auth-link.ts";

interface ModeConfig {
  icon: IconComponent;
  title: "login" | "signup" | "reset" | "verify";
  intro: "intro" | "signupIntro" | "resetIntro" | "verifyIntro" | null;
  /** Submit label; `null` reuses the common sign-in action. */
  submit: "create" | "sendReset" | "reset" | "resend" | null;
  success: "verifyIntro" | "resetSent" | "resetSaved" | "verifySent" | null;
  name?: true;
  email?: true;
  password?: { purpose: "current" | "new"; label: "password" | "newPassword" };
  /** Success clears and replaces the form instead of allowing another request. */
  completes?: true;
  /** Each request sends an email and starts the resend cooldown. */
  mail?: true;
}

const modes: Record<AuthMode, ModeConfig> = {
  login: {
    icon: LoginIcon,
    title: "login",
    intro: "intro",
    submit: null,
    success: null,
    email: true,
    password: { purpose: "current", label: "password" },
    completes: true,
  },
  signup: {
    icon: UserCircleIcon,
    title: "signup",
    intro: "signupIntro",
    submit: "create",
    success: "verifyIntro",
    name: true,
    email: true,
    password: { purpose: "new", label: "password" },
  },
  "forgot-password": {
    icon: LockIcon,
    title: "reset",
    intro: "resetIntro",
    submit: "sendReset",
    success: "resetSent",
    email: true,
    mail: true,
  },
  "reset-password": {
    icon: LockIcon,
    title: "reset",
    intro: null,
    submit: "reset",
    success: "resetSaved",
    password: { purpose: "new", label: "newPassword" },
    completes: true,
  },
  "verify-email": {
    icon: MailIcon,
    title: "verify",
    intro: "verifyIntro",
    submit: "resend",
    success: "verifySent",
    email: true,
    mail: true,
  },
};

const linkClassName =
  "rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface AuthFormLinkProps {
  to: "account" | "login" | "signup" | "forgot-password" | "verify-email";
  className: string;
  children: ReactNode;
}

export interface AuthFormProps {
  mode: AuthMode;
  compact?: boolean;
  headingLeading?: ReactNode;
  completeOnMount?: boolean;
  socialLogin?:
    | { providers: readonly SocialProvider[]; callbackURL: string; errorCallbackURL: string }
    | undefined;
  backLabel?: string | null | undefined;
  client: AuthActionClient;
  webUrl: string;
  search: string;
  onSignedIn: AuthActionSuccess;
  callbackURLs?: { verify: string; reset: string } | undefined;
  LinkComponent: ComponentType<AuthFormLinkProps>;
}

export function AuthForm({
  mode,
  compact = false,
  headingLeading,
  completeOnMount = false,
  socialLogin,
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
  const error = useAuthErrorMessage(auth.error, "signInCompletionFailed");
  const [succeeded, setSucceeded] = useState(false);
  const cooldown = useMailCooldown();
  const config = modes[mode];
  const socialCompleted = useRef(false);
  const completeSocialSignIn = auth.completeSocialSignIn;
  useEffect(() => {
    if (
      (!completeOnMount &&
        (!socialLogin ||
          mode !== "login" ||
          new URLSearchParams(search).get("oauth") !== "success")) ||
      socialCompleted.current
    )
      return;
    socialCompleted.current = true;
    setSucceeded(true);
    void completeSocialSignIn(onSignedIn);
  }, [mode, search, onSignedIn, completeSocialSignIn, socialLogin, completeOnMount]);
  const signedIn = succeeded && (mode === "login" || completeOnMount);
  const complete = succeeded && (config.completes === true || completeOnMount);
  const messageKey = succeeded ? config.success : null;
  const link = readAuthLink(mode, search, auth.error);
  const showForm = !link.verified && !link.invalidReset && !complete;
  const intro = link.verified ? "verified" : config.intro;
  const coolingDown = config.mail === true && cooldown.remaining > 0;
  const submitLabel = busy
    ? c("working")
    : coolingDown
      ? t("resendIn", { seconds: String(cooldown.remaining) })
      : config.submit
        ? t(config.submit)
        : c("signIn");
  const ModeIcon = config.icon;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!showForm || busy || (config.mail && cooldown.isActive())) return;
    const form = event.currentTarget;
    setSucceeded(false);
    const result = await requestMode(auth, mode, new FormData(form), link.token, async () => {
      if (config.completes) form.reset();
      setSucceeded(true);
      if (mode === "login") await onSignedIn();
    });
    if (!config.mail) return;
    if (result.status === "success") cooldown.start();
    else if (
      result.status === "error" &&
      result.error.kind === "auth" &&
      result.error.key === "rateLimited"
    )
      cooldown.start(result.error.retryAfterSeconds);
  }

  return (
    <section
      aria-labelledby="auth-title"
      className={cn("mx-auto w-full max-w-sm px-6 sm:px-0", compact ? "py-6" : "py-10 sm:py-12")}
    >
      {backLabel !== null && (
        <LinkComponent
          to="account"
          className="group mb-8 inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftIcon
            size={16}
            aria-hidden="true"
            className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-x-0.5"
          />
          {backLabel ?? c("account")}
        </LinkComponent>
      )}
      <header className={cn("flex flex-col", compact ? "mb-6 gap-2" : "mb-8 gap-3")}>
        {headingLeading ??
          (!compact && (
            <span
              aria-hidden="true"
              className="mb-1 grid size-12 place-items-center rounded-2xl border border-border bg-card text-foreground shadow-sm"
            >
              <ModeIcon className="size-5" />
            </span>
          ))}
        <h1
          id="auth-title"
          className={cn("font-semibold tracking-tight", compact ? "text-2xl" : "text-3xl")}
        >
          {t(config.title)}
        </h1>
        {intro && <p className="text-sm leading-relaxed text-muted-foreground">{t(intro)}</p>}
      </header>
      <div className={cn("flex flex-col", compact ? "gap-4" : "gap-5")}>
        <AuthFormNotices
          invalidLink={link.failed || link.invalidReset}
          success={messageKey}
          error={link.invalidReset ? "" : error}
          socialError={(mode === "login" || mode === "signup") && link.failed}
        />
        {signedIn && (auth.error?.kind === "completion" || busy) && (
          <Button disabled={busy} onClick={() => void auth.retryCompletion()}>
            {c(busy ? "working" : "retry")}
          </Button>
        )}
        {link.invalidReset && (
          <LinkComponent to="forgot-password" className={linkClassName}>
            {t("sendReset")}
          </LinkComponent>
        )}
        {showForm &&
          (mode === "login" || mode === "signup") &&
          socialLogin &&
          socialLogin.providers.length > 0 && (
            <div className="flex flex-col gap-3">
              {socialLogin.providers.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={busy}
                  onClick={() =>
                    void auth.signInSocial({
                      provider,
                      callbackURL: socialLogin.callbackURL,
                      errorCallbackURL: socialLogin.errorCallbackURL,
                    })
                  }
                >
                  {provider === "google" ? (
                    <GoogleIcon data-icon="inline-start" />
                  ) : (
                    <GithubIcon data-icon="inline-start" />
                  )}
                  {t(provider === "google" ? "continueGoogle" : "continueGithub")}
                </Button>
              ))}
              <Separator />
            </div>
          )}
        {showForm && (
          <form onSubmit={submit} aria-busy={busy}>
            <FieldGroup className={compact ? "gap-4" : undefined}>
              {config.name && (
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="auth-name">{t("name")}</FieldLabel>
                  <Input
                    id="auth-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={authPolicy.nameMaxLength}
                    disabled={busy}
                    className="h-11"
                  />
                </Field>
              )}
              {config.email && (
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="auth-email">{t("email")}</FieldLabel>
                  <Input
                    id="auth-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    defaultValue={link.email}
                    required
                    disabled={busy}
                    className="h-11"
                  />
                </Field>
              )}
              {config.password && (
                <PasswordField
                  label={t(config.password.label)}
                  labelAction={
                    config.password.purpose === "current" ? (
                      <LinkComponent to="forgot-password" className={linkClassName}>
                        {t("forgot")}
                      </LinkComponent>
                    ) : undefined
                  }
                  id="auth-password"
                  purpose={config.password.purpose}
                  name="password"
                  required
                  disabled={busy}
                  className="h-11"
                />
              )}
              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full"
                disabled={busy || coolingDown}
              >
                {busy ? (
                  <SpinnerIcon
                    data-icon="inline-start"
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {submitLabel}
                {!busy && !coolingDown && (
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                )}
              </Button>
            </FieldGroup>
          </form>
        )}
        <Separator className={compact ? undefined : "my-1"} />
        <AuthFormFooter mode={mode} compact={compact} LinkComponent={LinkComponent} />
      </div>
    </section>
  );
}

function requestMode(
  auth: ReturnType<typeof useAuthActions>,
  mode: AuthMode,
  data: FormData,
  token: string,
  onSuccess: AuthActionSuccess,
) {
  const email = formText(data, "email");
  const password = formText(data, "password");
  switch (mode) {
    case "login":
      return auth.signIn({ email, password }, onSuccess);
    case "signup":
      return auth.signUp({ name: formText(data, "name"), email, password }, onSuccess);
    case "forgot-password":
      return auth.requestPasswordReset({ email }, onSuccess);
    case "reset-password":
      return auth.resetPassword({ newPassword: password, token }, onSuccess);
    case "verify-email":
      return auth.sendVerificationEmail({ email }, onSuccess);
  }
}

function AuthFormNotices({
  invalidLink,
  socialError,
  success,
  error,
}: {
  invalidLink: boolean;
  socialError: boolean;
  success: ModeConfig["success"];
  error: string;
}) {
  const t = useTranslations("auth");
  return (
    <>
      {invalidLink && (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{t(socialError ? "socialFailed" : "invalidLink")}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert role="status">
          <CheckCircleIcon aria-hidden="true" />
          <AlertDescription>{t(success)}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}

function AuthFormFooter({
  mode,
  compact,
  LinkComponent,
}: {
  mode: AuthMode;
  compact: boolean;
  LinkComponent: ComponentType<AuthFormLinkProps>;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  return (
    <footer
      className={cn("flex flex-col items-center text-center text-sm", compact ? "gap-2" : "gap-4")}
    >
      {mode === "login" ? (
        <>
          <p className="text-muted-foreground">
            {t("noAccount")}{" "}
            <LinkComponent to="signup" className={linkClassName + " text-foreground"}>
              {t("create")}
            </LinkComponent>
          </p>
          <LinkComponent to="verify-email" className={linkClassName + " text-muted-foreground"}>
            {t("resend")}
          </LinkComponent>
        </>
      ) : (
        <LinkComponent to="login" className={linkClassName}>
          {c("signIn")}
        </LinkComponent>
      )}
    </footer>
  );
}
