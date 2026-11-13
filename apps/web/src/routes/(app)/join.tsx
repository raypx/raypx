import { useEffect, useMemo } from "react";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { JoinSpaceView } from "@raypx/agents/client";
import { SpaceJoinController } from "@raypx/agents/model";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { SessionBoundary } from "../../features/auth/components/session-boundary.js";
import { authClient } from "../../features/auth/client.js";
import { agentsClient } from "../../features/agents/client.js";
import { useTranslations } from "../../i18n.js";

export const Route = createFileRoute("/(app)/join")({
  ssr: false,
  staticData: { page: { title: "agents.spaceSettings.joinTitle", layout: "document" } },
  component: JoinPage,
});

function JoinPage() {
  const t = useTranslations("agents");
  const hash = useLocation({ select: (location) => location.hash });
  const { refetch } = authClient.useSession();
  useEffect(() => {
    const refresh = () => {
      void refetch();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refetch]);
  return (
    <SessionBoundary
      guest={
        <section className="flex min-w-0 flex-col items-start gap-4">
          <h1 className="text-2xl font-medium">{t("spaceSettings.joinTitle")}</h1>
          <p className="text-sm">{t("spaceSettings.joinSignInHint")}</p>
          {/* Keep the invitation in this tab's fragment, outside returnTo and OAuth state. */}
          <Link to="/login" target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
            {t("spaceSettings.joinSignIn")}
          </Link>
        </section>
      }
    >
      {(accountId) => <SignedInJoin key={accountId} token={hash.replace(/^#/, "")} />}
    </SessionBoundary>
  );
}

function SignedInJoin({ token }: { token: string }) {
  const navigate = Route.useNavigate();
  const controller = useMemo(() => {
    const value = new SpaceJoinController(agentsClient.spaces);
    value.setToken(token);
    return value;
  }, [token]);
  useEffect(() => () => controller.dispose(), [controller]);
  return (
    <JoinSpaceView
      controller={controller}
      onJoined={(spaceId) => void navigate({ to: "/agents", search: { spaceId }, replace: true })}
    />
  );
}
