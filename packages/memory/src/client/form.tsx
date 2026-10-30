import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { SelectField } from "@raypx/ui/select-field";
import {
  contextDocumentInputSchema,
  type ContextDocument,
  type ContextDocumentInput,
} from "../model.js";
import type { MemoryProjectsPort } from "./port.js";
export function DocumentForm({
  document,
  projects,
  busy,
  onSave,
  onCancel,
}: {
  document: ContextDocument | null;
  projects: Awaited<ReturnType<MemoryProjectsPort["list"]>>;
  busy: boolean;
  onSave: (input: ContextDocumentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("memory"),
    c = useTranslations("common"),
    id = useId();
  const [name, setName] = useState(document?.name ?? ""),
    [category, setCategory] = useState(document?.category ?? ""),
    [content, setContent] = useState(document?.content ?? "");
  const [kind, setKind] = useState<"memory" | "template">(document?.kind ?? "memory");
  const [project, setProject] = useState(
    document?.project ? JSON.stringify(document.project) : "global",
  );
  const [invalid, setInvalid] = useState(false);
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
    const parsed = contextDocumentInputSchema.safeParse({
      name,
      category,
      content,
      kind,
      project: project === "global" ? null : JSON.parse(project),
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    await onSave(parsed.data);
  }
  return (
    <section className="mb-7 rounded-lg border border-border bg-sidebar p-5">
      <h2 className="mb-5 text-base font-semibold">{t(document ? "edit" : "create")}</h2>
      <form onSubmit={(event) => void submit(event)} className="max-w-3xl space-y-5">
        <div className="grid gap-5 @xl/main:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-kind`}>{t("kind")}</FieldLabel>
            <SelectField
              id={`${id}-kind`}
              value={kind}
              onValueChange={setKind}
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
              onValueChange={setProject}
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
            onChange={(event) => setName(event.target.value)}
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
            onChange={(event) => setCategory(event.target.value)}
            disabled={busy}
            maxLength={80}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-content`}>{t("content")}</FieldLabel>
          <Textarea
            id={`${id}-content`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={busy}
            maxLength={8000}
            required
            className="min-h-64 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">{t("contentHint")}</p>
        </Field>
        {invalid && (
          <p role="alert" className="text-sm text-destructive-text">
            {t("invalid")}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            {c(busy ? "working" : "save")}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {c("cancel")}
          </Button>
        </div>
      </form>
    </section>
  );
}
