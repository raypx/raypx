import { cloudPage } from "./pagination.js";
import {
  isCloudTerminal,
  sameResourceScope,
  type CloudAssetVersion,
  type CloudTransaction,
} from "@voidmix/core";
import type { CloudContext, Actor, Intent, Fence } from "./context.js";

export function cloudAssets(context: CloudContext) {
  const {
    repo,
    now,
    fail,
    required,
    access,
    scopeFor,
    fenced,
    runTransaction,
    finishIn,
    publishIn,
    assetIn,
    completeAssetIn,
    mutate,
    spendingAccount,
  } = context;
  const canReclaim = async (tx: CloudTransaction, asset: CloudAssetVersion) => {
    if (asset.expiresAt.getTime() >= now().getTime()) return false;
    if (!asset.runId) return !asset.published;
    const run = await tx.get("runs", asset.runId);
    if (run && !isCloudTerminal(run.status)) return false;
    const revisions = run?.taskId ? await tx.list("revisions", { parentId: run.taskId }) : [];
    return !revisions.some((revision) => revision.assetVersionIds.includes(asset.id));
  };
  const cleanupTransaction = async <T>(
    assetVersionId: string,
    operation: (tx: CloudTransaction) => Promise<T>,
  ) => {
    const prior = await repo.read((tx) => tx.get("assets", assetVersionId));
    if (!prior) return null;
    const run = prior.runId ? await repo.read((tx) => tx.get("runs", prior.runId!)) : null;
    return repo.transaction(
      [
        `actor:${prior.requestedByUserId}`,
        `asset:${prior.id}`,
        ...(prior.runId ? [`run:${prior.runId}`] : []),
        ...(run?.taskId ? [`task:${run.taskId}`] : []),
      ],
      operation,
    );
  };
  const validateInputFile = (name: string, mediaType: string) => {
    const supported: Record<string, string> = {
      csv: "text/csv",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      md: "text/markdown",
      markdown: "text/markdown",
      txt: "text/plain",
      pdf: "application/pdf",
    };
    const extension = name.trim().split(".").at(-1)?.toLowerCase() ?? "";
    if (supported[extension] !== mediaType)
      fail("CLOUD_INVALID_INPUT", "Unsupported input file type.");
  };
  return {
    createUpload: async (
      input: Actor &
        Intent & {
          projectId?: string;
          name: string;
          mediaType: string;
          byteSize: number;
          checksum: string;
        },
    ) => {
      const ownerAccountId = await repo.read((tx) =>
        spendingAccount(tx, input.actorId, scopeFor(input)),
      );
      return repo.transaction(
        [`account:${ownerAccountId}`, `actor:${input.actorId}`],
        async (tx) => {
          validateInputFile(input.name, input.mediaType);
          return assetIn(tx, { ...input, scope: scopeFor(input), runId: null });
        },
      );
    },
    getAsset: (input: Actor & { assetVersionId: string }) =>
      repo.read(async (tx) => {
        const asset = required(await tx.get("assets", input.assetVersionId));
        await access(tx, input.actorId, asset.scope);
        return asset;
      }),
    completeUpload: (
      input: Actor & Intent & { assetVersionId: string; byteSize: number; checksum: string },
    ) =>
      repo.transaction([`actor:${input.actorId}`, `asset:${input.assetVersionId}`], async (tx) => {
        const asset = required(await tx.get("assets", input.assetVersionId));
        await access(tx, input.actorId, asset.scope, true);
        if (asset.runId !== null)
          fail("CLOUD_INVALID_INPUT", "Execution files are published with their delivery.");
        return mutate(
          tx,
          input,
          asset.scope,
          "asset.complete",
          {
            assetVersionId: input.assetVersionId,
            byteSize: input.byteSize,
            checksum: input.checksum,
          },
          () => completeAssetIn(tx, asset, input),
        );
      }),
    listAssets: (input: Actor & { projectId?: string; limit?: number; cursor?: string }) =>
      repo.read(async (tx) => {
        const scope = scopeFor(input);
        await access(tx, input.actorId, scope);
        return cloudPage(tx, input, "assets", { scope, published: true });
      }),
    createWorkerAsset: (
      input: Fence &
        Intent & { name: string; mediaType: string; byteSize: number; checksum: string },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        return assetIn(tx, {
          ...input,
          actorId: run.requestedByUserId,
          scope: run.scope,
          runId: run.id,
        });
      }),
    completeWorkerAsset: (
      input: Fence & { assetVersionId: string; byteSize: number; checksum: string },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        const asset = required(await tx.get("assets", input.assetVersionId));
        if (asset.runId !== run.id || !sameResourceScope(asset.scope, run.scope))
          fail("CLOUD_ACCESS_DENIED", "File scope mismatch.");
        return completeAssetIn(tx, asset, input, false);
      }),
    finishWithRevision: (
      input: Fence & { assetVersionIds: string[]; summary: string; output: string },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        const revision = await publishIn(tx, run, input);
        await finishIn(tx, run, "succeeded", input.output);
        return { run, revision };
      }),
    workerAssets: (input: Fence) =>
      repo.read(async (tx) => {
        const run = await fenced(tx, input);
        const ids = new Set(run.attachmentIds);
        if (run.taskId) {
          const task = required(await tx.get("tasks", run.taskId));
          if (task.currentRevisionId) {
            const revision = required(await tx.get("revisions", task.currentRevisionId));
            for (const assetId of revision.assetVersionIds) ids.add(assetId);
          }
        }
        const assets = [];
        for (const assetId of ids) {
          const asset = required(await tx.get("assets", assetId));
          if (!asset.published || !sameResourceScope(asset.scope, run.scope))
            fail("CLOUD_ACCESS_DENIED", "Worker attachment unavailable.");
          assets.push(asset);
        }
        return assets;
      }),
    workerAssetByKey: (input: Fence & { objectKey: string }) =>
      repo.read(async (tx) => {
        const run = await fenced(tx, input);
        const asset = (await tx.list("assets", { scope: run.scope })).find(
          (item) => item.objectKey === input.objectKey,
        );
        if (!asset || (!run.attachmentIds.includes(asset.id) && asset.runId !== run.id)) {
          const task = run.taskId ? await tx.get("tasks", run.taskId) : null;
          const revision = task?.currentRevisionId
            ? await tx.get("revisions", task.currentRevisionId)
            : null;
          if (!asset || !revision?.assetVersionIds.includes(asset.id))
            fail("CLOUD_ACCESS_DENIED", "Object is outside the execution context.");
        }
        return required(asset ?? null);
      }),
    listExpiredUploads: (input: { limit: number }) =>
      repo.read(async (tx) => {
        if (input.limit <= 0) return [];
        const result = [];
        for (const asset of await tx.list("assets")) {
          if (!(await canReclaim(tx, asset))) continue;
          result.push(asset);
          if (result.length >= input.limit) break;
        }
        return result;
      }),
    claimExpiredUpload: (input: { assetVersionId: string }) =>
      cleanupTransaction(input.assetVersionId, async (tx) => {
        const asset = await tx.get("assets", input.assetVersionId);
        if (!asset || !(await canReclaim(tx, asset))) return null;
        asset.cleanupClaimed = true;
        asset.updatedAt = now();
        await tx.save("assets", asset);
        return asset;
      }),
    removeExpiredUpload: (input: { assetVersionId: string }) =>
      cleanupTransaction(input.assetVersionId, async (tx) => {
        const asset = await tx.get("assets", input.assetVersionId);
        if (!asset) return;
        if (!asset.cleanupClaimed || !(await canReclaim(tx, asset)))
          fail("CLOUD_INVALID_INPUT", "Upload has no valid cleanup claim.");
        await tx.remove("assets", asset.id);
      }),
  };
}
