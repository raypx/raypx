import { Button } from "@raypx/ui/components/ui/button";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { useTranslations } from "@raypx/i18n/browser";
import { isDirty, useFilesStore } from "../store.tsx";

export function FileEditor({ onSave, onClose }: { onSave: () => unknown; onClose: () => unknown }) {
  const t = useTranslations("files");
  const c = useTranslations("common");
  const editor = useFilesStore((s) => s.editor);
  const busy = useFilesStore((s) => s.busy);
  const dirty = useFilesStore(isDirty);
  const setText = useFilesStore((s) => s.setText);
  if (!editor) return null;
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 font-mono text-sm wrap-anywhere">{editor.path}</h2>
        <div className="flex flex-wrap items-center gap-2">
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
        className="min-h-90 w-full resize-y rounded-none border-0 p-4 font-mono text-sm leading-relaxed [tab-size:2] focus-visible:-outline-offset-2"
        value={editor.text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        disabled={busy}
      />
    </section>
  );
}
