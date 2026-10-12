import type { Database } from "./types.js";
import type { AssetV2, AssetV2Repository, AssetVersionV2, AssetVersionV2Repository, VisibleResourceQuery } from "@voidmix/core";
export declare class PostgresAssetV2Repository implements AssetV2Repository {
    private readonly db;
    constructor(db: Database);
    listVisible(query: VisibleResourceQuery): Promise<CursorPage<T>>;
    getById(id: string): Promise<AssetV2 | null>;
    listByProject(projectId: string): Promise<AssetV2[]>;
    create({ now, ...record }: Parameters<AssetV2Repository["create"]>[0]): Promise<AssetV2>;
}
export declare class PostgresAssetVersionV2Repository implements AssetVersionV2Repository {
    private readonly db;
    constructor(db: Database);
    getById(id: string): Promise<unknown>;
    listByAsset(assetId: string): Promise<AssetVersionV2[]>;
    create({ now, ...record }: Parameters<AssetVersionV2Repository["create"]>[0]): Promise<AssetVersionV2>;
}
//# sourceMappingURL=assets.d.ts.map