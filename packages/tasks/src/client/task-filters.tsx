import { useId } from "react";
import type { AgentTask, SyncDevice } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@raypx/ui/components/ui/native-select";
import { isTaskActive } from "../index.js";

export interface TaskFilters {
  query: string;
  status: "all" | "active" | "attention" | "finished" | "errors";
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
    <div className="mb-5 space-y-3">
      <div className="grid grid-cols-2 gap-3 min-[1200px]:grid-cols-4">
        <Field className="col-span-2 min-[1200px]:col-span-1">
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
        <Field>
          <FieldLabel htmlFor={`${id}-status`}>{c("status")}</FieldLabel>
          <NativeSelect
            id={`${id}-status`}
            className="w-full"
            value={filters.status}
            onChange={(event) =>
              onChange({ ...filters, status: event.target.value as TaskFilters["status"] })
            }
          >
            <NativeSelectOption value="all">{t("allStatuses")}</NativeSelectOption>
            <NativeSelectOption value="active">{t("activeTasks")}</NativeSelectOption>
            <NativeSelectOption value="attention">{t("waiting")}</NativeSelectOption>
            <NativeSelectOption value="finished">{t("finishedTasks")}</NativeSelectOption>
            <NativeSelectOption value="errors">{t("taskErrors")}</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-agent`}>{t("agent")}</FieldLabel>
          <NativeSelect
            id={`${id}-agent`}
            className="w-full"
            value={filters.provider}
            onChange={(event) => onChange({ ...filters, provider: event.target.value })}
          >
            <NativeSelectOption value="">{t("allAgents")}</NativeSelectOption>
            <NativeSelectOption value="claude">Claude Code</NativeSelectOption>
            <NativeSelectOption value="codex">Codex</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field className="col-span-2 min-[1200px]:col-span-1">
          <FieldLabel htmlFor={`${id}-device`}>{t("device")}</FieldLabel>
          <NativeSelect
            id={`${id}-device`}
            className="w-full"
            value={filters.device}
            onChange={(event) => onChange({ ...filters, device: event.target.value })}
          >
            <NativeSelectOption value="">{t("allDevices")}</NativeSelectOption>
            {devices.map((device) => (
              <NativeSelectOption key={device.id} value={device.id}>
                {device.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
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
