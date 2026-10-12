import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import type { ApiClient } from "@voidmix/client";
import type { CloudAssetVersionDto } from "@voidmix/contracts";
import { ArtifactList, ArtifactPreview, type ArtifactContent } from "@voidmix/agent-ui/artifacts";
import { useTranslations } from "../../i18n/client";

export function CloudArtifacts({
  api,
  artifacts,
}: {
  api: ApiClient;
  artifacts: readonly CloudAssetVersionDto[];
}) {
  const t = useTranslations("cloud");
  const { identity, queries, resources } = useCloudQueries();
  const [selectedId, setSelectedId] = useState<string>();
  const listed = artifacts.find((asset) => asset.id === selectedId);
  const metadata = useQuery({
    ...queries.asset(selectedId ?? ""),
    enabled: Boolean(listed),
    ...(listed ? { initialData: listed } : {}),
  });
  const selected = listed && !metadata.isError ? (metadata.data ?? listed) : undefined;
  const [preview, setPreview] = useState<{ versionId: string; content: ArtifactContent }>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);
  const [downloadPending, setDownloadPending] = useState(false);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setPreview(undefined);
    setPending(true);
    setFailed(false);
    const retained = resources.files.acquire(identity.accountId, selectedId, async (signal) => {
      const { asset, download } = await api.cloud.assets.preview(
        { assetVersionId: selectedId },
        { signal },
      );
      const media = asset.mediaType;
      if (
        asset.byteSize > 10 * 1024 * 1024 ||
        (!media.startsWith("text/") &&
          media !== "application/pdf" &&
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(media))
      )
        return { content: { kind: "file" as const } };
      if (download.expiresAt.valueOf() <= Date.now()) throw { code: "PREVIEW_URL_EXPIRED" };
      const response = await fetch(download.url, {
        method: "GET",
        headers: download.headers,
        signal,
        credentials: "omit",
      });
      if (!response.ok) throw { code: "PREVIEW_UNAVAILABLE" };
      const blob = await response.blob();
      if (blob.size > 10 * 1024 * 1024) throw { code: "PREVIEW_TOO_LARGE" };
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (media.startsWith("text/"))
        return {
          content: {
            kind: media === "text/markdown" ? ("markdown" as const) : ("text" as const),
            text: await blob.text(),
          },
        };
      const src = URL.createObjectURL(new Blob([blob], { type: media }));
      return {
        content: { kind: media === "application/pdf" ? ("pdf" as const) : ("image" as const), src },
        revoke: () => URL.revokeObjectURL(src),
      };
    });
    void retained.promise
      .then(({ content }) => {
        if (active) setPreview({ versionId: selectedId, content });
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
      retained.release();
    };
  }, [api, identity.accountId, resources, selectedId]);
  async function download() {
    const signal = lifetime.current?.signal;
    if (!selected || downloadPending || !signal || signal.aborted) return;
    setDownloadPending(true);
    setFailed(false);
    try {
      const { download } = await api.cloud.assets.download(
        { assetVersionId: selected.id },
        { signal },
      );
      if (signal.aborted) return;
      const link = document.createElement("a");
      link.href = download.url;
      link.download = selected.name;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      link.click();
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      if (!signal.aborted) setDownloadPending(false);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ArtifactList
        artifacts={artifacts.map((asset) => ({
          id: asset.id,
          name: asset.name,
          createdAt: asset.createdAt,
        }))}
        {...(selectedId ? { selectedId } : {})}
        onSelect={(asset) => setSelectedId(asset.id)}
        labels={{ title: t("artifacts"), empty: t("noArtifacts") }}
      />
      {selected ? (
        <ArtifactPreview
          name={selected.name}
          {...(preview && preview.versionId === selectedId ? { content: preview.content } : {})}
          pending={pending || downloadPending}
          {...(failed ? { error: t("failed") } : {})}
          onDownload={() => void download()}
          labels={{
            loading: t("loading"),
            unavailable: t("previewUnavailable"),
            download: t("download"),
          }}
        />
      ) : null}
    </div>
  );
}
