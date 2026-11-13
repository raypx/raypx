import { useId, useState, type FormEvent } from "react";
import type { AgentInput } from "@raypx/core/agents";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { SelectField } from "@raypx/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import type { OfferedModel } from "../model.js";
import { useTranslations } from "./i18n.js";

export function AgentForm({
  initial,
  models,
  onSave,
  onClose,
}: {
  initial: AgentInput | null;
  models: readonly OfferedModel[];
  onSave: (input: AgentInput) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [modelId, setModelId] = useState(initial?.model.modelId ?? models[0]?.modelId ?? "");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const missing = modelId !== "" && !models.some((model) => model.modelId === modelId);
  const modelAllowed =
    models.some((model) => model.modelId === modelId) || initial?.model.modelId === modelId;
  const options: { value: string; label: string; disabled?: boolean }[] = models.map((model) => ({
    value: model.modelId,
    label: model.name,
  }));
  if (missing)
    options.push({
      value: modelId,
      label: t("unavailableModel", { model: modelId }),
      disabled: true,
    });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !name.trim() || !modelId || !modelAllowed) return;
    setPending(true);
    setFailed(false);
    try {
      await onSave({ name: name.trim(), instructions, model: { modelId } });
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent closeLabel={t("close")} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t("editAgent") : t("newAgent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={120}
                required
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-instructions`}>{t("instructions")}</FieldLabel>
              <Textarea
                id={`${id}-instructions`}
                value={instructions}
                maxLength={32_000}
                disabled={pending}
                rows={5}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-model`}>{t("model")}</FieldLabel>
              {models.length > 0 ? (
                <SelectField
                  id={`${id}-model`}
                  value={modelId}
                  options={options}
                  placeholder={t("chooseModel")}
                  disabled={pending}
                  onValueChange={setModelId}
                />
              ) : (
                <div
                  id={`${id}-model`}
                  role="status"
                  className="flex flex-col gap-2 text-sm text-muted-foreground"
                >
                  <p>{t("noModels")}</p>
                  {initial && (
                    <p className="wrap-anywhere">
                      {t("unavailableModel", { model: initial.model.modelId })}
                    </p>
                  )}
                </div>
              )}
            </Field>
          </FieldGroup>
          {failed && (
            <p role="alert" className="text-sm text-destructive-text">
              {t("saveError")}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || !modelId || !modelAllowed}>
              {initial ? t("save") : t("createAgent")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
