import { useId, type FormEvent } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { Field, FieldError, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { SelectField } from "@raypx/ui/select-field";
import type { ContextDocument, ContextDocumentInput } from "@raypx/core/memory";
import type { MemoryProjectsPort } from "./port.ts";

export function documentDraft(
  document: ContextDocument | null,
  defaultProject?: { deviceId: string; projectId: string },
): ContextDocumentInput {
  return {
    name: document?.name ?? "",
    category: document?.category ?? "",
    content: document?.content ?? "",
    kind: document?.kind ?? "memory",
    project: document ? document.project : (defaultProject ?? null),
  };
}

export function DocumentForm({
  document,
  draft,
  onChange,
  invalid,
  projects,
  busy,
  onSave,
  onCancel,
}: {
  document: ContextDocument | null;
  draft: ContextDocumentInput;
  onChange: (draft: ContextDocumentInput) => void;
  invalid: boolean;
  projects: Awaited<ReturnType<MemoryProjectsPort["list"]>>;
  busy: boolean;
  onSave: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const t = useTranslations("memory"),
    c = useTranslations("common"),
    id = useId();
  const { name, category, content, kind } = draft;
  const project = draft.project ? JSON.stringify(draft.project) : "global";
  const options = [
    { value: "global", label: t("global") },
    ...projects.map((item) => ({
      value: JSON.stringify({ deviceId: item.deviceId, projectId: item.projectId }),
      label: item.name,
    })),
  ];
  if (!options.some((item) => item.value === project))
    options.push({ value: project, label: t("projectUnavailable") });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    await onSave();
  }
  return (
    <section className="mb-6 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 text-sm font-semibold">{t(document ? "edit" : "create")}</h2>
      <form onSubmit={(event) => void submit(event)} className="max-w-3xl" aria-busy={busy}>
        <FieldGroup className="gap-4">
          <div className="grid gap-4 @xl/main:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-kind`}>{t("kind")}</FieldLabel>
              <SelectField
                id={`${id}-kind`}
                value={kind}
                onValueChange={(value) => onChange({ ...draft, kind: value })}
                disabled={busy}
                options={[
                  { value: "memory", label: t("memory") },
                  { value: "template", label: t("template") },
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-project`}>{t("project")}</FieldLabel>
              <SelectField
                id={`${id}-project`}
                value={project}
                onValueChange={(value) =>
                  onChange({ ...draft, project: value === "global" ? null : JSON.parse(value) })
                }
                disabled={busy}
                options={options}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>{c("name")}</FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              disabled={busy}
              maxLength={120}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-category`}>{t("category")}</FieldLabel>
            <Input
              id={`${id}-category`}
              value={category}
              onChange={(event) => onChange({ ...draft, category: event.target.value })}
              disabled={busy}
              maxLength={80}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-content`}>{t("content")}</FieldLabel>
            <Textarea
              id={`${id}-content`}
              value={content}
              onChange={(event) => onChange({ ...draft, content: event.target.value })}
              disabled={busy}
              maxLength={8000}
              required
              aria-describedby={`${id}-content-hint`}
              className="max-h-[32rem] min-h-56 resize-y overflow-y-auto font-mono text-sm leading-relaxed"
            />
            <p id={`${id}-content-hint`} className="text-xs text-muted-foreground">
              {t("contentHint")}
            </p>
          </Field>
          {invalid && <FieldError>{t("invalid")}</FieldError>}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="submit" disabled={busy}>
              {c(busy ? "working" : "save")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
              {c("cancel")}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
