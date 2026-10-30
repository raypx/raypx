import { createFileRoute } from "@tanstack/react-router";
import { MemoryLibraryPage } from "@raypx/memory/client";
import { useTranslations } from "@raypx/i18n/browser";
import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary";
import { accountMemory, memoryProjects, memoryUsage } from "../../features/memory/client";
export const Route = createFileRoute("/(app)/memory")({
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
