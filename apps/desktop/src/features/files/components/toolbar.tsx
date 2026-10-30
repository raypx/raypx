import type { RootGrant } from "@raypx/contracts/local";
import { ArrowUp, Folder, Plus } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { SelectField } from "@raypx/ui/select-field";
import { useTranslations } from "@raypx/i18n/browser";
import { useFilesStore } from "../store";

export function FilesToolbar({
  roots,
  rootId,
  path,
  onDirectory,
  onRefresh,
}: {
  roots: RootGrant[];
  rootId: string;
  path: string;
  onDirectory: (rootId: string, path: string) => unknown;
  onRefresh: () => unknown;
}) {
  const t = useTranslations("files");
  const c = useTranslations("common");
  const busy = useFilesStore((s) => s.busy);
  const setOperation = useFilesStore((s) => s.setOperation);
  return (
    <div className="flex flex-wrap items-center gap-3.5 pb-5">
      <SelectField
        aria-label={t("roots")}
        className="w-52 max-w-full"
        value={roots.some((root) => root.id === rootId) ? rootId : null}
        placeholder={t("roots")}
        disabled={busy || roots.length === 0}
        onValueChange={(value) => void onDirectory(value, "")}
        options={roots.map((root) => ({ value: root.id, label: root.name }))}
      />
      <span
        className="min-w-[50px] flex-1 truncate font-mono text-muted-foreground"
        title={path || "/"}
      >
        {path || "/"}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.25 @max-4xl/main:ml-0">
        <Button
          variant="ghost"
          size="icon"
          disabled={!path || busy}
          onClick={() => void onDirectory(rootId, path.split("/").slice(0, -1).join("/"))}
          aria-label={t("up")}
        >
          <ArrowUp />
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setOperation({ type: "file" })}>
          <Plus size={16} />
          {t("createFile")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setOperation({ type: "folder" })}>
          <Folder size={16} />
          {t("createFolder")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void onRefresh()}>
          {c("refresh")}
        </Button>
      </div>
    </div>
  );
}
