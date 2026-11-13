import { useId, useState, type FormEvent } from "react";
import type { AgentInput } from "@raypx/core/agents";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { ModelPicker } from "./model-picker.js";
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
  onOpenModels,
}: {
  initial: AgentInput | null;
  models: readonly OfferedModel[];
  onSave: (input: AgentInput) => Promise<void>;
  onClose: () => void;
  onOpenModels?: (() => void) | undefined;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [modelId, setModelId] = useState(initial?.model.modelId ?? models[0]?.modelId ?? "");
  const [allowSharedMemory, setAllowSharedMemory] = useState(initial?.allowSharedMemory ?? false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const modelAllowed =
    models.some((model) => model.modelId === modelId) || initial?.model.modelId === modelId;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !name.trim() || !modelId || !modelAllowed) return;
    setPending(true);
    setFailed(false);
    try {
      await onSave({
        name: name.trim(),
        instructions,
        model: { modelId },
        ...(initial?.allowSharedMemory !== undefined || allowSharedMemory
          ? { allowSharedMemory }
          : {}),
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
              <ModelPicker
                id={`${id}-model`}
                models={models}
                value={modelId}
                disabled={pending}
                onValueChange={setModelId}
                onOpenModels={onOpenModels}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-shared-memory`}
                checked={allowSharedMemory}
                disabled={pending}
                onCheckedChange={setAllowSharedMemory}
              />
              <FieldLabel htmlFor={`${id}-shared-memory`}>{t("allowSharedMemory")}</FieldLabel>
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
