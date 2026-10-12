import { describe, expect, it } from "vite-plus/test";
import { canProjectCapabilityV2, resolveProjectAccessV2, type ProjectV2 } from "./v2.js";

const personalProject: ProjectV2 = {
  id: "project-1",
  createdByUserId: "user-1",
  personalOwnerId: "user-1",
  organizationId: null,
  title: "Personal project",
  description: null,
  stage: "draft",
  archived: false,
  deadline: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("V2 project access", () => {
  it("allows one account to own multiple personal projects", () => {
    expect(resolveProjectAccessV2({ actorId: "user-1", project: personalProject })).toBe("manage");
    expect(
      resolveProjectAccessV2({
        actorId: "user-2",
        project: personalProject,
        projectMember: { role: "editor", status: "active" },
      }),
    ).toBe("write");
  });

  it("lets project membership narrow organization access", () => {
    const project = { ...personalProject, personalOwnerId: null, organizationId: "org-1" };
    const base = {
      actorId: "user-2",
      project,
      organizationMember: { role: "editor" as const, status: "active" as const },
    };
    expect(resolveProjectAccessV2(base)).toBe("write");
    expect(
      resolveProjectAccessV2({ ...base, projectMember: { role: "commenter", status: "active" } }),
    ).toBe("comment");
    expect(
      resolveProjectAccessV2({ ...base, projectMember: { role: "viewer", status: "removed" } }),
    ).toBe("none");
  });

  it("rejects malformed projects with two ownership scopes", () => {
    expect(
      resolveProjectAccessV2({
        actorId: "user-1",
        project: { ...personalProject, organizationId: "org-1" },
      }),
    ).toBe("none");
  });

  it("maps capabilities to monotonic access levels", () => {
    expect(canProjectCapabilityV2("comment", "project.read")).toBe(true);
    expect(canProjectCapabilityV2("comment", "project.write")).toBe(false);
    expect(canProjectCapabilityV2("manage", "project.manage")).toBe(true);
  });
});
