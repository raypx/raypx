import * as account from "./account.js";
import * as projects from "./projects.js";
import * as reviews from "./reviews.js";
import * as assets from "./assets.js";
import { cloudContract } from "./cloud.js";

export const apiContract = {
  cloud: cloudContract,
  health: account.health,
  account: { get: account.getAccountProfile },
  auth: { capabilities: { get: account.getPublicAuthCapabilities } },
  projects: {
    list: projects.v2ListProjects,
    get: projects.v2GetProject,
    create: projects.v2CreateProject,
    update: projects.v2UpdateProject,
    archive: projects.v2ArchiveProject,
    restore: projects.v2RestoreProject,
    delete: projects.v2DeleteProject,
    tasks: {
      list: projects.v2ListProjectTasks,
      create: projects.v2CreateProjectTask,
      update: projects.v2UpdateProjectTask,
    },
    members: {
      list: projects.v2ListProjectMembers,
      add: projects.v2AddProjectMember,
      update: projects.v2UpdateProjectMember,
      remove: projects.v2RemoveProjectMember,
    },
    reviews: {
      list: reviews.v2ListReviews,
      create: reviews.v2CreateReview,
      update: reviews.v2UpdateReview,
      feedback: { list: reviews.v2ListFeedback, create: reviews.v2CreateFeedback },
    },
    assets: {
      list: assets.v2ListAssets,
      create: assets.v2CreateAsset,
      versions: { list: assets.v2ListAssetVersions, download: assets.downloadAssetVersion },
      upload: { create: assets.v2CreateAssetUpload, complete: assets.v2CompleteAssetUpload },
    },
  },
  library: {
    assets: { list: assets.listLibraryAssets },
  },
  assets: {
    upload: { create: assets.v2CreateAssetUpload, complete: assets.v2CompleteAssetUpload },
  },
  activity: { list: account.listActivity },
};

export type ApiContract = typeof apiContract;
export {
  createCursorPageSchema,
  apiErrorCodeSchema,
  apiErrorValuesSchema,
  apiErrorEnvelopeSchema,
  apiErrorDataSchema,
  apiProblemDetailsSchema,
} from "./common.js";
export type { ApiErrorCode, ApiErrorData, ApiProblemDetails } from "./common.js";
export { activitySchema, accountProfileSchema, publicAuthCapabilitiesSchema } from "./account.js";
export type { ActivityDto, AccountProfileDto, PublicAuthCapabilitiesDto } from "./account.js";
export {
  projectScopeV2Schema,
  projectStageV2Schema,
  projectMemberRoleV2Schema,
  organizationRoleV2Schema,
  projectV2Schema,
  projectMemberV2Schema,
  organizationMemberV2Schema,
  projectCapabilityV2Schema,
  projectTaskStatusV2Schema,
  projectTaskV2Schema,
} from "./projects.js";
export type {
  ProjectScopeV2Dto,
  ProjectV2Dto,
  ProjectMemberV2Dto,
  OrganizationMemberV2Dto,
  ProjectCapabilityV2Dto,
} from "./projects.js";
export { reviewStatusV2Schema, reviewV2Schema, feedbackV2Schema } from "./reviews.js";
export { assetV2Schema, assetVersionV2Schema } from "./assets.js";
export { isMutationProcedure } from "./methods.js";

export * from "./cloud.js";
