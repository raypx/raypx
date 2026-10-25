import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../analytics/client";
import { Link, useRouter } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { useTranslations } from "@raypx/i18n/browser";
import { apiUrl, authClient } from "../auth/client";
import { taskClient } from "./client";
import { isDesktop } from "../../lib/desktop";
import { localTaskClient } from "./local-client";

const local = instrumentTaskClient(localTaskClient, analytics, "local");
const remote = instrumentTaskClient(taskClient, analytics, "remote");
export function DesktopTaskWorkspace({
  view,
  initialScope = "local",
}: {
  view: "tasks" | "approvals";
  initialScope?: "local" | "remote";
}) {
  const router = useRouter();
  const session = authClient.useSession(),
    t = useTranslations("tasks"),
    c = useTranslations("common");
  const accountId = session.data?.user.id ?? null;
  return (
    <Tabs
      key={`${accountId ?? "signed-out"}:${initialScope}`}
      defaultValue={initialScope}
      className="gap-0"
      onValueChange={(value) => {
        const next = value === "remote" ? "remote" : "local";
        if (view === "approvals")
          void router.navigate({ to: "/approvals", search: { scope: next }, replace: true });
        analytics.capture("task_scope_changed", { scope: next });
      }}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-4 px-8 pt-6 max-[760px]:px-5">
        <TabsList aria-label={t("taskScope")}>
          <TabsTrigger value="local">{t("thisComputer")}</TabsTrigger>
          <TabsTrigger value="remote">{t("connectedComputers")}</TabsTrigger>
        </TabsList>
        <Link
          to="/settings"
          className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("agentSettings")}
        </Link>
      </div>
      <TabsContent value="local">
        {isDesktop() ? (
          <TaskWorkspace
            local
            draftNamespace={apiUrl}
            client={local}
            accountId={accountId}
            pending={session.isPending}
            view={view}
          />
        ) : (
          <section className="mx-auto w-full max-w-[1600px] px-10 py-10">
            <h1>{t(view === "tasks" ? "title" : "inbox")}</h1>
            <p className="mt-4 text-sm text-muted-foreground">{c("desktopOnly")}</p>
          </section>
        )}
      </TabsContent>
      <TabsContent value="remote">
        <TaskWorkspace
          draftNamespace={apiUrl}
          client={remote}
          accountId={accountId}
          pending={session.isPending}
          view={view}
        />
      </TabsContent>
    </Tabs>
  );
}
