import type { FileEntry, FileListing } from "@raypx/contracts/local";
import { Await } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { FileTextIcon } from "@raypx/icons/file-text";
import { FolderIcon } from "@raypx/icons/folder";
import { EditIcon } from "@raypx/icons/edit";
import { DeleteIcon } from "@raypx/icons/delete";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/ui/table";
import { IconButton } from "@raypx/ui/icon-button";
import { EmptyState } from "@raypx/ui/empty-state";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { useFilesStore } from "../store.tsx";

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
        <div role="status" aria-label={c("loading")} className="flex flex-col gap-4 py-4">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} aria-hidden="true" className="flex items-center gap-3">
              <Skeleton className="size-5 shrink-0" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      }
    >
      {(result) =>
        result.status === "error" ? (
          <Alert variant="destructive" className="mb-5">
            <AlertDescription>{c("error")}</AlertDescription>
            <AlertAction>
              <Button variant="ghost" size="sm" onClick={() => void props.onRetry()}>
                {c("refresh")}
              </Button>
            </AlertAction>
          </Alert>
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
  const format = useFormatter();
  const busy = useFilesStore((s) => s.busy);
  const setOperation = useFilesStore((s) => s.setOperation);
  const selectedPath = useFilesStore((s) => s.editor?.path);
  return (
    <>
      <div className="@container/file-list min-w-0 overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>{c("name")}</TableHead>
              <TableHead className="@max-lg/file-list:hidden">{t("size")}</TableHead>
              <TableHead className="@max-lg/file-list:hidden">{t("modified")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{c("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listing.entries.map((entry) => (
              <TableRow
                key={entry.path}
                data-state={
                  entry.kind === "file" && selectedPath === entry.path ? "selected" : undefined
                }
              >
                <TableCell className="w-full max-w-0 @lg/file-list:w-[45%]">
                  <Button
                    variant="ghost"
                    data-slot="file-entry"
                    data-file-path={entry.path}
                    aria-label={entry.name}
                    aria-current={
                      entry.kind === "file" && selectedPath === entry.path ? "true" : undefined
                    }
                    className="h-auto min-h-10 w-full justify-start px-1 py-2 text-left"
                    disabled={busy || !["file", "directory"].includes(entry.kind)}
                    onClick={() => void onOpen(entry)}
                  >
                    {entry.kind === "directory" ? (
                      <FolderIcon data-icon="inline-start" />
                    ) : (
                      <FileTextIcon data-icon="inline-start" />
                    )}
                    <span className="min-w-0 flex-1" title={entry.name}>
                      <span className="block truncate">{entry.name}</span>
                      {entry.kind === "file" && (
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground tabular-nums @lg/file-list:hidden">{`${format.number(entry.size, "compact")} B`}</span>
                      )}
                    </span>
                  </Button>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums @max-lg/file-list:hidden">
                  {entry.kind === "directory" ? "—" : `${format.number(entry.size, "compact")} B`}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums @max-lg/file-list:hidden">
                  {format.dateTime(new Date(entry.modifiedAt), {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <IconButton
                    label={`${t("rename")}: ${entry.name}`}
                    disabled={busy}
                    onClick={() => setOperation({ type: "move", entry })}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    label={`${c("delete")}: ${entry.name}`}
                    disabled={busy}
                    onClick={() => void onDelete(entry)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {listing.entries.length === 0 && (
          <EmptyState
            title={t("empty")}
            icon={<FolderIcon aria-hidden="true" />}
            className="py-12"
          />
        )}
      </div>
      {listing.total > 100 && (
        <div className="mt-5 flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <IconButton
            variant="outline"
            disabled={busy || offset === 0}
            onClick={() => void onPage(Math.max(0, offset - 100))}
            label={c("previous")}
          >
            <ArrowLeftIcon />
          </IconButton>
          <span className="tabular-nums">
            {offset + 1}–{Math.min(offset + 100, listing.total)} / {listing.total}
          </span>
          <IconButton
            variant="outline"
            disabled={busy || offset + 100 >= listing.total}
            onClick={() => void onPage(offset + 100)}
            label={c("next")}
          >
            <ArrowRightIcon />
          </IconButton>
        </div>
      )}
    </>
  );
}
