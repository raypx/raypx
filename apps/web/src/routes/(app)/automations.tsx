import { createFileRoute, Link } from "@tanstack/react-router";
import { CloudJobsPage } from "@raypx/jobs/client";
import { useTranslations } from "@raypx/i18n/browser";
import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary";
import { cloudJobs, jobDevices } from "../../features/automations/client";
import { accountMemory } from "../../features/memory/client";

export const Route = createFileRoute("/(app)/automations")({
  staticData: { page: { title: "common.jobs", layout: "workbench" } },
  component: Page,
});
function Page() {
  const t = useTranslations("cloudJobs");
  return (
    <SessionBoundary
      guest={<SignInGate heading="h1" title={t("title")} description={t("signInHint")} />}
    >
      {(accountId) => (
        <CloudJobsPage
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
    </SessionBoundary>
  );
}
