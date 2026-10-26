import type { ComponentProps } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { LoadingState } from "@raypx/ui/loading-state";
import { TaskComposer } from "./task-composer.js";
import { useTaskDrafts } from "./use-task-drafts.js";
import { createTaskDraft } from "../model/drafts.js";

/** Applications opt into an editor slot distinct from explicitly saved drafts. */
export function PersistentTaskComposer(props: ComponentProps<typeof TaskComposer>) {
  const editor = useTaskDrafts(JSON.stringify(["raypx.task-editor.v1", props.draftKey]));
  const c = useTranslations("common"),
    t = useTranslations("tasks");
  if (!editor.ready) return <LoadingState label={c("loading")} />;
  return (
    <>
      {editor.failed && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("draftSaveFailed")}
        </p>
      )}
      <TaskComposer
        {...props}
        initialDraft={props.initialDraft ?? editor.drafts[0]}
        onEditorChange={(input) =>
          editor.write(input.prompt.trim() ? [createTaskDraft(input, "editor")] : [])
        }
      />
    </>
  );
}
