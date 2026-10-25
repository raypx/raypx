import { SlidersHorizontal } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useId } from "react";
import type { AgentTask, SyncDevice } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { SelectField } from "@raypx/ui/select-field";
import { isTaskActive } from "../index.js";

export interface TaskFilters {
  query: string;
  status: "all" | "active" | "working" | "attention" | "finished" | "errors";
  device: string;
  provider: string;
}
export const emptyTaskFilters: TaskFilters = {
  query: "",
  status: "all",
  device: "",
  provider: "",
};

export function filterTasks(tasks: AgentTask[], devices: SyncDevice[], filters: TaskFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const names = new Map(devices.map((device) => [device.id, device.name]));
  return tasks.filter((task) => {
    if (filters.device && task.deviceId !== filters.device) return false;
    if (filters.provider && task.provider !== filters.provider) return false;
    if (filters.status === "active" && !isTaskActive(task)) return false;
    if (filters.status === "working" && (!isTaskActive(task) || task.status === "waiting"))
      return false;
    if (filters.status === "attention" && task.status !== "waiting") return false;
    if (filters.status === "finished" && isTaskActive(task)) return false;
    if (
      filters.status === "errors" &&
      !["failed", "interrupted", "delivery_failed"].includes(task.status)
    )
      return false;
    return (
      !query ||
      [task.prompt, task.summary, names.get(task.deviceId)].some((value) =>
        value?.toLocaleLowerCase().includes(query),
      )
    );
  });
}

export function TaskFilterBar({
  filters,
  devices,
  count,
  total,
  onChange,
}: {
  filters: TaskFilters;
  devices: SyncDevice[];
  count: number;
  total: number;
  onChange: (filters: TaskFilters) => void;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const id = useId();
  const active =
    filters.query !== "" ||
    filters.status !== "all" ||
    filters.device !== "" ||
    filters.provider !== "";
  return (
    <div className="@container mb-5 space-y-3">
      <Collapsible className="space-y-3">
        <div className="flex items-end gap-2">
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor={`${id}-search`}>{t("searchTasks")}</FieldLabel>
            <Input
              id={`${id}-search`}
              type="search"
              value={filters.query}
              maxLength={500}
              placeholder={t("searchPlaceholder")}
              onChange={(event) => onChange({ ...filters, query: event.target.value })}
            />
          </Field>
          <CollapsibleTrigger
            render={
              <Button type="button" variant="outline" size="icon" aria-label={t("filters")} />
            }
          >
            <SlidersHorizontal aria-hidden="true" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="grid grid-cols-2 gap-3 @min-[48rem]:grid-cols-3">
          <Field>
            <FieldLabel htmlFor={`${id}-status`}>{c("status")}</FieldLabel>
            <SelectField<TaskFilters["status"]>
              id={`${id}-status`}
              className="w-full"
              value={filters.status}
              onValueChange={(status) => onChange({ ...filters, status })}
              options={[
                { value: "all", label: t("allStatuses") },
                { value: "active", label: t("activeTasks") },
                { value: "working", label: t("workingTasks") },
                { value: "attention", label: t("waiting") },
                { value: "finished", label: t("finishedTasks") },
                { value: "errors", label: t("taskErrors") },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-agent`}>{t("agent")}</FieldLabel>
            <SelectField
              id={`${id}-agent`}
              className="w-full"
              value={filters.provider}
              onValueChange={(provider) => onChange({ ...filters, provider })}
              options={[
                { value: "", label: t("allAgents") },
                { value: "claude", label: "Claude Code" },
                { value: "codex", label: "Codex" },
              ]}
            />
          </Field>
          <Field className="col-span-2 @min-[48rem]:col-span-1">
            <FieldLabel htmlFor={`${id}-device`}>{t("device")}</FieldLabel>
            <SelectField
              id={`${id}-device`}
              className="w-full"
              value={filters.device}
              onValueChange={(device) => onChange({ ...filters, device })}
              options={[
                { value: "", label: t("allDevices") },
                ...devices.map((device) => ({ value: device.id, label: device.name })),
              ]}
            />
          </Field>
        </CollapsibleContent>
      </Collapsible>
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-muted-foreground">
          {t("filteredCount", { count: String(count), total: String(total) })}
        </p>
        {active && (
          <Button size="sm" variant="ghost" onClick={() => onChange(emptyTaskFilters)}>
            {t("clearFilters")}
          </Button>
        )}
      </div>
    </div>
  );
}
