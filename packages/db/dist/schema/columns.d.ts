import { type AnyPgColumn, type ReferenceConfig } from "drizzle-orm/pg-core";
export declare const dateColumn: (name: string) => any;
export declare const createdAt: () => any;
export declare const updatedAt: () => any;
export declare const timestamps: () => {
    createdAt: any;
    updatedAt: any;
};
export declare const requiredReference: (name: string, reference: () => AnyPgColumn, onDelete: NonNullable<ReferenceConfig["config"]["onDelete"]>) => any;
//# sourceMappingURL=columns.d.ts.map