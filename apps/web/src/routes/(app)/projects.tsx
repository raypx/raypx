import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ProjectList } from "@raypx/tasks/client";
import { useTranslations } from "@raypx/i18n/browser";
import { SignInGate, SessionBoundary } from "../../features/auth/components/session-boundary";
import { apiUrl } from "../../features/auth/client";
import { taskClient } from "../../features/tasks/client";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { ShellActions } from "@raypx/blocks/shell";
import { EmptyState } from "@raypx/ui/empty-state";
import { SettingsIcon } from "@raypx/icons/settings";
import { OfflineIcon } from "@raypx/icons/offline";

export const Route = createFileRoute("/(app)/projects")({
  beforeLoad: webPageGuard("/projects"),
  errorComponent: PageAccessFeedback,
  staticData: {
    page: { title: "common.projects", layout: "workbench" },
  },
  component: Projects,
});
function Projects() {
  const router = useRouter(),
    t = useTranslations("tasks"),
    c = useTranslations("common"),
    g = useTranslations("guest");
  const { account } = Route.useRouteContext();
  const guest = <SignInGate heading="h1" title={c("projects")} description={g("computersHint")} />;
  if (account.status === "signed-out") return guest;
  if (account.status === "unavailable")
    return (
      <div role="alert">
        <EmptyState
          icon={<OfflineIcon aria-hidden="true" />}
          title={c("networkError")}
          action={
            <Button variant="outline" onClick={() => void router.invalidate()}>
              {c("retry")}
            </Button>
          }
        />
      </div>
    );
  return (
    <SessionBoundary guest={guest}>
      {(accountId) => (
        <>
          <ShellActions>
            <Link to="/settings" className={buttonVariants({ variant: "outline" })}>
              <SettingsIcon data-icon="inline-start" aria-hidden="true" />
              {t("agentSettings")}
            </Link>
          </ShellActions>
          <ProjectList
            client={taskClient}
            scope={{ kind: "remote", namespace: apiUrl, accountId }}
            onSelect={({ deviceId, projectId }) =>
              void router.navigate({
                to: "/tasks",
                search: { project: projectId, device: deviceId },
              })
            }
            connectionAction={
              <Link to="/settings" className="text-sm underline underline-offset-4">
                {t("agentSettings")}
              </Link>
            }
          />
        </>
      )}
    </SessionBoundary>
  );
}
