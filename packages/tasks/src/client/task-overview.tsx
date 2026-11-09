import type { AgentTask } from "@raypx/core/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { isTaskActive } from "../model/task.ts";
import type { TaskFilters } from "./task-filters.tsx";

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
    <div className="mb-3 flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{t("taskHistory")}</h2>
      <div
        role="group"
        aria-label={t("pageOverview")}
        className="flex flex-wrap gap-1 border-b border-border pb-2"
      >
        {groups.map((group) => (
          <Button
            key={group.status}
            size="sm"
            variant={filters.status === group.status ? "secondary" : "ghost"}
            aria-pressed={filters.status === group.status}
            onClick={() => onChange({ ...filters, status: group.status })}
          >
            {group.label === "needsYou" && group.count > 0 && (
              <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground" />
            )}
            {t(group.label)}
            <span className="min-w-5 rounded-sm bg-muted px-1 text-center text-xs text-muted-foreground tabular-nums">
              {group.count}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
