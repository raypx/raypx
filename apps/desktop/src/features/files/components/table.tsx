import type { FileEntry, FileListing } from "@raypx/contracts/local";
import { Await } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FileText, Folder, Pencil, Trash2 } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { useFilesStore } from "../store";

export type FileListingResult = { status: "success"; listing: FileListing } | { status: "error" };
interface FileTableProps {
  request: Promise<FileListingResult>;
  offset: number;
  onOpen: (entry: FileEntry) => unknown;
  onDelete: (entry: FileEntry) => unknown;
  onPage: (offset: number) => unknown;
  onRetry: () => unknown;
}
export function FileTable(props: FileTableProps) {
  const c = useTranslations("common");
  return (
    <Await
      promise={props.request}
      fallback={
        <p role="status" className="p-9 text-center text-muted-foreground">
          {c("loading")}
        </p>
      }
    >
      {(result) =>
        result.status === "error" ? (
          <p
            role="alert"
            className="mb-5 flex items-center gap-2 rounded-lg bg-destructive/8 px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
          >
            {c("error")}
            <Button variant="ghost" onClick={() => void props.onRetry()}>
              {c("refresh")}
            </Button>
          </p>
        ) : (
          <LoadedFileTable {...props} listing={result.listing} />
        )
      }
    </Await>
  );
}
function LoadedFileTable({
  listing,
  offset,
  onOpen,
  onDelete,
  onPage,
}: FileTableProps & { listing: FileListing }) {
  const t = useTranslations("files");
  const c = useTranslations("common");
  const locale = useLocale();
  const busy = useFilesStore((s) => s.busy);
  const setOperation = useFilesStore((s) => s.setOperation);
  return (
    <>
      <div className="max-[1100px]:overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-border py-[11px] pr-3 text-xs font-normal text-muted-foreground">
                {c("name")}
              </th>
              <th className="border-b border-border px-3 py-[11px] text-xs font-normal text-muted-foreground">
                {t("size")}
              </th>
              <th className="border-b border-border px-3 py-[11px] text-xs font-normal text-muted-foreground">
                {t("modified")}
              </th>
              <th className="border-b border-border px-3 py-[11px] text-right text-xs font-normal whitespace-nowrap text-muted-foreground">
                <span className="sr-only">{c("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {listing.entries.map((entry) => (
              <tr key={entry.path}>
                <td className="w-[45%] border-b border-border py-2 pr-3">
                  <button
                    type="button"
                    data-slot="file-entry"
                    className="inline-flex items-center gap-[11px] border-0 bg-transparent py-[7px] text-left text-foreground [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:text-muted-foreground [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
                    disabled={busy || !["file", "directory"].includes(entry.kind)}
                    onClick={() => void onOpen(entry)}
                  >
                    {entry.kind === "directory" ? <Folder size={18} /> : <FileText size={18} />}{" "}
                    {entry.name}
                  </button>
                </td>
                <td className="border-b border-border px-3 py-2 text-muted-foreground">
                  {entry.kind === "directory"
                    ? "—"
                    : new Intl.NumberFormat(locale, { notation: "compact" }).format(entry.size) +
                      " B"}
                </td>
                <td className="border-b border-border px-3 py-2 text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(entry.modifiedAt))}
                </td>
                <td className="border-b border-border px-3 py-2 text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t("rename")}: ${entry.name}`}
                    disabled={busy}
                    onClick={() => setOperation({ type: "move", entry })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${c("delete")}: ${entry.name}`}
                    disabled={busy}
                    onClick={() => void onDelete(entry)}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {listing.entries.length === 0 && (
          <p className="p-9 text-center text-muted-foreground">{t("empty")}</p>
        )}
      </div>
      {listing.total > 100 && (
        <div className="mt-5 flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="icon"
            disabled={busy || offset === 0}
            onClick={() => void onPage(Math.max(0, offset - 100))}
            aria-label={c("previous")}
          >
            <ArrowLeft />
          </Button>
          <span>
            {offset + 1}–{Math.min(offset + 100, listing.total)} / {listing.total}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={busy || offset + 100 >= listing.total}
            onClick={() => void onPage(offset + 100)}
            aria-label={c("next")}
          >
            <ArrowRight />
          </Button>
        </div>
      )}
    </>
  );
}
