import { useEffect, useMemo } from "react";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { JoinSpaceView } from "@raypx/agents/client";
import { SpaceJoinController } from "@raypx/agents/model";
import { LoadingState } from "@raypx/ui/loading-state";
import { Button } from "@raypx/ui/components/ui/button";
import { authClient } from "../features/auth/client.js";
import { BrowserAuthorization } from "../features/auth/components/browser-login.js";
import { agentsClient } from "../features/agents/client.js";
import { useTranslations } from "../i18n.js";

export const Route = createFileRoute("/join")({
  ssr: false,
  preload: false,
  staticData: { page: { title: "agents.spaceSettings.joinTitle", layout: "document" } },
  component: JoinPage,
});

function JoinPage() {
  const t = useTranslations("agents");
  const session = authClient.useSession();
  const token = useLocation({ select: (location) => location.hash.replace(/^#/, "") });
  if (session.isPending) return <LoadingState label={t("loading")} />;
  if (session.error) return <Button onClick={() => void session.refetch()}>{t("refresh")}</Button>;
  if (!session.data)
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-medium">{t("spaceSettings.joinTitle")}</h1>
        <BrowserAuthorization
          onAuthorized={async () => {
            await session.refetch();
          }}
        />
      </section>
    );
  return <SignedInJoin key={session.data.user.id} token={token} />;
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
