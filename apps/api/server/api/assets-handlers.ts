import { createApiError } from "./canonical-errors.js";
import type { RouterContext } from "./router-context.js";

export function decodeUpload(bodyBase64: string): Uint8Array {
  const padding = bodyBase64.endsWith("==") ? 2 : bodyBase64.endsWith("=") ? 1 : 0;
  const content = padding ? bodyBase64.slice(0, -padding) : bodyBase64;
  if (bodyBase64.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(content))
    throw createApiError("BAD_REQUEST", "BLOB_CHECKSUM_MISMATCH");
  if ((bodyBase64.length / 4) * 3 - padding > 10 * 1024 * 1024)
    throw createApiError("BAD_REQUEST", "BLOB_TOO_LARGE");
  return new Uint8Array(Buffer.from(bodyBase64, "base64"));
}

export function createAssetsHandlers({
  authenticated,
  assets,
  command,
  list,
  call,
}: RouterContext) {
  return {
    list: authenticated.projects.assets.list.handler(list(() => assets().listAssets)),
    create: authenticated.projects.assets.create.handler(command(() => assets().createAsset)),
    versions: {
      download: authenticated.projects.assets.versions.download.handler(
        async ({ context, input }) => {
          const { name, version, download } = await call(() =>
            assets().downloadAssetVersion({ ...input, actorId: context.principal.user.id }),
          );
          const chunks: Uint8Array[] = [];
          for await (const chunk of download.body) chunks.push(chunk);
          return {
            name,
            bodyBase64: Buffer.concat(chunks).toString("base64"),
            mediaType: version.mediaType,
            byteSize: version.byteSize,
            checksum: version.checksum,
          };
        },
      ),
      list: authenticated.projects.assets.versions.list.handler(
        list(() => assets().listAssetVersions),
      ),
    },
    upload: {
      create: authenticated.projects.assets.upload.create.handler(
        command(() => assets().createAssetUpload),
      ),
      complete: authenticated.projects.assets.upload.complete.handler(({ context, input }) =>
        call(() =>
          assets().completeAssetUpload({
            ...input,
            actorId: context.principal.user.id,
            body: decodeUpload(input.bodyBase64),
          }),
        ),
      ),
    },
  };
}
