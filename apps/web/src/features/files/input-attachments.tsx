import type { CloudAssetVersionDto } from "@voidmix/contracts";
import { Button } from "@voidmix/ui/components/ui/button";
import { useTranslations } from "../../i18n/client";
export function InputAttachments({
  attachments,
  uploading,
  disabled = false,
  failed,
  onUpload,
  onRemove,
}: {
  attachments: readonly CloudAssetVersionDto[];
  uploading: boolean;
  disabled?: boolean;
  failed: boolean;
  onUpload(file: File): void;
  onRemove(id: string): void;
}) {
  const t = useTranslations("cloud");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="cursor-pointer rounded-lg border border-input px-3 py-2 focus-within:ring-2 focus-within:ring-ring has-disabled:opacity-50">
          {uploading ? t("uploading") : t("attach")}
          <input
            className="sr-only"
            type="file"
            accept=".csv,.xlsx,.md,.markdown,.txt,.pdf"
            disabled={disabled || uploading || attachments.length >= 20}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <span className="text-xs text-muted-foreground">{t("fileLimit")}</span>
      </div>
      {failed ? <p role="alert">{t("uploadFailed")}</p> : null}
      {attachments.length ? (
        <ul className="flex flex-col gap-2">
          {attachments.map((asset) => (
            <li key={asset.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{asset.name}</span>
              <Button
                variant="ghost"
                aria-label={`${t("remove")} ${asset.name}`}
                disabled={uploading}
                onClick={() => onRemove(asset.id)}
              >
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
