import { z } from "zod";
export declare const createCursorPageSchema: <Item extends z.ZodType>(item: Item) => any;
export declare const apiErrorCodeSchema: any;
export declare const apiErrorValuesSchema: any;
export declare const apiErrorEnvelopeSchema: any;
export declare const apiErrorDataSchema: any;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorData = z.infer<typeof apiErrorDataSchema>;
export declare const apiProblemDetailsSchema: any;
export type ApiProblemDetails = z.infer<typeof apiProblemDetailsSchema>;
/** Every RPC accepts a validated object and returns the declared wire shape. */
export declare function procedure<Shape extends z.ZodRawShape, Output extends z.ZodType>(input: Shape, output: Output): any;
/** Canonical resource identity and native Date fields, shared within the wire layer. */
export declare const resourceFields: {
    id: any;
    projectId: any;
    createdAt: any;
    updatedAt: any;
};
export declare const authoredResourceFields: {
    createdByUserId: any;
    id: any;
    projectId: any;
    createdAt: any;
    updatedAt: any;
};
export declare const cursorQueryFields: {
    limit: any;
    cursor: any;
};
//# sourceMappingURL=common.d.ts.map