import { cursorQueryFields } from "./common.js";
import { z } from "zod";
import { authoredResourceFields } from "./common.js";
import { createCursorPageSchema, procedure } from "./common.js";

export const assetV2Schema = z.object({
  ...authoredResourceFields,
  name: z.string().min(1),
  archived: z.boolean(),
  updatedAt: z.date(),
});

export const assetVersionV2Schema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  projectId: z.string().min(1),
  createdByUserId: z.string().min(1),
  objectKey: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  mediaType: z.string().min(1),
  checksum: z.string().min(1),
  createdAt: z.date(),
});

export const v2ListAssets = procedure(
  { projectId: z.string().min(1) },
  createCursorPageSchema(assetV2Schema),
);

export const listLibraryAssets = procedure(
  { ...cursorQueryFields, projectId: z.string().min(1).optional() },
  createCursorPageSchema(assetV2Schema),
);

export const v2CreateAsset = procedure(
  { projectId: z.string().min(1), name: z.string().trim().min(1).max(500) },
  assetV2Schema,
);

export const v2ListAssetVersions = procedure(
  { assetId: z.string().min(1) },
  createCursorPageSchema(assetVersionV2Schema),
);

export const v2CreateAssetUpload = procedure(
  {
    projectId: z.string().min(1),
    byteSize: z.number().int().nonnegative(),
    contentType: z.string().min(1),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  },
  z.object({
    id: z.string(),
    workspaceId: z.string(),
    actorId: z.string(),
    byteSize: z.number(),
    contentType: z.string(),
    expectedHash: z.string(),
    expiresAt: z.date(),
  }),
);

export const v2CompleteAssetUpload = procedure(
  {
    assetId: z.string().min(1),
    uploadId: z.string().min(1),
    byteSize: z.number().int().nonnegative(),
    contentType: z.string().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    bodyBase64: z.string().max(14_000_000),
  },
  assetVersionV2Schema,
);

export const downloadAssetVersion = procedure(
  { assetVersionId: z.string().min(1) },
  z.object({
    bodyBase64: z.string(),
    mediaType: z.string(),
    byteSize: z.number().int(),
    checksum: z.string(),
    name: z.string(),
  }),
);
