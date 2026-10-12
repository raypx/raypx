/** Private execution protocol. Never compose this tree into the public API. */
export declare const executionOperations: readonly ["workerControl", "workerAssets", "startExecution", "appendEvent", "createWorkerAsset", "completeWorkerAsset", "finishExecution", "finish", "finishWithRevision", "interrupt", "acknowledgeCommand"];
export declare const executionPayloadSchemas: {
    workerControl: any;
    workerAssets: any;
    interrupt: any;
    startExecution: any;
    appendEvent: any;
    createWorkerAsset: any;
    completeWorkerAsset: any;
    finishExecution: any;
    finish: any;
    finishWithRevision: any;
    acknowledgeCommand: any;
};
export declare const executionGatewayContract: {
    bootstrap: any;
    invoke: any;
    model: any;
    research: any;
    object: any;
};
//# sourceMappingURL=execution-gateway.d.ts.map