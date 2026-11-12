import { useTranslations } from "../../../i18n.js";
import type { ReactNode } from "react";

import { CheckIcon } from "@raypx/icons/check";
import { ClockIcon } from "@raypx/icons/clock";
import { FileTextIcon } from "@raypx/icons/file-text";
import { FolderIcon } from "@raypx/icons/folder";
import { TerminalWindowIcon } from "@raypx/icons/terminal-window";
import { cn } from "@raypx/ui/lib/utils";
import { DotGrid } from "../../../components/artwork.js";
import { accentGradient } from "../../../components/brand-accent.js";

/**
 * Example interfaces for the homepage workspace links. Each frame is labelled as an
 * example and uses fixed sample data, never the visitor's projects, requests, schedules
 * or documents. Pieces react to hover on their parent `group` link only.
 */

const lift =
  "group-hover:-translate-y-1 motion-safe:transition-[translate] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]";
const line = "h-1.5 rounded-full bg-foreground/10";

function ArtFrame({ children }: { children: ReactNode }) {
  const t = useTranslations("guest");
  return (
    <div
      aria-hidden="true"
      className="relative isolate h-44 overflow-hidden border-t border-border bg-muted/35"
    >
      <DotGrid className="mask-[radial-gradient(ellipse_at_center,#000_20%,transparent_75%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_70%_at_50%_100%,color-mix(in_oklch,var(--brand-violet)_18%,transparent),transparent)] opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300" />
      <span className="absolute top-3 right-3 z-10 rounded-full border border-border bg-background/80 px-2 py-0.5 text-xs text-muted-foreground backdrop-blur-sm">
        {t("example")}
      </span>
      {children}
    </div>
  );
}

const projects = [
  { name: "raypx", active: true },
  { name: "docs-site" },
  { name: "api-gateway" },
] as const;

export function ProjectsArt() {
  return (
    <ArtFrame>
      <div
        className={cn(
          "absolute inset-x-5 top-11 -bottom-6 flex overflow-hidden rounded-xl border border-border bg-background shadow-soft",
          lift,
        )}
      >
        <div className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar p-2 text-xs">
          {projects.map((project) => (
            <div
              key={project.name}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5",
                "active" in project && "bg-sidebar-accent",
              )}
            >
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
              {"active" in project && (
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--brand-sky)]" />
              )}
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 bg-foreground p-3 font-mono text-xs leading-5 text-background dark:bg-muted/60 dark:text-foreground">
          <span className="truncate">
            <span className="opacity-50">$ </span>bun test
          </span>
          {["delivery.test.ts", "receipt.test.ts"].map((file) => (
            <span key={file} className="flex min-w-0 items-center gap-1.5">
              <CheckIcon className="size-3 shrink-0 text-[var(--brand-sky)]" />
              <span className="truncate opacity-80">{file}</span>
            </span>
          ))}
          <span className="truncate opacity-60">128 passed · 2.4s</span>
        </div>
      </div>
    </ArtFrame>
  );
}

export function ApprovalsArt() {
  const common = useTranslations("common");
  const t = useTranslations("guest");
  return (
    <ArtFrame>
      <div className="absolute inset-x-11 top-7 h-20 rounded-xl border border-border bg-background/50" />
      <div className="absolute inset-x-8 top-10 h-20 rounded-xl border border-border bg-background/80" />
      <div
        className={cn(
          "absolute inset-x-5 top-13 flex flex-col gap-2 rounded-xl border border-border bg-background p-3 shadow-soft",
          lift,
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-md text-white",
              accentGradient,
            )}
          >
            <TerminalWindowIcon className="size-3" />
          </span>
          <span className="font-medium">Agent</span>
          <span className="ml-auto truncate text-muted-foreground">{t("previewNeedsYou")}</span>
        </div>
        <code className="truncate rounded-md bg-muted px-2.5 py-1.5 text-xs">
          bun run db:migrate
        </code>
        <div className="flex justify-end gap-2 text-xs">
          <span className="rounded-md border border-border px-2.5 py-1">{common("deny")}</span>
          <span className="rounded-md bg-foreground px-2.5 py-1 text-background">
            {t("exampleApprove")}
          </span>
        </div>
      </div>
    </ArtFrame>
  );
}

export function AutomationsArt() {
  const t = useTranslations("guest");
  const jobs = [
    { name: "nightly-tests", when: t("exampleDaily"), on: true },
    { name: "deps-audit", when: t("exampleWeekly"), on: false },
  ];
  return (
    <ArtFrame>
      <div className={cn("absolute inset-x-5 top-11 flex flex-col gap-2", lift)}>
        {jobs.map((job) => (
          <div
            key={job.name}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 shadow-soft"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <ClockIcon className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-xs font-medium">{job.name}</span>
              <span className="truncate text-xs text-muted-foreground">{job.when}</span>
            </span>
            <span
              className={cn(
                "flex h-4 w-7 shrink-0 items-center rounded-full p-0.5",
                job.on ? cn(accentGradient, "justify-end") : "justify-start bg-foreground/15",
              )}
            >
              <span className="size-3 rounded-full bg-background shadow-soft" />
            </span>
          </div>
        ))}
      </div>
    </ArtFrame>
  );
}

const documents = ["CONVENTIONS.md", "release-checklist.md", "api-style.md"] as const;

export function MemoryArt() {
  return (
    <ArtFrame>
      <div className={cn("absolute inset-x-5 top-11 flex gap-3", lift)}>
        {documents.map((name, index) => (
          <div
            key={name}
            className={cn(
              "relative flex w-44 shrink-0 flex-col gap-2 rounded-xl border border-border bg-background p-3 shadow-soft",
              index === 0 && "border-[var(--brand-violet)]/40",
            )}
          >
            {index === 0 && (
              <span
                className={cn(
                  "absolute -top-px right-4 h-6 w-4 [clip-path:polygon(0_0,100%_0,100%_100%,50%_72%,0_100%)]",
                  accentGradient,
                )}
              />
            )}
            <span className="flex min-w-0 items-center gap-2 pr-6 text-xs font-medium">
              <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">{name}</span>
            </span>
            <span className={cn(line, "w-full")} />
            <span className={cn(line, "w-5/6")} />
            <span className={cn(line, "w-2/3")} />
          </div>
        ))}
      </div>
    </ArtFrame>
  );
}
