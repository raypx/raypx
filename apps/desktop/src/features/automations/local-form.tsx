import type { FormEvent } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { SelectField } from "@raypx/ui/select-field";
import { useTranslations } from "@raypx/i18n/browser";
import type { RootGrant } from "@raypx/contracts/local";
import type { JobDefinition } from "@raypx/core/jobs";
import { ScheduleFields } from "./schedule-fields.js";

/** The create/edit form. Selections are controlled so the page can validate them on save. */
export function LocalJobForm({
  editing,
  busy,
  roots,
  projectId,
  action,
  rootId,
  association,
  onActionChange,
  onRootChange,
  onAssociationChange,
  onSubmit,
  onCancel,
}: {
  /** The job being edited, or `null` for a new one. */
  editing: JobDefinition | null;
  busy: boolean;
  roots: RootGrant[];
  projectId?: string | undefined;
  action: string;
  rootId: string | null;
  association: string;
  onActionChange: (value: string) => void;
  onRootChange: (value: string | null) => void;
  onAssociationChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("automations");
  const commandText = useTranslations("command");
  const c = useTranslations("common");
  const command = editing && editing.action.type === "command.run" ? editing.action.command : null;
  return (
    <section className="mb-8 rounded-lg border border-border bg-card p-5">
      <h2 className="mb-5 text-base font-semibold">{t(editing ? "local.edit" : "local.create")}</h2>
      <form key={editing?.id ?? "new"} onSubmit={onSubmit} className="max-w-3xl" aria-busy={busy}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="job-project">{t("local.projectAssociation")}</FieldLabel>
            <SelectField
              id="job-project"
              value={association}
              onValueChange={onAssociationChange}
              options={[
                { value: "", label: t("local.globalAutomation") },
                ...roots.map((root) => ({ value: root.id, label: root.name })),
                ...(association && !roots.some((root) => root.id === association)
                  ? [{ value: association, label: t("local.projectUnavailable") }]
                  : []),
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="job-name">{c("name")}</FieldLabel>
            <Input
              id="job-name"
              name="name"
              defaultValue={editing?.name ?? ""}
              maxLength={120}
              required
            />
          </Field>
          <ScheduleFields
            cron={editing?.cron ?? "0 9 * * 1-5"}
            timezone={editing?.timezone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone}
            disabled={busy}
          />
          <Field>
            <FieldLabel htmlFor="job-action">{t("action")}</FieldLabel>
            <SelectField
              id="job-action"
              value={action}
              onValueChange={onActionChange}
              options={[
                { value: "directory.scan", label: t("local.scan") },
                { value: "command.run", label: t("local.command") },
              ]}
            />
          </Field>
          {action === "directory.scan" ? (
            <FieldGroup className="@md/field-group:flex-row">
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="job-root">{t("local.folder")}</FieldLabel>
                <SelectField
                  id="job-root"
                  name="rootId"
                  value={rootId}
                  onValueChange={onRootChange}
                  required
                  placeholder={t("local.chooseFolderFirst")}
                  options={roots.map((root) => ({ value: root.id, label: root.name }))}
                />
              </Field>
              <Field className="min-w-0 flex-1">
                <FieldLabel htmlFor="job-path">{t("local.relativePath")}</FieldLabel>
                <Input
                  id="job-path"
                  name="path"
                  defaultValue={
                    editing && editing.action.type === "directory.scan" ? editing.action.path : ""
                  }
                />
              </Field>
            </FieldGroup>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="job-executable">{commandText("executable")}</FieldLabel>
                <Input
                  id="job-executable"
                  name="executable"
                  defaultValue={command?.executable ?? ""}
                  aria-describedby="job-command-hint"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="job-args">{commandText("arguments")}</FieldLabel>
                <Input
                  id="job-args"
                  name="args"
                  defaultValue={JSON.stringify(command?.args ?? [])}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="job-cwd">{commandText("cwd")}</FieldLabel>
                <Input
                  id="job-cwd"
                  name="cwd"
                  defaultValue={
                    command?.cwd ?? roots.find((root) => root.id === projectId)?.path ?? ""
                  }
                  required
                />
              </Field>
              <p id="job-command-hint" className="text-sm/relaxed text-muted-foreground">
                {t("local.commandHint")}
              </p>
            </>
          )}
          <Field orientation="horizontal" className="flex-wrap gap-3">
            <Button type="submit" disabled={busy || (action === "directory.scan" && !roots.length)}>
              {busy ? c("working") : c("save")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancel}>
              {c("cancel")}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
