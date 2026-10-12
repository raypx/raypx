import { type CursorQuery, type CursorPage } from "@voidmix/core";
import { type SQL, type AnyColumn } from "drizzle-orm";
export declare function timestampKey(column: AnyColumn): any;
export declare function cursorPage(query: CursorQuery, scope: string): {
    limit: any;
    seek(time: SQL, id: AnyColumn): SQL | undefined;
    finish<T extends {
        id: string;
    }>(rows: T[], time: (row: T) => Date): CursorPage<T>;
};
//# sourceMappingURL=pagination.d.ts.map