import type { ApiModules } from "./modules.js";
const unused = async (): Promise<never> => {
  throw new Error("Unexpected domain service call in fixture.");
};
export function domainFixtures(): Pick<
  ApiModules,
  "v2Projects" | "assets" | "reviews" | "activity"
> {
  return {
    v2Projects: {
      get: unused,
      listForUser: unused,
      create: unused,
      assertCapability: unused,
      listTasks: unused,
      createTask: unused,
      updateTask: unused,
      listMembers: unused,
      addMember: unused,
      updateMember: unused,
      removeMember: unused,
      updateProject: unused,
      archiveProject: unused,
      restoreProject: unused,
      deleteProject: unused,
    },
    assets: {
      downloadAssetVersion: unused,
      listLibrary: unused,
      listAssets: unused,
      createAsset: unused,
      listAssetVersions: unused,
      createAssetUpload: unused,
      completeAssetUpload: unused,
    },
    reviews: {
      listReviews: unused,
      createReview: unused,
      updateReview: unused,
      listFeedback: unused,
      createFeedback: unused,
    },
    activity: { listActivity: unused },
  };
}
