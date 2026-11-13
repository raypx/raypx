import { useTranslations } from "../i18n.js";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { MemoryLibraryPage } from "@raypx/memory/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";

import { RemoteBoundary } from "../features/auth/components/remote-boundary.js";
import {
  accountMemory,
  memoryProjects,
  memoryUsage,
  localMemory,
  localMemoryProjects,
} from "../features/memory/client.js";
import { isDesktop } from "../lib/desktop.js";
import { ShellActions } from "@raypx/blocks/shell";
export const Route = createFileRoute("/memory")({
  staticData: { page: { title: "memory.title", layout: "workbench" } },
  validateSearch: (search: Record<string, unknown>): { scope?: "local" | "account" } => {
    if (search.scope === "account" || search.scope === "local") return { scope: search.scope };
    return {};
  },
  component: Page,
});
function Page() {
  const { scope = "local" } = Route.useSearch();
  const router = useRouter();
  const t = useTranslations("memory");
  const c = useTranslations("common");
  const localPage = isDesktop() ? (
    <MemoryLibraryPage
      client={localMemory}
      projects={localMemoryProjects}
      ownerKey="device"
      scope="device"
    />
  ) : (
    <section className="flex flex-col gap-4">
      <h1>{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("desktopOnly")}</p>
    </section>
  );
  const remotePage = (
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
  );
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
      className="gap-6"
    >
      <ShellActions>
        <TabsList aria-label={t("scope")}>
          <TabsTrigger value="local">{t("localScope")}</TabsTrigger>
          <TabsTrigger value="account">{c("account")}</TabsTrigger>
        </TabsList>
      </ShellActions>
      <TabsContent value="local" keepMounted>
        {localPage}
      </TabsContent>
      <TabsContent value="account">{remotePage}</TabsContent>
    </Tabs>
  );
}
