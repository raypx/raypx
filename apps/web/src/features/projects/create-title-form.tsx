import { useRef, useState, type FormEvent } from "react";
import { Button } from "@voidmix/ui/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@voidmix/ui/components/ui/field";
import { Input } from "@voidmix/ui/components/ui/input";
import { useTranslations } from "../../i18n/client";

const copy = {
  project: { label: "titlePlaceholder", submit: "newProject", error: "createFailed" },
  task: { label: "taskPlaceholder", submit: "addTask", error: "taskFailed" },
} as const;

export function CreateTitleForm({
  kind,
  onCreate,
}: {
  kind: keyof typeof copy;
  onCreate(title: string): Promise<void>;
}) {
  const t = useTranslations("projects");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const id = `${kind}-title`;
  const errorId = `${kind}-create-error`;
  const labels = copy[kind];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await onCreate(title.trim());
      setTitle("");
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} aria-busy={saving}>
      <FieldGroup className={kind === "project" ? "gap-3" : undefined}>
        <Field data-disabled={saving}>
          <FieldLabel htmlFor={id}>{t(labels.label)}</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={id}
              className="min-w-0 flex-1 basis-48"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
              maxLength={500}
              required
              disabled={saving}
              aria-describedby={failed ? errorId : undefined}
              placeholder={t(labels.label)}
            />
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? t("saving") : t(labels.submit)}
            </Button>
          </div>
          {failed ? <FieldError id={errorId}>{t(labels.error)}</FieldError> : null}
        </Field>
      </FieldGroup>
    </form>
  );
}
