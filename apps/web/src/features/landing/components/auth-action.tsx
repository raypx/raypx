import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { LoginIcon } from "@raypx/icons/login";
import { MonitorIcon } from "@raypx/icons/monitor";
import { RefreshIcon } from "@raypx/icons/refresh";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { authClient } from "../../auth/client";

/** Share Better Auth's deduplicated session store with the header account menu. */
export function LandingAuthAction({ className }: { className?: string }) {
  const c = useTranslations("common");
  const t = useTranslations("guest");
  const session = authClient.useSession();
  if (session.isPending || session.error) {
    const Icon = session.isPending ? SpinnerIcon : RefreshIcon;
    return (
      <Button
        variant="outline"
        className={className}
        disabled={session.isPending}
        aria-busy={session.isPending}
        aria-description={session.error ? c("networkError") : undefined}
        onClick={() => void session.refetch()}
      >
        <Icon
          aria-hidden="true"
          data-icon="inline-start"
          className={cn(session.isPending && "animate-spin motion-reduce:animate-none")}
        />
        {c(session.isPending ? "loading" : "retry")}
      </Button>
    );
  }
  const signedIn = Boolean(session.data);
  const Icon = signedIn ? MonitorIcon : LoginIcon;
  return (
    <Link
      to={signedIn ? "/settings" : "/login"}
      search={signedIn ? {} : { returnTo: "/settings" }}
      className={cn(buttonVariants({ variant: "outline" }), className)}
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      {t(signedIn ? "connectComputer" : "connect")}
    </Link>
  );
}
