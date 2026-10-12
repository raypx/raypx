import { decodeUpload } from "./execution-handlers.js";
import type { RouterContext } from "./router-context.js";
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
