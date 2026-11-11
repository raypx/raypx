import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { GithubIcon } from "@raypx/icons/github";
import { GoogleIcon } from "@raypx/icons/google";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Separator } from "@raypx/ui/components/ui/separator";
import { Input } from "@raypx/ui/components/ui/input";
import { cn } from "@raypx/ui/lib/utils";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { useAuthActions, type AuthActionClient, type AuthActionSuccess } from "../hooks.js";
import type { SocialProvider } from "@raypx/core/auth";
import { authPolicy } from "../policy.js";
import { readAuthLink, type AuthMode } from "./auth-link.js";
import { PasswordField } from "./password-field.js";
import { useMailCooldown } from "./use-mail-cooldown.js";
import { useAuthErrorMessage } from "./use-auth-error-message.js";

export type { AuthMode } from "./auth-link.js";

import {
  AuthFormFooter,
  AuthFormHeader,
  AuthFormNotices,
  linkClassName,
  type AuthFormLinkProps,
} from "./auth-form-parts.js";
import { authFormTitle, authSuccessMessage, modes, requestMode } from "./auth-modes.js";

export type { AuthFormLinkProps } from "./auth-form-parts.js";

const socialProviders = {
  google: { icon: GoogleIcon, label: "continueGoogle" },
  github: { icon: GithubIcon, label: "continueGithub" },
} as const;

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
  const link = readAuthLink(mode, search, auth.error);
  const messageKey = authSuccessMessage(config, link.verified, succeeded);
  const showForm = !link.verified && !link.invalidReset && !complete;
  const terminal = link.invalidReset || link.verified || complete;
  const title = authFormTitle(config, link, signedIn, complete);
  const intro = terminal ? null : config.intro;
  const coolingDown = config.mail === true && cooldown.remaining > 0;
  function submitLabel() {
    if (busy) return c("working");
    if (coolingDown) return t("resendIn", { seconds: String(cooldown.remaining) });
    if (config.submit) return t(config.submit);
    return c("signIn");
  }
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
    <section aria-labelledby="auth-title" className="mx-auto w-full max-w-100">
      {backLabel !== null && (
        <LinkComponent
          to="account"
          className="group mb-7 inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftIcon
            size={16}
            aria-hidden="true"
            className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-x-0.5"
          />
          {backLabel ?? c("account")}
        </LinkComponent>
      )}
      <AuthFormHeader
        title={t(title)}
        intro={intro && t(intro)}
        headingLeading={headingLeading}
        terminal={terminal}
        invalid={link.invalidReset}
        compact={compact}
      />
      <div className={cn("flex flex-col", compact ? "gap-4" : "gap-5")}>
        <AuthFormNotices
          invalidLink={link.failed || link.invalidReset}
          success={messageKey}
          error={link.invalidReset ? "" : error}
          socialError={(mode === "login" || mode === "signup") && link.failed}
          terminal={terminal}
        />
        {signedIn && (auth.error?.kind === "completion" || busy) && (
          <Button size="xl" disabled={busy} onClick={() => void auth.retryCompletion()}>
            {busy && <SpinnerIcon aria-hidden="true" className="motion-safe:animate-spin" />}
            {c(busy ? "working" : "retry")}
          </Button>
        )}
        {link.invalidReset && (
          <LinkComponent
            to="forgot-password"
            className={cn(buttonVariants({ size: "xl" }), "w-full")}
          >
            {t("sendReset")}
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </LinkComponent>
        )}
        {!signedIn && (link.verified || complete) && (
          <LinkComponent to="login" className={cn(buttonVariants({ size: "xl" }), "w-full")}>
            {c("signIn")}
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </LinkComponent>
        )}
        {showForm &&
          (mode === "login" || mode === "signup") &&
          socialLogin &&
          socialLogin.providers.length > 0 && (
            <div className="flex flex-col gap-3">
              {socialLogin.providers.map((provider) => {
                const { icon: Icon, label } = socialProviders[provider];
                return (
                  <Button
                    key={provider}
                    type="button"
                    variant="outline"
                    size="xl"
                    disabled={busy}
                    onClick={() =>
                      void auth.signInSocial({
                        provider,
                        callbackURL: socialLogin.callbackURL,
                        errorCallbackURL: socialLogin.errorCallbackURL,
                      })
                    }
                  >
                    <Icon data-icon="inline-start" />
                    {t(label)}
                  </Button>
                );
              })}
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
                    controlSize="xl"
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
                    controlSize="xl"
                  />
                </Field>
              )}
              {config.password && (
                <PasswordField
                  label={t(config.password.label)}
                  labelAction={
                    config.password.purpose === "current" && (
                      <LinkComponent to="forgot-password" className={linkClassName}>
                        {t("forgot")}
                      </LinkComponent>
                    )
                  }
                  id="auth-password"
                  purpose={config.password.purpose}
                  name="password"
                  required
                  disabled={busy}
                  controlSize="xl"
                />
              )}
              <Button
                type="submit"
                size="xl"
                className="mt-1 w-full"
                disabled={busy || coolingDown}
              >
                {busy && (
                  <SpinnerIcon
                    data-icon="inline-start"
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                )}
                {submitLabel()}
                {!busy && !coolingDown && (
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                )}
              </Button>
            </FieldGroup>
          </form>
        )}
        {!complete && !link.verified && (
          <>
            {showForm && <Separator className="my-1" />}
            <AuthFormFooter mode={mode} compact={compact} LinkComponent={LinkComponent} />
          </>
        )}
      </div>
    </section>
  );
}
