import type { ApiClient } from "@voidmix/client";
const mediaTypes: Record<string, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  pdf: "application/pdf",
};
export async function uploadInputFile(
  api: ApiClient,
  file: File,
  signal: AbortSignal,
  projectId?: string,
  intents?: Map<string, string>,
) {
  const mediaType = mediaTypes[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
  if (!mediaType || !file.size || file.size > 10 * 1024 * 1024)
    throw { code: "INVALID_INPUT_FILE" };
  const bytes = await file.arrayBuffer();
  if (signal.aborted) throw signal.reason;
  const checksum = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const fingerprint = `${projectId ?? "personal"}:${file.name}:${checksum}`;
  const idempotencyKey = intents?.get(fingerprint) ?? crypto.randomUUID();
  intents?.set(fingerprint, idempotencyKey);
  const result = await api.cloud.assets.createUpload(
    {
      name: file.name,
      mediaType,
      byteSize: file.size,
      checksum,
      idempotencyKey,
      ...(projectId ? { projectId } : {}),
    },
    { signal },
  );
  if (result.asset.published) {
    intents?.delete(fingerprint);
    return result.asset;
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(result.upload.fields)) form.append(key, value);
  form.append("file", file);
  const response = await fetch(result.upload.url, {
    method: result.upload.method,
    headers: result.upload.headers,
    body: form,
    signal,
    credentials: "omit",
  });
  if (!response.ok) throw { code: "UPLOAD_FAILED" };
  const asset = await api.cloud.assets.completeUpload(
    { assetVersionId: result.asset.id, idempotencyKey: `${idempotencyKey}:publish` },
    { signal },
  );
  if (!signal.aborted) intents?.delete(fingerprint);
  return asset;
}
