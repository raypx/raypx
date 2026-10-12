import type { AssetApplication, AssetOptions } from "./types.js";
import { executionContext } from "./execution.js";
import { requireResource, requiredText } from "./context.js";
export function createAssetApplication(options: AssetOptions): AssetApplication {
  const { now, id } = executionContext(options);
  const { requireProject } = options.access;
  return {
    async downloadAssetVersion({ actorId, assetVersionId }) {
      const version = requireResource(
        await options.assetVersions.getById(assetVersionId),
        "Asset download denied.",
      );
      await requireProject(actorId, version.projectId, "project.read", "Asset download denied.");
      const asset = requireResource(
        await options.assets.getById(version.assetId),
        "Asset download denied.",
      );
      const download = requireResource(
        await options.blobStorage.getDownload({
          workspaceId: version.projectId,
          blobHash: version.checksum,
        }),
        "Asset content unavailable.",
      );
      return { name: asset.name, version, download };
    },
    async listLibrary(input) {
      if (input.projectId)
        await requireProject(
          input.actorId,
          input.projectId,
          "project.read",
          "Asset access denied.",
        );
      return options.assets.listVisible(input);
    },
    async listAssets({ actorId, projectId }) {
      await requireProject(actorId, projectId, "project.read", "Asset access denied.");
      return options.assets.listByProject(projectId);
    },

    async createAsset({ actorId, projectId, name }) {
      await requireProject(actorId, projectId, "project.write", "Asset creation denied.");
      const normalizedName = requiredText(name, "Asset name");
      return options.assets.create({
        id: id(),
        projectId,
        createdByUserId: actorId,
        name: normalizedName,
        now: now(),
      });
    },

    async listAssetVersions({ actorId, assetId }) {
      const asset = requireResource(await options.assets.getById(assetId), "Asset access denied.");
      await requireProject(actorId, asset.projectId, "project.read", "Asset access denied.");
      return options.assetVersions.listByAsset(assetId);
    },

    async createAssetUpload({ actorId, projectId, byteSize, contentType, expectedHash }) {
      await requireProject(actorId, projectId, "project.write", "Asset upload denied.");
      return options.blobStorage.createUpload({
        workspaceId: projectId,
        actorId,
        byteSize,
        contentType,
        expectedHash,
      });
    },

    async completeAssetUpload({
      actorId,
      assetId,
      uploadId,
      byteSize,
      contentType,
      checksum,
      body,
    }) {
      const asset = requireResource(await options.assets.getById(assetId), "Asset upload denied.");
      await requireProject(actorId, asset.projectId, "project.write", "Asset upload denied.");
      const completed = await options.blobStorage.completeUpload({
        uploadId,
        actorId,
        workspaceId: asset.projectId,
        byteSize,
        contentType,
        blobHash: checksum,
        ...(body ? { body } : {}),
      });
      return options.assetVersions.create({
        id: id(),
        assetId,
        projectId: asset.projectId,
        createdByUserId: actorId,
        objectKey: `${asset.projectId}/${completed.blobHash}`,
        byteSize: completed.byteSize,
        mediaType: completed.contentType,
        checksum: completed.blobHash,
        now: now(),
      });
    },
  };
}
