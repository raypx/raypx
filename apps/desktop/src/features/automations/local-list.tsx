import { useTranslations } from "../../i18n.js";
import { ClockIcon } from "@raypx/icons/clock";
import { DeleteIcon } from "@raypx/icons/delete";
import { EditIcon } from "@raypx/icons/edit";
import { PauseIcon } from "@raypx/icons/pause";
import { PlayIcon } from "@raypx/icons/play";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";

import type { RootGrant } from "@raypx/contracts/local";
import type { JobDefinition } from "@raypx/core/jobs";

export function LocalJobList({
  jobs,
  roots,
  busy,
  date,
  onRun,
  onHistory,
  onToggle,
  onEdit,
  onRemove,
  onTriggers,
}: {
  jobs: JobDefinition[];
  roots: RootGrant[];
  busy: boolean;
  date: (value: string) => string;
  onRun: (job: JobDefinition) => void;
  onHistory: (job: JobDefinition) => void;
  onToggle: (job: JobDefinition) => void;
  onEdit: (job: JobDefinition) => void;
  onRemove: (job: JobDefinition) => void;
  onTriggers: (job: JobDefinition) => void;
}) {
  const t = useTranslations("automations");
  const c = useTranslations("common");
  const actionLabel = {
    "directory.scan": t("local.scan"),
    "command.run": t("local.command"),
    "agent.run": t("local.agent"),
  };
  function association(job: JobDefinition) {
    if (!job.projectId) return t("local.globalAutomation");
    return roots.find((root) => root.id === job.projectId)?.name ?? c("projectUnavailable");
  }
  return (
    <div>
      {jobs.map((job) => (
        <article
          className="flex items-start gap-3 border-t border-border py-4 @max-4xl/main:flex-wrap"
          key={job.id}
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <ClockIcon size={20} />
          </div>
          <div className="min-w-30 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium wrap-anywhere">{job.name}</h2>
              <span className="text-xs wrap-anywhere text-muted-foreground">
                {association(job)}
              </span>
              <Badge variant={job.enabled ? "secondary" : "outline"}>
                {c(job.enabled ? "enabled" : "paused")}
              </Badge>
            </div>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {job.cron && (
                <>
                  <code>{job.cron}</code>
                  <span>·</span>
                  {job.timezone}
                  <span>·</span>
                </>
              )}
              {actionLabel[job.action.type]}
              {job.triggers?.webhook && <span>· {t("local.webhook")}</span>}
              {job.triggers?.email && <span>· {t("local.email")}</span>}
              {job.triggers?.github && <span>· {t("local.github")}</span>}
              {job.triggers?.files && <span>· {t("local.files")}</span>}
            </p>
            {job.nextRuns[0] && job.enabled && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {t("next")}: {date(job.nextRuns[0])}
              </p>
            )}
          </div>
          <div className="flex max-w-sm flex-wrap items-center justify-end gap-1 @max-4xl/main:ml-12 @max-4xl/main:max-w-none">
            <Button variant="outline" disabled={busy} onClick={() => onRun(job)}>
              <PlayIcon data-icon="inline-start" />
              {t("run")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => onHistory(job)}>
              {t("history")}
            </Button>
            {(job.triggers?.webhook || job.triggers?.email || job.triggers?.github) && (
              <Button variant="ghost" disabled={busy} onClick={() => onTriggers(job)}>
                {t("local.triggerDetails")}
              </Button>
            )}
            <IconButton
              disabled={busy}
              label={`${t(job.enabled ? "pause" : "enable")}: ${job.name}`}
              onClick={() => onToggle(job)}
            >
              {job.enabled ? <PauseIcon /> : <PlayIcon />}
            </IconButton>
            <IconButton
              disabled={busy}
              label={`${c("edit")}: ${job.name}`}
              onClick={() => onEdit(job)}
            >
              <EditIcon />
            </IconButton>
            <IconButton
              disabled={busy}
              label={c("deleteNamed", { name: job.name })}
              onClick={() => onRemove(job)}
            >
              <DeleteIcon />
            </IconButton>
          </div>
        </article>
      ))}
    </div>
  );
}
