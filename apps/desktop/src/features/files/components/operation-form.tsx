import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { useTranslations } from "@raypx/i18n/browser";
import { formText } from "../../../form-data";
import { useFilesStore } from "../store";

export function FileOperationForm({ onSubmit }: { onSubmit: (value: string) => unknown }) {
  const t = useTranslations("files");
  const c = useTranslations("common");
  const operation = useFilesStore((s) => s.operation);
  const busy = useFilesStore((s) => s.busy);
  const setOperation = useFilesStore((s) => s.setOperation);
  if (!operation) return null;
  return (
    <form
      key={operation.type === "move" ? operation.entry.path : operation.type}
      className="mb-5 flex items-center gap-3 rounded-[10px] border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(formText(new FormData(event.currentTarget), "path").trim());
      }}
    >
      <label htmlFor="file-path" className="text-xs whitespace-nowrap">
        {operation.type === "move" ? t("destination") : t("path")}
      </label>
      <Input
        id="file-path"
        className="flex-1"
        name="path"
        autoFocus
        required
        defaultValue={operation.type === "move" ? operation.entry.path : ""}
        disabled={busy}
      />
      <Button type="submit" disabled={busy}>
        {c("save")}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => setOperation(null)}>
        {c("cancel")}
      </Button>
    </form>
  );
}
