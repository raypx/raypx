import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { LoginIcon } from "@raypx/icons/login";
import { MonitorIcon } from "@raypx/icons/monitor";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { authClient } from "../../auth/client.ts";

/** Share Better Auth's deduplicated session store with the header account menu. */
export function LandingAuthAction({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "lg";
}) {
  const c = useTranslations("common");
  const t = useTranslations("guest");
  const session = authClient.useSession();
  if (session.isPending) {
    return (
      <Button variant="outline" size={size} className={className} disabled aria-busy={true}>
        <SpinnerIcon
          aria-hidden="true"
          data-icon="inline-start"
          className="animate-spin motion-reduce:animate-none"
        />
        {c("loading")}
      </Button>
    );
  }
  const signedIn = Boolean(session.data);
  const Icon = signedIn ? MonitorIcon : LoginIcon;
  return (
    <Link
      to={signedIn ? "/settings" : "/login"}
      search={signedIn ? {} : { returnTo: "/settings" }}
      className={cn(buttonVariants({ variant: "outline", size }), className)}
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      {t(signedIn ? "connectComputer" : "connect")}
    </Link>
  );
}
