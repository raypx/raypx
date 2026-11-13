import type { OfferedModel } from "../model/port.js";
import { modelChoiceGroups } from "../model/model-connections.js";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { useTranslations } from "./i18n.js";

export function ModelPicker({
  id,
  models,
  value,
  disabled,
  onValueChange,
  onOpenModels,
}: {
  id: string;
  models: readonly OfferedModel[];
  value: string;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onOpenModels?: (() => void) | undefined;
}) {
  const t = useTranslations("agents");
  const missing = value !== "" && !models.some((model) => model.modelId === value);
  const groups = modelChoiceGroups(models);
  const options = models.map((model) => ({ value: model.modelId, label: model.name }));
  if (missing) options.push({ value, label: t("unavailableModel", { model: value }) });
  if (models.length === 0)
    return (
      <div
        id={id}
        role="status"
        className="flex flex-col items-start gap-2 text-sm text-muted-foreground"
      >
        <p>{t("noModels")}</p>
        {missing && <p className="wrap-anywhere">{t("unavailableModel", { model: value })}</p>}
        {onOpenModels && (
          <Button type="button" variant="link" size="sm" onClick={onOpenModels}>
            {t("connections.manage")}
          </Button>
        )}
      </div>
    );
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue placeholder={t("chooseModel")} />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {(["connection", "deployment"] as const).map(
          (source) =>
            groups[source].length > 0 && (
              <SelectGroup key={source}>
                <SelectLabel>
                  {source === "connection"
                    ? t("connections.memberModels")
                    : t("connections.deploymentModels")}
                </SelectLabel>
                {groups[source].map((model) => (
                  <SelectItem key={model.modelId} value={model.modelId} data-value={model.modelId}>
                    <span className="min-w-0 whitespace-normal wrap-anywhere">{model.name}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ),
        )}
        {missing && (
          <SelectGroup>
            <SelectItem value={value} data-value={value} disabled>
              {t("unavailableModel", { model: value })}
            </SelectItem>
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
