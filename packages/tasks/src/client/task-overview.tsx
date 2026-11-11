import type { AgentTask } from "@raypx/core/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { isTaskActive } from "../model/task.js";
import type { TaskFilters } from "./task-filters.js";

/** These counts describe this loaded page, independent of search and other filters. */
export function TaskOverview({
  tasks,
  filters,
  onChange,
}: {
  tasks: AgentTask[];
  filters: TaskFilters;
  onChange: (value: TaskFilters) => void;
}) {
  const t = useTranslations("tasks");
  const groups = [
    { status: "all", label: "allTasks", count: tasks.length },
    {
      status: "attention",
      label: "needsYou",
      count: tasks.filter((task) => task.status === "waiting").length,
    },
    {
      status: "working",
      label: "activeTasks",
      count: tasks.filter((task) => isTaskActive(task) && task.status !== "waiting").length,
    },
    {
      status: "finished",
      label: "finishedTasks",
      count: tasks.filter((task) => !isTaskActive(task)).length,
    },
  ] as const;
  return (
    <div className="mb-3 flex min-w-0 flex-col gap-2">
      <h2 className="text-sm font-semibold">{t("taskHistory")}</h2>
      <div
        role="group"
        aria-label={t("pageOverview")}
        className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg bg-muted p-0.5 [scrollbar-width:none]"
      >
        {groups.map((group) => {
          const selected = filters.status === group.status;
          return (
            <Button
              key={group.status}
              size="sm"
              variant="ghost"
              aria-pressed={selected}
              onClick={() => onChange({ ...filters, status: group.status })}
              className={cn(
                "shrink-0 gap-1.5 px-2 text-muted-foreground hover:bg-background/60 hover:text-foreground",
                selected && "bg-background text-foreground shadow-sm hover:bg-background",
              )}
            >
              {group.label === "needsYou" && group.count > 0 && (
                <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground" />
              )}
              {t(group.label)}
              <span className="text-xs text-muted-foreground tabular-nums">{group.count}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
