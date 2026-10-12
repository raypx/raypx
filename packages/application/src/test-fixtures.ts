import {
  createProjectApplication,
  createProjectAccess,
  createAssetApplication,
  createReviewApplication,
  createActivityApplication,
} from "./index.js";
import type {
  ProjectOptions as Projects,
  AssetOptions,
  ReviewOptions,
  ActivityOptions,
} from "./types.js";
export type ProjectOptions = Projects &
  Omit<AssetOptions, "access"> &
  Omit<ReviewOptions, "access"> &
  Pick<ActivityOptions, "activity">;
export type { ProjectV2Repository } from "@voidmix/core";
export function createApplicationFixture(options: ProjectOptions) {
  const access = createProjectAccess(options);
  return {
    ...createProjectApplication(options),
    ...createAssetApplication({ ...options, access }),
    ...createReviewApplication({ ...options, access }),
    ...createActivityApplication({ ...options, access }),
  };
}
