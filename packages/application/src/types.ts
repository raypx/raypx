import type { CursorQuery, CursorPage } from "@voidmix/core";
import {
  type ProjectAccessV2,
  type ProjectCapabilityV2,
  type ProjectScope,
  type ProjectV2,
  type ProjectV2Repository,
  type ProjectMemberV2Repository,
  type ProjectMemberRoleV2,
  type ProjectMemberV2,
  type OrganizationMemberV2Repository,
  type ProjectTaskV2Repository,
  type TaskV2,
  type FeedbackV2,
  type FeedbackV2Repository,
  type AssetV2,
  type AssetV2Repository,
  type AssetVersionV2,
  type AssetVersionV2Repository,
  type BlobStorageRepository,
  type ReviewStatusV2,
  type ReviewV2,
  type ReviewV2Repository,
  type ActivityV2,
  type ActivityV2Repository,
} from "@voidmix/core";

type Command<Input, Output> = (input: Input & { actorId: string }) => Promise<Output>;
type ProjectCommand<Input, Output> = Command<Input & { projectId: string }, Output>;
type MemberInput = { userId: string; role: ProjectMemberRoleV2 };
type ProjectChanges = Omit<Parameters<ProjectV2Repository["update"]>[0], "id" | "now">;
type TaskChanges = Omit<Parameters<ProjectTaskV2Repository["update"]>[0], "id" | "now">;

export interface ProjectApplication {
  get: ProjectCommand<object, { project: ProjectV2; access: ProjectAccessV2 } | null>;
  listForUser(userId: string, query?: CursorQuery): Promise<CursorPage<ProjectV2>>;
  create: Command<{ scope: ProjectScope; title: string; description?: string | null }, ProjectV2>;
  assertCapability: ProjectCommand<{ capability: ProjectCapabilityV2 }, ProjectV2>;
  listTasks: ProjectCommand<object, TaskV2[]>;
  createTask: ProjectCommand<{ title: string }, TaskV2>;
  updateTask: Command<TaskChanges & { taskId: string }, TaskV2>;
  listMembers: ProjectCommand<object, ProjectMemberV2[]>;
  addMember: ProjectCommand<MemberInput, ProjectMemberV2>;
  updateMember: ProjectCommand<MemberInput, ProjectMemberV2>;
  removeMember: ProjectCommand<{ userId: string }, ProjectMemberV2>;
  updateProject: ProjectCommand<ProjectChanges, ProjectV2>;
  archiveProject: ProjectCommand<object, ProjectV2>;
  restoreProject: ProjectCommand<object, ProjectV2>;
  deleteProject: ProjectCommand<object, void>;
}

export interface ReviewApplication {
  listReviews: ProjectCommand<object, ReviewV2[]>;
  createReview: ProjectCommand<{ assetVersionId: string | null; title: string }, ReviewV2>;
  updateReview: Command<{ reviewId: string; status: ReviewStatusV2 }, ReviewV2>;
  listFeedback: Command<{ reviewId: string }, FeedbackV2[]>;
  createFeedback: Command<{ reviewId: string; body: string }, FeedbackV2>;
}

export interface AssetApplication {
  downloadAssetVersion: Command<
    { assetVersionId: string },
    {
      name: string;
      version: AssetVersionV2;
      download: NonNullable<Awaited<ReturnType<BlobStorageRepository["getDownload"]>>>;
    }
  >;
  listLibrary: Command<CursorQuery & { projectId?: string }, CursorPage<AssetV2>>;
  listAssets: ProjectCommand<object, AssetV2[]>;
  createAsset: ProjectCommand<{ name: string }, AssetV2>;
  listAssetVersions: Command<{ assetId: string }, AssetVersionV2[]>;
  createAssetUpload: ProjectCommand<
    { byteSize: number; contentType: string; expectedHash: string },
    Awaited<ReturnType<BlobStorageRepository["createUpload"]>>
  >;
  completeAssetUpload: Command<
    {
      assetId: string;
      uploadId: string;
      byteSize: number;
      contentType: string;
      checksum: string;
      body?: Uint8Array;
    },
    AssetVersionV2
  >;
}

export interface ActivityApplication {
  listActivity: Command<CursorQuery & { projectId?: string }, CursorPage<ActivityV2>>;
}

export interface ProjectOptions {
  projects: ProjectV2Repository;
  tasks: ProjectTaskV2Repository;
  projectMembers: ProjectMemberV2Repository;
  organizationMembers: OrganizationMemberV2Repository;
  now?: () => Date;
  id?: () => string;
}

export interface ExecutionOptions {
  now?: () => Date;
  id?: () => string;
}
export interface ProjectAccess {
  requireProject(
    this: void,
    actorId: string,
    projectId: string,
    capability: ProjectCapabilityV2,
    message: string,
  ): Promise<ProjectV2>;
  assertCapability(input: {
    actorId: string;
    projectId: string;
    capability: ProjectCapabilityV2;
  }): Promise<ProjectV2>;
}
export interface AssetOptions extends ExecutionOptions {
  access: ProjectAccess;
  assets: AssetV2Repository;
  assetVersions: AssetVersionV2Repository;
  blobStorage: BlobStorageRepository;
}
export interface ReviewOptions extends ExecutionOptions {
  access: ProjectAccess;
  reviews: ReviewV2Repository;
  feedback: FeedbackV2Repository;
  assetVersions: AssetVersionV2Repository;
}
export interface ActivityOptions {
  access: ProjectAccess;
  activity: ActivityV2Repository;
}
