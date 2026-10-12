import type { CursorPage, VisibleResourceQuery } from "../pagination.js";
import type { AuthoredResource, NewRecord } from "../resources.js";
export interface AssetV2 extends AuthoredResource {
  name: string;
  archived: boolean;
}

export interface AssetV2Repository {
  listVisible(query: VisibleResourceQuery): Promise<CursorPage<AssetV2>>;
  getById(id: string): Promise<AssetV2 | null>;
  listByProject(projectId: string): Promise<AssetV2[]>;
  create(input: NewRecord<AssetV2, "archived">): Promise<AssetV2>;
}

export interface AssetVersionV2 {
  id: string;
  assetId: string;
  projectId: string;
  createdByUserId: string;
  objectKey: string;
  byteSize: number;
  mediaType: string;
  checksum: string;
  createdAt: Date;
}

export interface AssetVersionV2Repository {
  getById(id: string): Promise<AssetVersionV2 | null>;
  listByAsset(assetId: string): Promise<AssetVersionV2[]>;
  create(input: NewRecord<AssetVersionV2>): Promise<AssetVersionV2>;
}
