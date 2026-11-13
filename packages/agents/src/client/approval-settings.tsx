import { useEffect, useId, useState, useSyncExternalStore } from "react";
import {
  computerToolNameSchema,
  type ApprovalRule,
  type ApprovalSettingsState,
  type ComputerToolName,
} from "@raypx/core/approvals";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Separator } from "@raypx/ui/components/ui/separator";
import { IconButton } from "@raypx/ui/icon-button";
import { LoadingState } from "@raypx/ui/loading-state";
import { useConfirmation } from "@raypx/ui/confirmation";
import { CloseIcon } from "@raypx/icons/close";
import {
  ApprovalSettingsController,
  type ApprovalSettingsPort,
} from "../model/approval-settings.js";
import { useTranslations } from "./i18n.js";

const toolKeys = {
  computer_list_files: "tools.listFiles",
  computer_read_file: "tools.readFile",
  computer_write_file: "tools.writeFile",
  computer_run_command: "tools.runCommand",
  agent_memory_save: "tools.saveMemory",
  agent_memory_update: "tools.updateMemory",
} as const;

function ruleKey(rule: ApprovalRule) {
  return JSON.stringify([rule.toolName, rule.executable, rule.decision]);
}

function SettingsChanges({
  previous,
  current,
}: {
  previous: ApprovalSettingsState;
  current: ApprovalSettingsState;
}) {
  const t = useTranslations("agents");
  const oldRules = new Set(previous.rules.map(ruleKey));
  const newRules = new Set(current.rules.map(ruleKey));
  const changes = [
    ...current.rules
      .filter((rule) => !oldRules.has(ruleKey(rule)))
      .map((rule) => ({
        rule,
        action: "serverAdded" as const,
      })),
    ...previous.rules
      .filter((rule) => !newRules.has(ruleKey(rule)))
      .map((rule) => ({
        rule,
        action: "serverRemoved" as const,
      })),
  ];
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-2 text-sm">
      <p>{t("approvalSettings.serverVersion", { revision: String(current.revision) })}</p>
      {previous.mode !== current.mode && (
        <p>
          {t("approvalSettings.serverMode", {
            previous: t(`approvalSettings.${previous.mode}`),
            current: t(`approvalSettings.${current.mode}`),
          })}
        </p>
      )}
      <ul className="flex min-w-0 flex-col gap-1">
        {changes.map(({ rule, action }) => (
          <li key={`${action}-${ruleKey(rule)}`} className="wrap-anywhere">
            {t(`approvalSettings.${action}`, {
              list: t(`approvalSettings.${rule.decision}`),
              tool: t(toolKeys[rule.toolName]),
              executable: rule.executable ?? "",
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ApprovalSettings({ port }: { port: ApprovalSettingsPort }) {
  const t = useTranslations("agents");
  const [controller, setController] = useState<ApprovalSettingsController | null>(null);
  useEffect(() => {
    let cancelled = false;
    let next: ApprovalSettingsController | undefined;
    queueMicrotask(() => {
      if (cancelled) return;
      next = new ApprovalSettingsController(port);
      setController(next);
      void next.load();
    });
    return () => {
      cancelled = true;
      next?.dispose();
    };
  }, [port]);
  return controller ? (
    <ApprovalSettingsEditor controller={controller} />
  ) : (
    <LoadingState label={t("loading")} />
  );
}

export function ApprovalSettingsEditor({ controller }: { controller: ApprovalSettingsController }) {
  const t = useTranslations("agents");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const confirmation = useConfirmation();
  const id = useId();
  const [tool, setTool] = useState<ComputerToolName>("computer_write_file");
  const [executable, setExecutable] = useState("");
  const [decision, setDecision] = useState<ApprovalRule["decision"]>("allow");
  const draft = state.draft;
  const toolOptions = computerToolNameSchema.options.map((value) => ({
    value,
    label: t(toolKeys[value]),
  }));
  function addRule() {
    const added = controller.addRule({
      toolName: tool,
      executable: tool === "computer_run_command" ? executable.trim() : null,
      decision,
    });
    if (added) setExecutable("");
  }
  function confirmNever() {
    return confirmation.confirm({
      requestKey: "approval-never-ask",
      title: t("approvalSettings.neverTitle"),
      description: t("approvalSettings.neverDescription"),
      confirmLabel: t("approvalSettings.never"),
      cancelLabel: t("cancel"),
    });
  }
  function save() {
    void controller.save(confirmNever);
  }
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 py-6">
      <Separator />
      <h2 id={`${id}-title`} className="text-lg font-medium">
        {t("approvalSettings.title")}
      </h2>
      {!draft && !state.error && <LoadingState label={t("loading")} />}
      {state.error && (
        <Alert>
          <AlertDescription>{t(`approvalSettings.${state.error}`)}</AlertDescription>
          {state.conflict && <SettingsChanges {...state.conflict} />}
          {state.conflict && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 mr-2"
              disabled={state.busy}
              onClick={() => void controller.reapply(confirmNever)}
            >
              {t("approvalSettings.reapply")}
            </Button>
          )}
          {(state.error === "load" || state.error === "conflict") && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 self-start"
              disabled={state.busy}
              onClick={() => {
                if (state.conflict) controller.discardConflict();
                else void controller.load();
              }}
            >
              {state.error === "conflict" ? t("approvalSettings.discardReload") : t("refresh")}
            </Button>
          )}
        </Alert>
      )}
      {draft && (
        <>
          <fieldset className="flex min-w-0 flex-col gap-3" disabled={state.busy}>
            <legend className="mb-3 text-sm font-medium">{t("approvalSettings.mode")}</legend>
            <RadioGroup
              disabled={state.busy}
              value={draft.mode}
              aria-label={t("approvalSettings.mode")}
              onValueChange={(value) => {
                if (value === "ask" || value === "never") controller.setMode(value);
              }}
            >
              {state.availableModes.map((entry) => (
                <div key={entry.mode} className="flex min-w-0 flex-col gap-1">
                  <Field orientation="horizontal" data-disabled={!entry.available || undefined}>
                    <RadioGroupItem
                      id={`${id}-${entry.mode}`}
                      value={entry.mode}
                      disabled={!entry.available}
                      aria-describedby={entry.reasonCode ? `${id}-${entry.mode}-reason` : undefined}
                    />
                    <FieldLabel htmlFor={`${id}-${entry.mode}`}>
                      {t(`approvalSettings.${entry.mode}`)}
                    </FieldLabel>
                  </Field>
                  {entry.reasonCode && (
                    <p id={`${id}-${entry.mode}-reason`} className="text-xs text-muted-foreground">
                      {t(`approvalSettings.reasons.${entry.reasonCode}`)}
                    </p>
                  )}
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <p className="text-xs text-muted-foreground">{t("approvalSettings.blockHint")}</p>
          {(["allow", "block"] as const).map((list) => (
            <section
              key={list}
              aria-labelledby={`${id}-${list}`}
              className="flex min-w-0 flex-col gap-2"
            >
              <h3 id={`${id}-${list}`} className="text-sm font-medium">
                {t(`approvalSettings.${list}`)}
              </h3>
              <ul className="flex min-w-0 flex-col divide-y divide-border">
                {draft.rules
                  .filter((rule) => rule.decision === list)
                  .map((rule) => (
                    <li
                      key={JSON.stringify([rule.toolName, rule.executable, rule.decision])}
                      className="flex min-w-0 items-center gap-2 py-2"
                    >
                      <span className="min-w-0 flex-1 text-sm wrap-anywhere">
                        {t(toolKeys[rule.toolName])}
                        {rule.executable && (
                          <code className="mt-1 block text-xs wrap-anywhere">
                            {rule.executable}
                          </code>
                        )}
                      </span>
                      <IconButton
                        size="icon-sm"
                        label={t("approvalSettings.removeRule", {
                          tool: t(toolKeys[rule.toolName]),
                          executable: rule.executable ?? "",
                        })}
                        disabled={state.busy}
                        onClick={() => controller.removeRule(rule)}
                      >
                        <CloseIcon aria-hidden="true" />
                      </IconButton>
                    </li>
                  ))}
              </ul>
              {!draft.rules.some((rule) => rule.decision === list) && (
                <p className="text-xs text-muted-foreground">{t("approvalSettings.emptyList")}</p>
              )}
            </section>
          ))}
          <fieldset disabled={state.busy} className="min-w-0">
            <legend className="mb-3 text-sm font-medium">{t("approvalSettings.addRule")}</legend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${id}-tool`}>{t("approvalSettings.tool")}</FieldLabel>
                <Select
                  disabled={state.busy}
                  items={toolOptions}
                  value={tool}
                  onValueChange={(value) => {
                    if (value) setTool(value);
                  }}
                >
                  <SelectTrigger id={`${id}-tool`} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {toolOptions.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {tool === "computer_run_command" && (
                <Field>
                  <FieldLabel htmlFor={`${id}-executable`}>
                    {t("approvalSettings.executable")}
                  </FieldLabel>
                  <Input
                    id={`${id}-executable`}
                    value={executable}
                    maxLength={1024}
                    autoComplete="off"
                    onChange={(event) => setExecutable(event.target.value)}
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor={`${id}-decision`}>{t("approvalSettings.list")}</FieldLabel>
                <Select
                  disabled={state.busy}
                  items={[
                    { value: "allow", label: t("approvalSettings.allow") },
                    { value: "block", label: t("approvalSettings.block") },
                  ]}
                  value={decision}
                  onValueChange={(value) => {
                    if (value === "allow" || value === "block") setDecision(value);
                  }}
                >
                  <SelectTrigger id={`${id}-decision`} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="allow">{t("approvalSettings.allow")}</SelectItem>
                      <SelectItem value="block">{t("approvalSettings.block")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button
                variant="outline"
                className="self-start"
                disabled={state.busy || (tool === "computer_run_command" && !executable.trim())}
                onClick={addRule}
              >
                {t("approvalSettings.addRule")}
              </Button>
            </FieldGroup>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={state.busy || !state.dirty || !!state.conflict} onClick={save}>
              {t("save")}
            </Button>
            <span role="status" className="text-sm text-muted-foreground">
              {state.saved ? t("approvalSettings.saved") : ""}
            </span>
          </div>
        </>
      )}
      {confirmation.dialog}
    </section>
  );
}
