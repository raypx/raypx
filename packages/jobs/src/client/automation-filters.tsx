import { useTranslations } from "./i18n.js";
import { SearchIcon } from "@raypx/icons/search";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { SelectField } from "@raypx/ui/select-field";

/** Controlled list filters shared by device schedules and account schedules. */
export function AutomationFilters({
  query,
  status,
  onQueryChange,
  onStatusChange,
  shown,
  total,
}: {
  query: string;
  status: string;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: string) => void;
  shown: number;
  total: number;
}) {
  const common = useTranslations("common");
  const t = useTranslations("automations");
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={t("search")}
            placeholder={t("search")}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </InputGroup>
        <SelectField
          className="w-44 max-w-full"
          aria-label={t("filterStatus")}
          value={status}
          onValueChange={onStatusChange}
          options={[
            { value: "all", label: common("allStatuses") },
            { value: "enabled", label: common("enabled") },
            { value: "paused", label: common("paused") },
          ]}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {t("matchingSchedules", { shown, total })}
      </p>
    </div>
  );
}
