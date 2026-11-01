import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ProjectList } from "@raypx/tasks/client";
import { useTranslations } from "@raypx/i18n/browser";
import { GuestHome } from "../../features/auth/components/guest-home";
import { SessionBoundary } from "../../features/auth/components/session-boundary";
import { apiUrl } from "../../features/auth/client";
import { taskClient } from "../../features/tasks/client";
import { Button } from "@raypx/ui/components/ui/button";

export const Route = createFileRoute("/(app)/")({
  staticData: {
    page: { title: "common.projects", guestTitle: "common.home", layout: "workbench" },
  },
  component: Home,
});
function Home() {
  const router = useRouter(),
    t = useTranslations("tasks"),
    c = useTranslations("common");
  const { account } = Route.useRouteContext();
  if (account.status === "unavailable")
    return (
      <div className="space-y-3 py-8">
        <p role="alert">{c("networkError")}</p>
        <Button variant="outline" onClick={() => void router.invalidate()}>
          {c("retry")}
        </Button>
      </div>
    );
  return (
    <SessionBoundary guest={<GuestHome />}>
      {(accountId) => (
        <ProjectList
          client={taskClient}
          scope={{ kind: "remote", namespace: apiUrl, accountId }}
          onSelect={({ deviceId, projectId }) =>
            void router.navigate({ to: "/tasks", search: { project: projectId, device: deviceId } })
          }
          connectionAction={
            <Link to="/settings" className="text-sm underline underline-offset-4">
              {t("agentSettings")}
            </Link>
          }
        />
      )}
    </SessionBoundary>
  );
}
