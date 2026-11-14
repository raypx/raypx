import type { ReactNode } from "react";
import { Badge } from "@raypx/ui/components/ui/badge";
import { AgentIcon } from "@raypx/icons/agent";
import { BellIcon } from "@raypx/icons/bell";
import { ClockIcon } from "@raypx/icons/clock";
import { FileTextIcon } from "@raypx/icons/file-text";
import { FolderIcon } from "@raypx/icons/folder";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { useTranslations } from "../../../i18n.js";

type Kind = "shared" | "computers" | "approvals" | "routines" | "knowledge" | "tools";

/** Static UI specimens are labelled, have no interactive controls and read no private data. */
export function CapabilityExample({ kind }: { kind: Kind }) {
  const t = useTranslations("guest");
  const illustrations = {
    shared: <SharedExample />,
    computers: <ComputersExample />,
    approvals: <ApprovalsExample />,
    routines: <RoutinesExample />,
    knowledge: <KnowledgeExample />,
    tools: <ToolsExample />,
  };
  return (
    <figure
      aria-label={t(`${kind}Title`)}
      className="flex min-h-64 min-w-0 flex-col gap-4 border-t border-border bg-muted/25 p-5 sm:p-6"
    >
      <figcaption className="text-xs text-muted-foreground">{t("previewLabel")}</figcaption>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">{illustrations[kind]}</div>
    </figure>
  );
}

function ExampleRow({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-3">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">{children}</div>
    </div>
  );
}
function SharedExample() {
  const t = useTranslations("guest");
  return (
    <>
      <ExampleRow
        icon={<AgentIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("previewGroup")}</span>
          <Badge variant="secondary">{t("previewMembers")}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("previewAgent")} · {t("previewAttachment")}
        </span>
      </ExampleRow>
      <ExampleRow
        icon={<BellIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("previewNotification")}</span>
          <Badge variant="outline">{t("previewUnread")}</Badge>
        </div>
      </ExampleRow>
    </>
  );
}
function ComputersExample() {
  const t = useTranslations("guest");
  return (
    <>
      <ExampleRow
        icon={<MonitorIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
      >
        <span>{t("previewComputer")}</span>
        <span className="text-xs text-muted-foreground">
          {t("previewFiles")} · {t("previewScreen")}
        </span>
      </ExampleRow>
      <ExampleRow
        icon={<FolderIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
      >
        <span>{t("previewDevice")}</span>
        <span className="text-xs text-muted-foreground">{t("previewDirectory")} · workspace/</span>
      </ExampleRow>
    </>
  );
}
function ApprovalsExample() {
  const t = useTranslations("guest");
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheckIcon aria-hidden="true" className="size-4" />
        <span className="font-medium">{t("previewApproval")}</span>
        <Badge variant="secondary">{t("previewWaiting")}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t("previewAuto")}</p>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
          {t("previewAllow")}
        </span>
        <span className="rounded-md border border-border px-3 py-1.5 text-xs">
          {t("previewDecline")}
        </span>
      </div>
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        {t("previewProtected")}
      </p>
    </div>
  );
}
function RoutinesExample() {
  const t = useTranslations("guest");
  return (
    <>
      <ExampleRow
        icon={<ClockIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
      >
        <span>{t("previewRoutine")}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{t("previewSchedule")}</span>
      </ExampleRow>
      <div className="flex flex-wrap gap-2">
        {(["Schedule", "Webhook", "Email", "Repository"] as const).map((trigger) => (
          <Badge key={trigger} variant="outline">
            {t(`trigger${trigger}`)}
          </Badge>
        ))}
      </div>
    </>
  );
}
function KnowledgeExample() {
  const t = useTranslations("guest");
  return (
    <>
      <ExampleRow
        icon={<BookOpenIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
      >
        <span>{t("previewMemory")}</span>
        <span className="text-xs text-muted-foreground">
          {t("previewAgent")} · {t("previewSpace")}
        </span>
      </ExampleRow>
      <ExampleRow
        icon={<FileTextIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("previewPage")}</span>
          <Badge variant="secondary">{t("previewVersion")}</Badge>
        </div>
      </ExampleRow>
    </>
  );
}
function ToolsExample() {
  const t = useTranslations("guest");
  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background px-4">
      {(["previewSkill", "previewServer", "previewApi"] as const).map((key) => (
        <div key={key} className="flex min-w-0 items-center gap-3 py-3 text-sm">
          <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span>{t(key)}</span>
        </div>
      ))}
    </div>
  );
}
