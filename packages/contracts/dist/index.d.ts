export declare const apiContract: {
    cloud: {
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
    health: any;
    account: {
        get: any;
    };
    auth: {
        capabilities: {
            get: any;
        };
    };
    projects: {
        list: any;
        get: any;
        create: any;
        update: any;
        archive: any;
        restore: any;
        delete: any;
        tasks: {
            list: any;
            create: any;
            update: any;
        };
        members: {
            list: any;
            add: any;
            update: any;
            remove: any;
        };
        reviews: {
            list: any;
            create: any;
            update: any;
            feedback: {
                list: any;
                create: any;
            };
        };
        assets: {
            list: any;
            create: any;
            versions: {
                list: any;
                download: any;
            };
            upload: {
                create: any;
                complete: any;
            };
        };
        agentRuns: {
            create: any;
            list: any;
            snapshot: any;
            events: {
                list: any;
                stream: any;
            };
            commands: {
                create: any;
                list: any;
            };
            artifacts: {
                list: any;
                attach: any;
            };
            get: any;
            cancel: any;
            retry: any;
        };
    };
    devices: {
        register: any;
        list: any;
        revoke: any;
        bindProject: any;
        listBindings: any;
    };
    runner: {
        artifacts: {
            upload: any;
        };
        heartbeat: any;
        claim: any;
        acknowledge: any;
        events: {
            append: any;
        };
        commands: {
            list: any;
            acknowledge: any;
        };
    };
    library: {
        assets: {
            list: any;
        };
    };
    assets: {
        upload: {
            create: any;
            complete: any;
        };
    };
    activity: {
        list: any;
    };
    admin: {
        users: {
            list: any;
            get: any;
            updateStatus: any;
        };
        audit: {
            list: any;
        };
    };
};
export type ApiContract = typeof apiContract;
export { createCursorPageSchema, apiErrorCodeSchema, apiErrorValuesSchema, apiErrorEnvelopeSchema, apiErrorDataSchema, apiProblemDetailsSchema, } from "./common.js";
export type { ApiErrorCode, ApiErrorData, ApiProblemDetails } from "./common.js";
export { activitySchema, roleSchema, userStatusSchema, accountProfileSchema, userSchema, userPageSchema, auditEventSchema, publicAuthCapabilitiesSchema, } from "./account.js";
export type { ActivityDto, AccountProfileDto, UserDto, UserPageDto, AuditEventDto, PublicAuthCapabilitiesDto, } from "./account.js";
export { projectScopeV2Schema, projectStageV2Schema, projectMemberRoleV2Schema, organizationRoleV2Schema, projectV2Schema, projectMemberV2Schema, organizationMemberV2Schema, projectCapabilityV2Schema, projectTaskStatusV2Schema, projectTaskV2Schema, } from "./projects.js";
export type { ProjectScopeV2Dto, ProjectV2Dto, ProjectMemberV2Dto, OrganizationMemberV2Dto, ProjectCapabilityV2Dto, } from "./projects.js";
export { reviewStatusV2Schema, reviewV2Schema, feedbackV2Schema } from "./reviews.js";
export { assetV2Schema, assetVersionV2Schema } from "./assets.js";
export { agentRunStatusV2Schema, agentRunV2Schema, deviceSchema, deviceBindingSchema, runEventSchema, runCommandSchema, runArtifactSchema, runSnapshotSchema, } from "./agents.js";
export type { DeviceDto, DeviceBindingDto, AgentRunDto, RunEventDto, RunCommandDto, RunArtifactDto, RunSnapshotDto, } from "./agents.js";
export { isMutationProcedure } from "./methods.js";
export * from "./cloud.js";
//# sourceMappingURL=index.d.ts.map