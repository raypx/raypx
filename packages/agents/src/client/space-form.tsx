import { useId, useState, type FormEvent } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import { useTranslations } from "./i18n.js";

export function SpaceForm({
  onSave,
  onClose,
}: {
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !name.trim()) return;
    setPending(true);
    setFailed(false);
    try {
      await onSave(name.trim());
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
      <DialogContent closeLabel={t("close")}>
        <DialogHeader>
          <DialogTitle>{t("newSpace")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={id}>{t("spaceName")}</FieldLabel>
            <Input
              id={id}
              value={name}
              maxLength={120}
              required
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </Field>
          {failed && (
            <p role="alert" className="text-sm text-destructive-text">
              {t("saveError")}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {t("createSpace")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
