import { useTranslations } from "../../i18n.js";
import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard.js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CloudJobsPage } from "@raypx/jobs/client";

import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary.js";
import { cloudJobs, jobDevices } from "../../features/automations/client.js";
import { accountMemory } from "../../features/memory/client.js";
import { ProjectTools } from "../../features/tasks/project-tools.js";

export const Route = createFileRoute("/(app)/automations")({
  beforeLoad: webPageGuard("/automations"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "common.jobs", layout: "workbench" } },
  validateSearch: (search: Record<string, unknown>): { project?: string; device?: string } => ({
    ...(typeof search.project === "string" && /^[0-9a-f-]{36}$/i.test(search.project)
      ? { project: search.project }
      : {}),
    ...(typeof search.device === "string" && /^[0-9a-f-]{36}$/i.test(search.device)
      ? { device: search.device }
      : {}),
  }),
  component: Page,
});
function Page() {
  const t = useTranslations("automations.cloud");
  const { project, device } = Route.useSearch();
  return (
    <SessionBoundary
      guest={<SignInGate heading="h1" title={t("title")} description={t("signInHint")} />}
    >
      {(accountId) => (
        <>
          {project && <ProjectTools projectId={project} deviceId={device} />}
          {(!project || device) && (
            <CloudJobsPage
              target={project && device ? { projectId: project, deviceId: device } : undefined}
              contextLibrary={accountMemory}
              accountId={accountId}
              client={cloudJobs}
              devices={jobDevices}
              renderTaskLink={(taskId) => (
                <Link to="/tasks" search={{ taskId }} className="underline underline-offset-4">
                  {t("viewTask")}
                </Link>
              )}
            />
          )}
        </>
      )}
    </SessionBoundary>
  );
}
