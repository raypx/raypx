import { useTranslations } from "./i18n.js";
import { useId } from "react";

import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { InputGroup, InputGroupTextarea } from "@raypx/ui/components/ui/input-group";
import { cn } from "@raypx/ui/lib/utils";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { EditIcon } from "@raypx/icons/edit";
import { ComposerContextFields } from "./composer/context-fields.js";
import { ComposerAttachments } from "./composer/attachments.js";
import { ComposerDraftActions } from "./composer/draft-actions.js";
import { ComposerDraftList } from "./composer/draft-list.js";
import { ComposerTargetOptions } from "./composer/target-options.js";
import { ModelPicker } from "./model-picker.js";
import { useTaskComposer, type TaskComposerProps } from "./use-task-composer.js";
import { submitShortcut } from "./submit-shortcut.js";

export type { ComposerDraft as TaskComposerDraft } from "../model/composer.js";

export function TaskComposer(props: TaskComposerProps) {
  return (
    <TaskComposerView
      key={JSON.stringify([props.draftKey, props.fixedDeviceId, props.fixedProjectId])}
      {...props}
    />
  );
}

function TaskComposerView(props: TaskComposerProps) {
  const { client, devices, local, guest, promptRef, fixedProjectId } = props;
  const t = useTranslations("tasks");
  const fieldId = useId();
  const composer = useTaskComposer(props);
  const { state, view, edit, expanded } = composer;
  const busy = state.busy || composer.uploading;
  return (
    <div data-task-composer className="flex flex-col gap-3">
      <Collapsible
        open={expanded}
        onOpenChange={composer.expand}
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-background",
          // The page's New session action opens an empty editor; a collapsed draft stays visible.
          !expanded && !view.draftable && props.onEditorOpenChange && "hidden",
        )}
      >
        <CollapsibleTrigger
          aria-label={t(expanded ? "collapseComposer" : "openComposer")}
          render={
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="group h-auto min-h-control-lg w-full justify-start gap-2 rounded-none bg-sidebar py-2 text-left focus-visible:ring-inset"
            />
          }
        >
          <EditIcon aria-hidden="true" className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {expanded ? t("composerTitle") : state.prompt.trim() || t("composerPreview")}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent keepMounted>
          <form
            aria-label={t("create")}
            onSubmit={(event) => void composer.submit(event)}
            className="@container border-t border-border p-3 @md/main:p-4"
          >
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor={`${fieldId}-prompt`} className="sr-only">
                  {t("prompt")}
                </FieldLabel>
                <InputGroup>
                  <InputGroupTextarea
                    ref={promptRef}
                    id={`${fieldId}-prompt`}
                    className="field-sizing-content max-h-80 min-h-28 resize-y overflow-y-auto"
                    required
                    maxLength={32000}
                    value={state.prompt}
                    placeholder={t("promptPlaceholder")}
                    disabled={busy}
                    onChange={(event) => edit({ type: "prompt", prompt: event.target.value })}
                    onKeyDown={submitShortcut}
                  />
                </InputGroup>
              </Field>
              {client.attachments && composer.contextTarget && (
                <ComposerAttachments
                  client={client.attachments}
                  scope={props.draftKey}
                  selection={state.contextSelection}
                  busy={busy}
                  uploading={composer.uploading}
                  error={composer.uploadError}
                  onAdd={(file) => void composer.addAttachment(file)}
                  onRemove={(id) =>
                    edit({
                      type: "context",
                      selection: {
                        sources:
                          state.contextSelection?.sources.filter((source) => source.id !== id) ??
                          [],
                      },
                    })
                  }
                />
              )}
              <ComposerTargetOptions
                open={props.optionsOpen}
                onOpenChange={props.onOptionsOpenChange}
                devices={devices}
                selection={view.selection}
                value={state}
                local={local}
                guest={Boolean(guest)}
                busy={busy}
                targetFixed={Boolean(fixedProjectId)}
                onChange={edit}
              />
              {view.selection.requiresModel && local && client.models && (
                <ModelPicker
                  compact
                  client={client.models}
                  value={state.model}
                  disabled={busy}
                  onReady={composer.modelReady}
                  onChange={(model) => edit({ type: "model", model })}
                />
              )}
              {composer.context && (
                <ComposerContextFields
                  context={composer.context}
                  busy={busy}
                  targetFixed={Boolean(fixedProjectId)}
                  onSelect={(selection) => edit({ type: "context", selection })}
                  onBudget={composer.budget}
                />
              )}
              {view.occupied && view.prompted && (
                <p role="status" className="text-sm">
                  {t("PROJECT_BUSY")}
                </p>
              )}
              {!view.available && !guest && (
                <p className="text-sm text-muted-foreground">{t("availabilityHint")}</p>
              )}
              {guest && <p className="text-sm text-muted-foreground">{t("guestSendHint")}</p>}
              {state.error && (
                <p role="alert" className="text-sm text-destructive">
                  {t(state.error)}
                </p>
              )}
              <ComposerDraftActions
                busy={busy}
                empty={!view.draftable && !state.draftId}
                prompted={view.draftable}
                sendable={view.sendable && !composer.uploading}
                guest={Boolean(guest)}
                draftsReady={composer.draftsReady}
                status={state.draftStatus}
                storageFailed={composer.draftsFailed}
                onNew={() => void composer.newDraft()}
                onSave={composer.saveDraft}
              />
            </FieldGroup>
          </form>
        </CollapsibleContent>
      </Collapsible>
      <ComposerDraftList
        drafts={composer.drafts}
        devices={devices}
        activeId={state.draftId}
        busy={busy}
        onOpen={(draft) => void composer.openDraft(draft)}
        onDelete={composer.deleteDraft}
      />
      {composer.dialog}
    </div>
  );
}
