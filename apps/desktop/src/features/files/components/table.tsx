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
        <p role="status" className="p-9 text-center text-muted-foreground">
          {c("loading")}
        </p>
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
  return (
    <>
      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{c("name")}</TableHead>
              <TableHead>{t("size")}</TableHead>
              <TableHead>{t("modified")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{c("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listing.entries.map((entry) => (
              <TableRow key={entry.path}>
                <TableCell className="w-[45%] whitespace-normal">
                  <Button
                    variant="ghost"
                    data-slot="file-entry"
                    className="h-auto max-w-full justify-start px-0 py-2 text-left whitespace-normal wrap-anywhere"
                    disabled={busy || !["file", "directory"].includes(entry.kind)}
                    onClick={() => void onOpen(entry)}
                  >
                    {entry.kind === "directory" ? (
                      <FolderIcon data-icon="inline-start" />
                    ) : (
                      <FileTextIcon data-icon="inline-start" />
                    )}{" "}
                    {entry.name}
                  </Button>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.kind === "directory" ? "—" : `${format.number(entry.size, "compact")} B`}
                </TableCell>
                <TableCell className="text-muted-foreground">
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
          <p className="p-9 text-center text-muted-foreground">{t("empty")}</p>
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
