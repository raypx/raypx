import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { SkillAvailability, Skill } from "@raypx/core/skills";
import type { SpaceId } from "@raypx/core/spaces";
import { ReplyMarkdown } from "@raypx/blocks/markdown";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import { IconButton } from "@raypx/ui/icon-button";
import { TooltipProvider } from "@raypx/ui/components/ui/tooltip";
import { useConfirmation } from "@raypx/ui/confirmation";
import { EditIcon } from "@raypx/icons/edit";
import { DeleteIcon } from "@raypx/icons/delete";
import {
  SkillsController,
  beginSkillEdit,
  skillFormContent,
  type SkillEditorState,
  type SkillsPort,
} from "../model/skills.js";
import { useTranslations } from "./i18n.js";

export interface SkillsSettingsProps {
  spaceId: SpaceId;
  spaces: readonly { id: SpaceId; name: string }[];
  port: SkillsPort;
}
export function SkillsSettings(props: SkillsSettingsProps) {
  const [controller, setController] = useState<SkillsController | null>(null);
  useEffect(() => {
    let cancelled = false;
    const next = new SkillsController(props.port, props.spaceId);
    queueMicrotask(() => {
      if (cancelled) return;
      setController(next);
      void next.load();
    });
    return () => {
      cancelled = true;
      next.dispose();
    };
  }, [props.port, props.spaceId]);
  if (!controller || controller.spaceId !== props.spaceId) return null;
  return <SkillsSettingsEditor key={props.spaceId} controller={controller} spaces={props.spaces} />;
}
export function SkillsSettingsEditor({
  controller,
  spaces,
}: {
  controller: SkillsController;
  spaces: SkillsSettingsProps["spaces"];
}) {
  const t = useTranslations("skills");
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [editor, setEditor] = useState<SkillEditorState | null>(null);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const confirmation = useConfirmation();
  const id = useId();
  function rememberFocus() {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  function edit(skill: Skill | null) {
    rememberFocus();
    controller.clearError();
    setEditor(beginSkillEdit(skill));
  }
  async function remove(skill: Skill) {
    const accepted = await confirmation.confirm({
      requestKey: skill.id,
      title: t("deleteTitle", { name: skill.name }),
      description: t("deleteHint"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (accepted) await controller.remove(skill.id);
  }
  async function importFile(event: FormEvent) {
    event.preventDefault();
    if (!file || view.busy) return;
    await controller.importFile(file);
    if (controller.getSnapshot().report) {
      setFile(null);
      setImporting(false);
    }
  }
  return (
    <TooltipProvider escapeKeyBubbles>
      <section
        aria-labelledby={`${id}-title`}
        className="flex min-w-0 flex-col gap-4 border-b border-border py-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${id}-title`} className="text-lg font-medium">
            {t("title")}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={view.busy || view.loading}
              onClick={() => {
                rememberFocus();
                controller.closeReport();
                controller.clearError();
                setFile(null);
                setImporting(true);
              }}
            >
              {t("import")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={view.busy || view.loading}
              onClick={() => edit(null)}
            >
              {t("add")}
            </Button>
          </div>
        </div>
        {view.loading && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("loading")}
          </p>
        )}
        {view.error && !editor && !importing && (
          <p role="alert" className="text-sm text-destructive-text">
            {t(`errors.${view.error}`)}
          </p>
        )}
        {view.error === "load" && (
          <Button variant="outline" onClick={() => void controller.load()}>
            {t("refresh")}
          </Button>
        )}
        {!view.loading && !view.error && view.skills.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        <ul className="flex min-w-0 flex-col divide-y divide-border">
          {view.skills.map((skill) => {
            let availability = t("allSpaces");
            if (skill.ownership === "space") availability = t("agentCreated");
            else if (skill.availability.mode === "selected") {
              const selectedIds = skill.availability.spaceIds;
              availability =
                spaces
                  .filter(({ id: spaceId }) => selectedIds.includes(spaceId))
                  .map(({ name }) => name)
                  .join(", ") || t("noSpaces");
            }
            return (
              <li key={skill.id} className="flex min-w-0 flex-col gap-1 py-3">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium wrap-anywhere">{skill.name}</p>
                    <p className="text-sm text-muted-foreground wrap-anywhere">
                      {skill.description}
                    </p>
                  </div>
                  <IconButton
                    size="icon-sm"
                    label={t("editNamed", { name: skill.name })}
                    disabled={view.busy}
                    onClick={() => edit(skill)}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="icon-sm"
                    label={t("deleteNamed", { name: skill.name })}
                    disabled={view.busy}
                    onClick={() => void remove(skill)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </div>
                <p className="text-xs text-muted-foreground wrap-anywhere">
                  {t("availability")}: {availability}
                </p>
              </li>
            );
          })}
        </ul>
        <Dialog
          open={editor !== null}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
        >
          <DialogContent
            closeLabel={t("close")}
            className="sm:max-w-3xl"
            finalFocus={() => (returnFocus.current?.isConnected ? returnFocus.current : false)}
          >
            <DialogHeader>
              <DialogTitle>{t(editor?.current ? "edit" : "add")}</DialogTitle>
            </DialogHeader>
            {editor && (
              <SkillForm
                editor={editor}
                spaces={spaces}
                pending={view.busy}
                error={view.error === "save"}
                onChange={setEditor}
                onClose={() => setEditor(null)}
                onSave={async () => {
                  if (await controller.save(editor)) setEditor(null);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
        <Dialog
          open={importing}
          onOpenChange={(open) => {
            if (!open) {
              setImporting(false);
              setFile(null);
            }
          }}
        >
          <DialogContent
            closeLabel={t("close")}
            finalFocus={() => (returnFocus.current?.isConnected ? returnFocus.current : false)}
          >
            <DialogHeader>
              <DialogTitle>{t("import")}</DialogTitle>
            </DialogHeader>
            <form
              className="flex min-w-0 flex-col gap-4"
              onSubmit={(event) => void importFile(event)}
            >
              <Field>
                <FieldLabel htmlFor={`${id}-package`}>{t("import")}</FieldLabel>
                <Input
                  id={`${id}-package`}
                  type="file"
                  accept=".md,.markdown,.zip"
                  disabled={view.busy}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">{t("importHint")}</p>
              </Field>
              {view.error && (
                <p role="alert" className="text-sm text-destructive-text">
                  {t(`errors.${view.error}`)}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImporting(false);
                    setFile(null);
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={!file || view.busy}>
                  {t("import")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={view.report !== null}
          onOpenChange={(open) => {
            if (!open) controller.closeReport();
          }}
        >
          <DialogContent
            closeLabel={t("close")}
            finalFocus={() => (returnFocus.current?.isConnected ? returnFocus.current : false)}
          >
            <DialogHeader>
              <DialogTitle>{t("importTitle")}</DialogTitle>
            </DialogHeader>
            {view.report && (
              <div className="min-w-0 space-y-3 text-sm">
                <p className="wrap-anywhere">{t("installed", { name: view.report.skill.name })}</p>
                {view.report.omitted.length > 0 ? (
                  <>
                    <p>{t("omitted")}</p>
                    <ul className="list-inside list-disc">
                      {view.report.omitted.map((item) => (
                        <li key={item.name} className="wrap-anywhere">
                          {item.name}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>{t("noneOmitted")}</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => controller.closeReport()}>{t("close")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {confirmation.dialog}
      </section>
    </TooltipProvider>
  );
}
function SkillForm({
  editor,
  spaces,
  pending,
  error,
  onChange,
  onSave,
  onClose,
}: {
  editor: SkillEditorState;
  spaces: SkillsSettingsProps["spaces"];
  pending: boolean;
  error: boolean;
  onChange: (editor: SkillEditorState) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!skillFormContent(editor.draft)) {
      setInvalid(true);
      return;
    }
    if (!pending) void onSave();
  }
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>{t("name")}</FieldLabel>
          <Input
            id={`${id}-name`}
            autoComplete="off"
            required
            maxLength={120}
            disabled={pending}
            value={editor.draft.name}
            onChange={(event) =>
              onChange({ ...editor, draft: { ...editor.draft, name: event.target.value } })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-description`}>{t("description")}</FieldLabel>
          <Input
            id={`${id}-description`}
            autoComplete="off"
            required
            maxLength={500}
            disabled={pending}
            value={editor.draft.description}
            onChange={(event) =>
              onChange({ ...editor, draft: { ...editor.draft, description: event.target.value } })
            }
          />
        </Field>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-body`}>{t("source")}</FieldLabel>
            <Textarea
              id={`${id}-body`}
              maxLength={64_000}
              rows={10}
              disabled={pending}
              value={editor.draft.body}
              onChange={(event) =>
                onChange({ ...editor, draft: { ...editor.draft, body: event.target.value } })
              }
              className="font-mono text-sm"
            />
          </Field>
          <section aria-label={t("preview")} className="min-w-0">
            <h3 className="mb-2 text-sm font-medium">{t("preview")}</h3>
            <div className="max-h-80 min-h-40 overflow-auto rounded-lg border p-3 text-sm">
              <ReplyMarkdown
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
                copyErrorLabel={t("copyFailed")}
              >
                {editor.draft.body}
              </ReplyMarkdown>
            </div>
          </section>
        </div>
        {spaces.length > 1 && editor.current?.ownership !== "space" && (
          <SkillAvailabilityField
            availability={editor.availability}
            spaces={spaces}
            disabled={pending}
            onChange={(availability) => onChange({ ...editor, availability })}
          />
        )}
      </FieldGroup>
      {invalid && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("invalid")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("errors.save")}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          disabled={pending || !editor.draft.name.trim() || !editor.draft.description.trim()}
        >
          {t(editor.current ? "save" : "create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
function SkillAvailabilityField({
  availability,
  spaces,
  disabled,
  onChange,
}: {
  availability: SkillAvailability;
  spaces: SkillsSettingsProps["spaces"];
  disabled: boolean;
  onChange: (value: SkillAvailability) => void;
}) {
  const t = useTranslations("skills");
  const id = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">{t("availability")}</legend>
      <RadioGroup
        value={availability.mode}
        disabled={disabled}
        onValueChange={(value) => {
          if (value === "all") onChange({ mode: "all" });
          if (value === "selected") onChange({ mode: "selected", spaceIds: [] });
        }}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${id}-all`} value="all" data-value="all" />
          <label htmlFor={`${id}-all`} className="text-sm">
            {t("allSpaces")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${id}-selected`} value="selected" data-value="selected" />
          <label htmlFor={`${id}-selected`} className="text-sm">
            {t("chosenSpaces")}
          </label>
        </div>
      </RadioGroup>
      {availability.mode === "selected" && (
        <div className="flex flex-col gap-2 pl-6">
          {spaces.map((space) => (
            <label key={space.id} className="flex items-center gap-2 text-sm wrap-anywhere">
              <Checkbox
                disabled={disabled}
                checked={availability.spaceIds.includes(space.id)}
                onCheckedChange={(checked) =>
                  onChange({
                    mode: "selected",
                    spaceIds: checked
                      ? [...availability.spaceIds, space.id]
                      : availability.spaceIds.filter((selectedId) => selectedId !== space.id),
                  })
                }
              />
              {space.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
