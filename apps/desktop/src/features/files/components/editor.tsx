import { Button } from "@raypx/ui/components/ui/button";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { useTranslations } from "@raypx/i18n/browser";
import { isDirty, useFilesStore } from "../store";

export function FileEditor({ onSave, onClose }: { onSave: () => unknown; onClose: () => unknown }) {
  const t = useTranslations("files");
  const c = useTranslations("common");
  const editor = useFilesStore((s) => s.editor);
  const busy = useFilesStore((s) => s.busy);
  const dirty = useFilesStore(isDirty);
  const setText = useFilesStore((s) => s.setText);
  if (!editor) return null;
  return (
    <section className="mt-7 overflow-hidden rounded-[10px] border border-border">
      <div className="flex items-center justify-between gap-5 border-b border-border px-4 py-3">
        <h2 className="font-mono text-[13px] [overflow-wrap:anywhere]">{editor.path}</h2>
        <div className="flex flex-wrap items-center gap-5">
          <Button variant="ghost" disabled={busy} onClick={() => void onClose()}>
            {c("close")}
          </Button>
          <Button disabled={busy || !dirty} onClick={() => void onSave()}>
            {busy ? c("working") : c("save")}
          </Button>
        </div>
      </div>
      <label htmlFor="file-editor" className="sr-only">
        {t("editor")}
      </label>
      <Textarea
        id="file-editor"
        className="min-h-90 w-full resize-y border-0 bg-background p-5 font-mono text-[13px] leading-[1.7] text-foreground [tab-size:2] focus-visible:-outline-offset-2"
        value={editor.text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        disabled={busy}
      />
    </section>
  );
}
