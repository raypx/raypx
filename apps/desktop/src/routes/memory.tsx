import { createFileRoute, useRouter } from "@tanstack/react-router";
import { MemoryLibraryPage } from "@raypx/memory/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";
import { useTranslations } from "@raypx/i18n/browser";
import { RemoteBoundary } from "../features/auth/components/remote-boundary";
import {
  accountMemory,
  memoryProjects,
  memoryUsage,
  localMemory,
  localMemoryProjects,
} from "../features/memory/client";
import { isDesktop } from "../lib/desktop";
export const Route = createFileRoute("/memory")({
  validateSearch: (search: Record<string, unknown>): { scope?: "local" | "account" } =>
    search.scope === "account" || search.scope === "local" ? { scope: search.scope } : {},
  component: Page,
});
function Page() {
  const { scope = "local" } = Route.useSearch(),
    router = useRouter(),
    t = useTranslations("memory");
  return (
    <Tabs
      value={scope}
      onValueChange={(value) =>
        void router.navigate({
          to: "/memory",
          search: { scope: value === "account" ? "account" : "local" },
          replace: true,
        })
      }
      className="gap-0"
    >
      <div className="mx-auto w-full max-w-6xl px-8 pt-6">
        <TabsList aria-label={t("scope")}>
          <TabsTrigger value="local">{t("localScope")}</TabsTrigger>
          <TabsTrigger value="account">{t("accountScope")}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="local" keepMounted>
        {isDesktop() ? (
          <MemoryLibraryPage
            client={localMemory}
            projects={localMemoryProjects}
            ownerKey="device"
            scope="device"
          />
        ) : (
          <p className="px-8 py-8 text-sm text-muted-foreground">{t("desktopOnly")}</p>
        )}
      </TabsContent>
      <TabsContent value="account">
        <RemoteBoundary>
          {(accountId) => (
            <MemoryLibraryPage
              client={accountMemory}
              projects={memoryProjects}
              usage={memoryUsage}
              ownerKey={accountId}
              scope="account"
            />
          )}
        </RemoteBoundary>
      </TabsContent>
    </Tabs>
  );
}
