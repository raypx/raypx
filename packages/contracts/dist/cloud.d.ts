import { z } from "zod";
export declare const resourceScopeSchema: any;
export declare const cloudTaskStatusSchema: any;
export declare const cloudRunStatusSchema: any;
export declare const cloudModeSchema: any;
export declare const cloudConversationSchema: any;
export declare const cloudTurnSchema: any;
export declare const cloudTaskSchema: any;
export declare const cloudTaskRoundSchema: any;
export declare const cloudMessageSchema: any;
export declare const cloudRunSchema: any;
export declare const cloudAgentExecutionSchema: any;
export declare const cloudToolExecutionSchema: any;
export declare const cloudSourceEvidenceSchema: any;
export declare const cloudAssetVersionSchema: any;
export declare const cloudArtifactRevisionSchema: any;
export declare const cloudCommandSchema: any;
export declare const cloudRunEventSchema: any;
export declare const cloudRunSnapshotSchema: any;
export declare const cloudUsageSummarySchema: any;
export declare const cloudNotificationSchema: any;
export declare const cloudPreferencesSchema: any;
export declare const getCloudPreferences: any;
export declare const updateCloudPreferences: any;
export declare const cloudCapabilitiesSchema: any;
export declare const cloudConversationSnapshotSchema: any;
export declare const createCloudConversation: any;
export declare const listCloudConversations: any;
export declare const getCloudConversation: any;
export declare const streamCloudConversation: any;
export declare const historyCloudConversation: any;
export declare const sendCloudTurn: any;
export declare const createCloudTask: any;
export declare const listCloudTasks: any;
export declare const getCloudTask: any;
export declare const updateCloudTask: any;
export declare const acceptCloudRevision: any;
export declare const startCloudRound: any;
export declare const continueCloudRound: any;
export declare const setCloudSpendingGrant: any;
export declare const listCloudSpendingGrants: any;
export declare const snapshotCloudRun: any;
export declare const historyCloudRun: any;
export declare const streamCloudRun: any;
export declare const createCloudCommand: any;
export declare const retryCloudRun: any;
export declare const getCloudUsage: any;
export declare const listCloudNotifications: any;
export declare const markCloudNotificationRead: any;
export declare const listCloudAssets: any;
export declare const createCloudUpload: any;
export declare const completeCloudUpload: any;
export declare const downloadCloudAsset: any;
export declare const getCloudAsset: any;
export declare const getCloudCapabilities: any;
export declare const getCloudToolDetail: any;
export declare const cloudAdminRunSummarySchema: any;
export declare const listCloudAdminRuns: any;
export declare const inspectCloudAdminRun: any;
export declare const getCloudAdminUsage: any;
export declare const cloudContract: {
    admin: {
        runs: {
            list: any;
            get: any;
        };
        usage: {
            get: any;
        };
    };
    conversations: {
        create: any;
        list: any;
        get: any;
        snapshot: any;
        history: any;
        stream: any;
        sendTurn: any;
    };
    tasks: {
        listSpendingGrants: any;
        startRound: any;
        continueRound: any;
        setSpendingGrant: any;
        create: any;
        list: any;
        get: any;
        update: any;
        acceptRevision: any;
    };
    runs: {
        snapshot: any;
        history: any;
        stream: any;
        commands: {
            create: any;
        };
        retry: any;
    };
    assets: {
        get: any;
        list: any;
        createUpload: any;
        completeUpload: any;
        download: any;
        preview: any;
    };
    preferences: {
        get: any;
        update: any;
    };
    usage: {
        get: any;
    };
    notifications: {
        list: any;
        markRead: any;
    };
    capabilities: {
        get: any;
    };
    tools: {
        get: any;
    };
};
export type CloudConversationDto = z.infer<typeof cloudConversationSchema>;
export type CloudConversationSnapshotDto = z.infer<typeof cloudConversationSnapshotSchema>;
export type CloudTurnDto = z.infer<typeof cloudTurnSchema>;
export type CloudTaskDto = z.infer<typeof cloudTaskSchema>;
export type CloudTaskRoundDto = z.infer<typeof cloudTaskRoundSchema>;
export type CloudMessageDto = z.infer<typeof cloudMessageSchema>;
export type CloudRunDto = z.infer<typeof cloudRunSchema>;
export type CloudRunEventDto = z.infer<typeof cloudRunEventSchema>;
export type CloudRunSnapshotDto = z.infer<typeof cloudRunSnapshotSchema>;
export type CloudAssetVersionDto = z.infer<typeof cloudAssetVersionSchema>;
export type CloudArtifactRevisionDto = z.infer<typeof cloudArtifactRevisionSchema>;
export type CloudUsageSummaryDto = z.infer<typeof cloudUsageSummarySchema>;
export type CloudNotificationDto = z.infer<typeof cloudNotificationSchema>;
export type CloudCapabilitiesDto = z.infer<typeof cloudCapabilitiesSchema>;
export type CloudToolDetailDto = z.infer<typeof cloudToolExecutionSchema>;
export type CloudCommandDto = z.infer<typeof cloudCommandSchema>;
export type CloudPreferencesDto = z.infer<typeof cloudPreferencesSchema>;
export type CloudAdminRunSummaryDto = z.infer<typeof cloudAdminRunSummarySchema>;
//# sourceMappingURL=cloud.d.ts.map