import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { AuthForm } from "../../features/auth/components/auth-form";
import { publicConfigurationQuery } from "../../features/configuration/client";

export const Route = createFileRoute("/(auth)/signup")({
  component: SignupPage,
});

function SignupPage() {
  const query = useQuery(publicConfigurationQuery());
  const t = useTranslations("configuration");
  if (query.data?.registrationEnabled) return <AuthForm mode="signup" />;
  return (
    <section className="mx-auto max-w-lg space-y-5 px-6 py-16">
      {query.isPending ? (
        <p role="status">{t("checkingRegistration")}</p>
      ) : query.isError ? (
        <>
          <p role="alert">{t("registrationUnavailable")}</p>
          <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
            {t("retry")}
          </Button>
        </>
      ) : (
        <>
          <h1>{t("closed")}</h1>
          <p className="text-muted-foreground">{t("closedHint")}</p>
        </>
      )}
      <Link to="/login" className="inline-block underline underline-offset-4">
        {t("signIn")}
      </Link>
    </section>
  );
}
