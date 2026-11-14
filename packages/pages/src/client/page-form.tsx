import { useId, useState, type FormEvent, type RefObject } from "react";
import type { AgentId } from "@raypx/core/agents";
import type { PageInput, PageVersion } from "@raypx/core/pages";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { SelectField } from "@raypx/ui/select-field";
import { useTranslations } from "./i18n.js";

export function PageForm({
  initial,
  agents,
  onSave,
  onClose,
  finalFocus,
}: {
  initial?: PageVersion;
  agents: readonly { id: AgentId; name: string }[];
  onSave(this: void, input: PageInput): Promise<void>;
  onClose(this: void): void;
  finalFocus: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("pages");
  const id = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<PageInput["kind"]>(initial?.kind ?? "document");
  const [agentId, setAgentId] = useState(initial?.agentId ?? "none");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || pending) return;
    setPending(true);
    setFailed(false);
    try {
      await onSave({
        title: title.trim(),
        kind,
        agentId: agentId === "none" ? null : (agentId as AgentId),
        body,
      });
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t("close")} finalFocus={finalFocus} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("rename") : t("newPage")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-title`}>{t("name")}</FieldLabel>
              <Input
                id={`${id}-title`}
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={pending}
              />
            </Field>
            {!initial && (
              <>
                <Field>
                  <FieldLabel htmlFor={`${id}-kind`}>{t("kind")}</FieldLabel>
                  <SelectField
                    id={`${id}-kind`}
                    value={kind}
                    onValueChange={setKind}
                    disabled={pending}
                    options={[
                      { value: "document", label: t("document") },
                      { value: "html", label: t("html") },
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-agent`}>{t("maintainer")}</FieldLabel>
                  <SelectField
                    id={`${id}-agent`}
                    value={agentId}
                    onValueChange={setAgentId}
                    disabled={pending}
                    options={[
                      { value: "none", label: t("noAgent") },
                      ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-source`}>{t("source")}</FieldLabel>
                  <Textarea
                    id={`${id}-source`}
                    value={body}
                    rows={8}
                    maxLength={262144}
                    onChange={(event) => setBody(event.target.value)}
                    disabled={pending}
                  />
                </Field>
              </>
            )}
          </FieldGroup>
          {failed && <p role="alert">{t("error")}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {initial ? t("rename") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
