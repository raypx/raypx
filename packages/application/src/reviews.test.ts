import { describe, expect, it, vi } from "vite-plus/test";
import { ProjectV2DomainError, type AssetVersionV2 } from "@voidmix/core";
import { createReviewApplication } from "./reviews.js";
import type { ReviewOptions } from "./types.js";
const version: AssetVersionV2 = {
  id: "version",
  assetId: "asset",
  projectId: "project",
  createdByUserId: "owner",
  objectKey: "file",
  byteSize: 1,
  mediaType: "text/plain",
  checksum: "checksum",
  createdAt: new Date(0),
};
const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected port call");
};
function fixture(found: AssetVersionV2 | null) {
  const getById = vi.fn(async () => found);
  const create = vi.fn<ReviewOptions["reviews"]["create"]>(async (input) => ({
    ...input,
    status: "open",
    createdAt: input.now,
    updatedAt: input.now,
  }));
  const requireProject = vi.fn<ReviewOptions["access"]["requireProject"]>();
  const service = createReviewApplication({
    access: { requireProject, assertCapability: unexpected },
    assetVersions: { getById, listByAsset: unexpected, create: unexpected },
    reviews: { getById: unexpected, listByProject: unexpected, create, update: unexpected },
    feedback: { listByReview: unexpected, create: unexpected },
  });
  return { service, create, getById, requireProject };
}
describe("Review version boundary", () => {
  it.each([
    ["missing", null],
    ["other project", { ...version, projectId: "other" }],
  ] as const)(
    "rejects %s versions using inaccessible-resource semantics",
    async (_label, found) => {
      const { service, create } = fixture(found);
      await expect(
        service.createReview({
          actorId: "owner",
          projectId: "project",
          title: "Review",
          assetVersionId: "version",
        }),
      ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED" });
      expect(create).not.toHaveBeenCalled();
    },
  );
  it("accepts an owned version and a review without a version", async () => {
    const { service, getById, create } = fixture(version);
    for (const assetVersionId of ["version", null])
      await expect(
        service.createReview({
          actorId: "owner",
          projectId: "project",
          title: " Review ",
          assetVersionId,
        }),
      ).resolves.toMatchObject({ title: "Review", assetVersionId });
    expect(getById).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("authorizes the project before revealing version existence", async () => {
    const { service, getById, requireProject } = fixture(version);
    requireProject.mockRejectedValue(new ProjectV2DomainError("PROJECT_ACCESS_DENIED", "Denied"));
    await expect(
      service.createReview({
        actorId: "outsider",
        projectId: "project",
        title: "Review",
        assetVersionId: "version",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED" });
    expect(getById).not.toHaveBeenCalled();
  });
});
