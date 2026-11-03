import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard";
import { createFileRoute } from "@tanstack/react-router";
import { MemoryLibraryPage } from "@raypx/memory/client";
import { useTranslations } from "@raypx/i18n/browser";
import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary";
import { accountMemory, memoryProjects, memoryUsage } from "../../features/memory/client";
import { ProjectTools } from "../../features/tasks/project-tools";
export const Route = createFileRoute("/(app)/memory")({
  beforeLoad: webPageGuard("/memory"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "memory.title", layout: "workbench" } },
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
  const t = useTranslations("memory");
  const { project, device } = Route.useSearch();
  return (
    <SessionBoundary
      guest={<SignInGate heading="h1" title={t("title")} description={t("signInHint")} />}
    >
      {(accountId) => (
        <>
          {project && <ProjectTools projectId={project} deviceId={device} />}
          {(!project || device) && (
            <MemoryLibraryPage
              client={accountMemory}
              projects={memoryProjects}
              usage={memoryUsage}
              ownerKey={accountId}
              scope="account"
              target={project && device ? { projectId: project, deviceId: device } : undefined}
            />
          )}
        </>
      )}
    </SessionBoundary>
  );
}
