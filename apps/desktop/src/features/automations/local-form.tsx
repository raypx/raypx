import { useTranslations } from "../../i18n.js";
import { useState, type FormEvent } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { SelectField } from "@raypx/ui/select-field";

import type { RootGrant } from "@raypx/contracts/local";
import {
  fileJobIntervals,
  githubJobEvents,
  type JobDefinition,
  type JobInput,
} from "@raypx/core/jobs";
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
  action: JobInput["action"]["type"];
  rootId: string | null;
  association: string;
  onActionChange: (value: JobInput["action"]["type"]) => void;
  onRootChange: (value: string | null) => void;
  onAssociationChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("automations");
  const commandText = useTranslations("command");
  const c = useTranslations("common");
  const [scheduled, setScheduled] = useState(!editing || Boolean(editing.cron));
  const [webhook, setWebhook] = useState(Boolean(editing?.triggers?.webhook));
  const [email, setEmail] = useState(Boolean(editing?.triggers?.email));
  const [github, setGithub] = useState(Boolean(editing?.triggers?.github));
  const [files, setFiles] = useState(Boolean(editing?.triggers?.files));
  const [sender, setSender] = useState(editing?.triggers?.email?.sender ?? "");
  const isPi = action === "agent.run";
  const hasTrigger = !isPi || scheduled || webhook || email || github || files;
  const command = editing && editing.action.type === "command.run" ? editing.action.command : null;
  const piProjectMissing = action === "agent.run" && !roots.some((root) => root.id === association);
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
                { value: "", label: t("local.globalAutomation"), disabled: action === "agent.run" },
                ...roots.map((root) => ({ value: root.id, label: root.name })),
                ...(association && !roots.some((root) => root.id === association)
                  ? [{ value: association, label: c("projectUnavailable") }]
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
          <Field>
            <FieldLabel htmlFor="job-action">{c("action")}</FieldLabel>
            <SelectField
              id="job-action"
              value={action}
              onValueChange={onActionChange}
              options={[
                { value: "directory.scan", label: t("local.scan") },
                { value: "command.run", label: t("local.command") },
                { value: "agent.run", label: t("local.agent") },
              ]}
            />
          </Field>
          {isPi && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("local.whenToRun")}</legend>
              <FieldGroup className="gap-2">
                <Field orientation="horizontal">
                  <Checkbox
                    id="job-trigger-schedule"
                    checked={scheduled}
                    onCheckedChange={(value) => {
                      setScheduled(value);
                      if (value) setFiles(false);
                    }}
                    disabled={busy}
                  />
                  <FieldLabel htmlFor="job-trigger-schedule">{t("local.scheduled")}</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="job-trigger-webhook"
                    name="webhook"
                    checked={webhook}
                    onCheckedChange={setWebhook}
                    disabled={busy}
                  />
                  <FieldLabel htmlFor="job-trigger-webhook">{t("local.webhook")}</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="job-trigger-email"
                    checked={email}
                    onCheckedChange={setEmail}
                    disabled={busy}
                  />
                  <FieldLabel htmlFor="job-trigger-email">{t("local.email")}</FieldLabel>
                </Field>
                {email && (
                  <Field>
                    <FieldLabel htmlFor="job-email-sender">{t("local.emailSender")}</FieldLabel>
                    <Input
                      id="job-email-sender"
                      name="emailSender"
                      type="email"
                      maxLength={254}
                      value={sender}
                      onChange={(event) => setSender(event.target.value)}
                      required
                      disabled={busy}
                    />
                  </Field>
                )}
                <Field orientation="horizontal">
                  <Checkbox
                    id="job-trigger-github"
                    name="github"
                    checked={github}
                    onCheckedChange={setGithub}
                    disabled={busy}
                  />
                  <FieldLabel htmlFor="job-trigger-github">{t("local.github")}</FieldLabel>
                </Field>
                {github && (
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="job-github-repository">
                        {t("local.githubRepository")}
                      </FieldLabel>
                      <Input
                        id="job-github-repository"
                        name="githubRepository"
                        placeholder="owner/repository"
                        maxLength={200}
                        defaultValue={editing?.triggers?.github?.repository ?? ""}
                        required
                        disabled={busy}
                      />
                    </Field>
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium">
                        {t("local.githubEvents")}
                      </legend>
                      <FieldGroup className="gap-2">
                        {githubJobEvents.map((event) => (
                          <Field key={event} orientation="horizontal">
                            <Checkbox
                              id={`job-github-${event}`}
                              name={event}
                              defaultChecked={
                                editing?.triggers?.github?.events.includes(event) ?? true
                              }
                              disabled={busy}
                            />
                            <FieldLabel htmlFor={`job-github-${event}`}>
                              {t(`local.githubEvent.${event}`)}
                            </FieldLabel>
                          </Field>
                        ))}
                      </FieldGroup>
                    </fieldset>
                  </FieldGroup>
                )}
                <Field orientation="horizontal">
                  <Checkbox
                    id="job-trigger-files"
                    name="files"
                    checked={files}
                    onCheckedChange={(value) => {
                      setFiles(value);
                      if (value) setScheduled(false);
                    }}
                    disabled={busy}
                  />
                  <FieldLabel htmlFor="job-trigger-files">{t("local.files")}</FieldLabel>
                </Field>
                {files && (
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="job-file-path">{t("local.watchPath")}</FieldLabel>
                      <Input
                        id="job-file-path"
                        name="watchPath"
                        placeholder={t("local.watchRoot")}
                        maxLength={1024}
                        defaultValue={editing?.triggers?.files?.path ?? ""}
                        disabled={busy}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="job-file-interval">
                        {t("local.watchInterval")}
                      </FieldLabel>
                      <SelectField
                        id="job-file-interval"
                        name="watchInterval"
                        defaultValue={String(editing?.triggers?.files?.intervalMinutes ?? 5)}
                        options={fileJobIntervals.map((value) => ({
                          value: String(value),
                          label: t("local.watchMinutes", { minutes: value }),
                        }))}
                        disabled={busy}
                      />
                    </Field>
                  </FieldGroup>
                )}
              </FieldGroup>
            </fieldset>
          )}
          <div hidden={isPi && !scheduled}>
            <ScheduleFields
              cron={editing?.cron ?? "0 9 * * 1-5"}
              timezone={editing?.timezone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone}
              disabled={busy || (isPi && !scheduled)}
            />
          </div>
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
                <FieldLabel htmlFor="job-path">{c("relativePath")}</FieldLabel>
                <Input
                  id="job-path"
                  name="path"
                  defaultValue={
                    editing && editing.action.type === "directory.scan" ? editing.action.path : ""
                  }
                />
              </Field>
            </FieldGroup>
          ) : action === "agent.run" ? (
            <Field>
              <FieldLabel htmlFor="job-prompt">{t("local.prompt")}</FieldLabel>
              <Textarea
                id="job-prompt"
                name="prompt"
                defaultValue={editing?.action.type === "agent.run" ? editing.action.prompt : ""}
                maxLength={32_000}
                required
              />
            </Field>
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
            <Button
              type="submit"
              disabled={
                busy ||
                !hasTrigger ||
                piProjectMissing ||
                (action === "directory.scan" && !roots.length)
              }
            >
              {busy ? c("working") : c("save")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancel}>
              {c("cancel")}
            </Button>
          </Field>
          {!hasTrigger && (
            <p className="text-sm text-muted-foreground">{t("local.chooseTrigger")}</p>
          )}
          {piProjectMissing && (
            <p className="text-sm text-muted-foreground">{t("local.chooseProject")}</p>
          )}
        </FieldGroup>
      </form>
    </section>
  );
}
