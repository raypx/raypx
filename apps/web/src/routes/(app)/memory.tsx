import { useTranslations } from "../../i18n.js";
import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard.js";
import { createFileRoute } from "@tanstack/react-router";
import { MemoryLibraryPage } from "@raypx/memory/client";

import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary.js";
import { accountMemory, memoryProjects, memoryUsage } from "../../features/memory/client.js";
export const Route = createFileRoute("/(app)/memory")({
  beforeLoad: webPageGuard("/memory"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "memory.title", layout: "workbench" } },
  component: Page,
});
function Page() {
  const t = useTranslations("memory");
  return (
    <SessionBoundary
      guest={<SignInGate heading="h1" title={t("title")} description={t("signInHint")} />}
    >
      {(accountId) => (
        <MemoryLibraryPage
          client={accountMemory}
          projects={memoryProjects}
          usage={memoryUsage}
          ownerKey={accountId}
          scope="account"
        />
      )}
    </SessionBoundary>
  );
}
