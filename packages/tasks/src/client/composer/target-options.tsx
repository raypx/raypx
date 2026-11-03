import { useId } from "react";
import { agentProviderMetadata, agentProviders, type AgentProvider } from "@raypx/core/tasks";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { SelectField } from "@raypx/ui/select-field";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import type { ComposerAction, ComposerState } from "../../model/composer.js";
import type { taskSelection } from "../../model/composition.js";

/** Computer, project, agent and mode pickers; a controlled project hides its target. */
export function ComposerTargetOptions({
  open,
  onOpenChange,
  devices,
  selection: { device, project },
  value,
  local,
  guest,
  busy,
  targetFixed,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: SyncDevice[];
  selection: ReturnType<typeof taskSelection>;
  value: Pick<ComposerState, "deviceId" | "projectId" | "provider" | "mode">;
  local: boolean;
  guest: boolean;
  busy: boolean;
  targetFixed: boolean;
  onChange: (action: ComposerAction) => void;
}) {
  const t = useTranslations("tasks");
  const fieldId = useId();
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group max-w-full justify-start gap-2 px-0"
          />
        }
      >
        <ChevronDownIcon aria-hidden="true" className="shrink-0 group-data-panel-open:rotate-180" />
        {t("taskOptions")}
        <span className="truncate font-normal text-muted-foreground">
          {project?.name ?? device?.name}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-3">
        {!targetFixed && (
          <div className="grid grid-cols-1 gap-3 @min-[20rem]:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${fieldId}-device`}>{t("device")}</FieldLabel>
              <SelectField
                id={`${fieldId}-device`}
                className="w-full"
                disabled={busy || guest}
                required={!guest}
                value={value.deviceId || null}
                placeholder={t("chooseDevice")}
                onValueChange={(deviceId) => onChange({ type: "device", deviceId })}
                options={devices
                  .filter((d) => !d.revoked)
                  .map((d) => ({
                    value: d.id,
                    label: `${d.name} · ${t(d.online ? "online" : "offline")}`,
                    disabled: !d.online,
                  }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-project`}>{t("project")}</FieldLabel>
              <SelectField
                id={`${fieldId}-project`}
                className="w-full"
                disabled={busy || guest}
                required={!guest}
                value={value.projectId || null}
                placeholder={t("chooseProject")}
                onValueChange={(projectId) => onChange({ type: "project", projectId })}
                options={device?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []}
              />
            </Field>
          </div>
        )}
        {project?.dirty && <p className="text-sm text-muted-foreground">{t("dirty")}</p>}
        <div className="grid grid-cols-1 gap-3 @min-[20rem]:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${fieldId}-agent`}>{t("agent")}</FieldLabel>
            <SelectField<AgentProvider>
              id={`${fieldId}-agent`}
              className="w-full"
              disabled={busy}
              value={value.provider}
              onValueChange={(provider) => onChange({ type: "provider", provider })}
              options={agentProviders
                .filter((candidate) => local || candidate !== "pi")
                .map((candidate) => ({
                  value: candidate,
                  label: agentProviderMetadata[candidate].label,
                }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-mode`}>{t("mode")}</FieldLabel>
            <SelectField<"run" | "plan">
              id={`${fieldId}-mode`}
              className="w-full"
              disabled={busy}
              value={value.mode}
              onValueChange={(mode) => onChange({ type: "mode", mode })}
              options={[
                { value: "run", label: t("runMode") },
                { value: "plan", label: t("planMode") },
              ]}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">{t("executionHint")}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
