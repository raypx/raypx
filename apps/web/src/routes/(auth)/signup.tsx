import { useTranslations } from "../../i18n.js";
import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import type { IconComponent } from "@raypx/icons";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { AuthForm } from "../../features/auth/components/auth-form.js";
import { publicConfigurationQuery } from "../../features/config/client.js";
import { LoadingState } from "@raypx/ui/loading-state";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { UserCircleIcon } from "@raypx/icons/user-circle";

export const Route = createFileRoute("/(auth)/signup")({
  component: SignupPage,
});

const statusClass = "mx-auto flex w-full max-w-[25rem] flex-col";
const footerLinkClass =
  "self-center rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SignupPage() {
  const common = useTranslations("common");
  const search = Route.useSearch();
  const query = useQuery(publicConfigurationQuery());
  const t = useTranslations("site");
  if (query.data?.registrationEnabled) return <AuthForm mode="signup" />;
  if (query.isPending) {
    return (
      <section className={statusClass}>
        <LoadingState label={t("checkingRegistration")} />
      </section>
    );
  }
  if (query.isError) {
    return (
      <RegistrationStatus
        icon={AlertCircleIcon}
        title={t("unavailableTitle")}
        description={t("registrationUnavailable")}
        alert
      >
        <Button
          size="xl"
          className="w-full"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching && (
            <SpinnerIcon
              data-icon="inline-start"
              aria-hidden="true"
              className="motion-safe:animate-spin"
            />
          )}
          {common("retry")}
        </Button>
        <Link to="/login" search={search} className={footerLinkClass}>
          {common("signIn")}
        </Link>
      </RegistrationStatus>
    );
  }
  return (
    <RegistrationStatus icon={UserCircleIcon} title={t("closed")} description={t("closedHint")}>
      <Link to="/login" search={search} className={cn(buttonVariants({ size: "xl" }), "w-full")}>
        {common("signIn")}
        <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
      </Link>
    </RegistrationStatus>
  );
}

/** Matches the shared form's terminal states: centered status, title, action, then links. */
function RegistrationStatus({
  icon: Icon,
  title,
  description,
  alert = false,
  children,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="auth-title" className={cn(statusClass, "gap-5")}>
      <header className="mb-2 flex flex-col items-center gap-2 text-center">
        <Icon aria-hidden="true" className="mb-3 size-9 text-foreground" />
        <h1
          id="auth-title"
          className="text-2xl leading-8 font-semibold tracking-tight text-balance"
        >
          {title}
        </h1>
        <p
          role={alert ? "alert" : undefined}
          className="text-sm leading-6 text-pretty text-muted-foreground"
        >
          {description}
        </p>
      </header>
      {children}
    </section>
  );
}
