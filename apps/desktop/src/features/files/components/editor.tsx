import { useEffect, useRef } from "react";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { useTranslations } from "@raypx/i18n/browser";
import { isDirty, useFilesStore } from "../store.tsx";

export function FileEditor({ onSave, onClose }: { onSave: () => unknown; onClose: () => unknown }) {
  const t = useTranslations("files");
  const c = useTranslations("common");
  const editor = useFilesStore((s) => s.editor);
  const busy = useFilesStore((s) => s.busy);
  const notice = useFilesStore((s) => s.notice);
  const focusVersion = useFilesStore((s) => s.focusVersion);
  const dirty = useFilesStore(isDirty);
  const setText = useFilesStore((s) => s.setText);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const focused = useRef<{ rootId: string; path: string; version: number } | null>(null);
  const rootId = editor?.rootId;
  const path = editor?.path;
  useEffect(() => {
    if (rootId === undefined || path === undefined) {
      focused.current = null;
      return;
    }
    if (
      busy ||
      (focused.current?.rootId === rootId &&
        focused.current.path === path &&
        focused.current.version === focusVersion)
    )
      return;
    textarea.current?.focus();
    focused.current = { rootId, path, version: focusVersion };
  }, [busy, focusVersion, path, rootId]);
  if (!editor) return null;
  return (
    <section
      aria-labelledby="file-editor-title"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border @3xl/main:h-full @3xl/main:min-h-0"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <h2 id="file-editor-title" className="min-w-0 flex-1 font-mono text-sm wrap-anywhere">
          {editor.path}
        </h2>
        {dirty && <Badge variant="secondary">{t("unsavedChanges")}</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            aria-label={t("backToList")}
            disabled={busy}
            onClick={() => void onClose()}
          >
            <ArrowLeftIcon data-icon="inline-start" className="@3xl/main:hidden" />
            <span className="@3xl/main:hidden">{t("backToList")}</span>
            <span className="hidden @3xl/main:inline">{c("close")}</span>
          </Button>
          <Button
            aria-keyshortcuts="Control+S Meta+S"
            disabled={busy || !dirty}
            onClick={() => void onSave()}
          >
            {busy ? c("working") : c("save")}
          </Button>
        </div>
      </div>
      {notice && !dirty && (
        <p role="status" className="border-b border-border bg-muted/40 px-4 py-2 text-sm">
          {t(notice)}
        </p>
      )}
      <label htmlFor="file-editor" className="sr-only">
        {t("editor")}
      </label>
      <Textarea
        ref={textarea}
        id="file-editor"
        className="field-sizing-fixed min-h-[50dvh] w-full resize-y rounded-none border-0 p-4 font-mono text-sm leading-relaxed [tab-size:2] focus-visible:-outline-offset-2 @3xl/main:min-h-0 @3xl/main:flex-1 @3xl/main:resize-none"
        value={editor.text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.defaultPrevented ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229 ||
            event.altKey ||
            event.shiftKey ||
            !(event.metaKey || event.ctrlKey) ||
            event.key.toLowerCase() !== "s"
          )
            return;
          event.preventDefault();
          if (!event.repeat && !busy && dirty && !event.currentTarget.disabled) void onSave();
        }}
        spellCheck={false}
        disabled={busy}
      />
    </section>
  );
}
