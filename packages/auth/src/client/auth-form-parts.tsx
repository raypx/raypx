import type { ComponentType, ReactNode } from "react";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { cn } from "@raypx/ui/lib/utils";
import { useTranslations } from "@raypx/i18n/browser";
import type { AuthMode } from "./auth-link.ts";
import type { ModeConfig } from "./auth-modes.ts";

export const linkClassName =
  "rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface AuthFormLinkProps {
  to: "account" | "login" | "signup" | "forgot-password" | "verify-email";
  className: string;
  children: ReactNode;
}

export function AuthFormHeader({
  title,
  intro,
  headingLeading,
  terminal,
  invalid,
  compact,
}: {
  title: string;
  intro: string | null;
  headingLeading: ReactNode;
  terminal: boolean;
  invalid: boolean;
  compact: boolean;
}) {
  const StatusIcon = invalid ? AlertCircleIcon : CheckCircleIcon;
  return (
    <header
      className={cn(
        "flex flex-col gap-2",
        compact ? "mb-6" : "mb-7",
        terminal && "items-center text-center",
      )}
    >
      {headingLeading}
      {terminal && <StatusIcon aria-hidden="true" className="mb-3 size-9 text-foreground" />}
      <h1 id="auth-title" className="text-2xl leading-8 font-semibold tracking-tight text-balance">
        {title}
      </h1>
      {intro && <p className="text-sm leading-6 text-muted-foreground">{intro}</p>}
    </header>
  );
}

export function AuthFormNotices({
  invalidLink,
  socialError,
  success,
  error,
  terminal,
}: {
  invalidLink: boolean;
  socialError: boolean;
  success: ModeConfig["success"] | "verified";
  error: string;
  terminal: boolean;
}) {
  const t = useTranslations("auth");
  function invalidLinkNotice() {
    if (!invalidLink) return null;
    if (terminal) {
      return (
        <p role="alert" className="text-center text-sm leading-6 text-muted-foreground">
          {t("invalidLink")}
        </p>
      );
    }
    const message = socialError ? "socialFailed" : "invalidLink";
    return (
      <Alert variant="destructive">
        <AlertCircleIcon aria-hidden="true" />
        <AlertDescription>{t(message)}</AlertDescription>
      </Alert>
    );
  }

  function successNotice() {
    if (!success) return null;
    if (terminal) {
      return (
        <p role="status" className="text-center text-sm leading-6 text-muted-foreground">
          {t(success)}
        </p>
      );
    }
    return (
      <Alert role="status">
        <CheckCircleIcon aria-hidden="true" />
        <AlertDescription>{t(success)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {invalidLinkNotice()}
      {successNotice()}
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}

export function AuthFormFooter({
  mode,
  compact,
  LinkComponent,
}: {
  mode: AuthMode;
  compact: boolean;
  LinkComponent: ComponentType<AuthFormLinkProps>;
}) {
  return (
    <footer
      className={cn("flex flex-col items-center text-center text-sm", compact ? "gap-2" : "gap-3")}
    >
      <AuthFooterLinks mode={mode} LinkComponent={LinkComponent} />
    </footer>
  );
}

function AuthFooterLinks({
  mode,
  LinkComponent,
}: {
  mode: AuthMode;
  LinkComponent: ComponentType<AuthFormLinkProps>;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  if (mode !== "login") {
    return (
      <LinkComponent
        to="login"
        className={cn(
          linkClassName,
          "inline-flex items-center gap-2 text-muted-foreground hover:text-foreground",
        )}
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {c("signIn")}
      </LinkComponent>
    );
  }
  return (
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
  );
}
