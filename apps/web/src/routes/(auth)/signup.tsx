import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { AuthForm } from "../../features/auth/components/auth-form.tsx";
import { publicConfigurationQuery } from "../../features/configuration/client.ts";
import { LoadingState } from "@raypx/ui/loading-state";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { UserCircleIcon } from "@raypx/icons/user-circle";

export const Route = createFileRoute("/(auth)/signup")({
  component: SignupPage,
});

function SignupPage() {
  const search = Route.useSearch();
  const query = useQuery(publicConfigurationQuery());
  const t = useTranslations("site");
  if (query.data?.registrationEnabled) return <AuthForm mode="signup" />;
  return (
    <section className="mx-auto flex w-full max-w-[25rem] flex-col items-start gap-5">
      {query.isPending ? (
        <LoadingState label={t("checkingRegistration")} />
      ) : query.isError ? (
        <>
          <AlertCircleIcon aria-hidden="true" className="size-6 text-muted-foreground" />
          <p role="alert" className="text-sm leading-relaxed">
            {t("registrationUnavailable")}
          </p>
          <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
            {t("retry")}
          </Button>
        </>
      ) : (
        <>
          <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <UserCircleIcon aria-hidden="true" className="size-5" />
          </div>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">{t("closed")}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("closedHint")}</p>
        </>
      )}
      <Link
        to="/login"
        search={search}
        className="inline-flex min-h-8 items-center rounded-sm text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("signIn")}
      </Link>
    </section>
  );
}
