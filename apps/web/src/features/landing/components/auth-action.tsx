import { Link } from "@tanstack/react-router";
import { AgentIcon } from "@raypx/icons/agent";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { authClient } from "../../auth/client.js";
import { useTranslations } from "../../../i18n.js";

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
  if (session.isPending)
    return (
      <Button size={size} className={className} disabled aria-busy>
        {c("loading")}
      </Button>
    );
  return (
    <Link
      to={session.data && !session.error ? "/agents" : "/login"}
      search={session.data && !session.error ? {} : { returnTo: "/agents" }}
      className={cn(buttonVariants({ size }), className)}
    >
      <AgentIcon data-icon="inline-start" />
      {t("openAgents")}
    </Link>
  );
}
