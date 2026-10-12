import { describe, expect, it, vi } from "vite-plus/test";
import {
  createApplicationFixture as createProjectApplication,
  type ProjectOptions,
  type ProjectV2Repository,
} from "./test-fixtures.js";
import type { ProjectMemberV2, ProjectV2 } from "@raypx/core";
import type { TaskV2 } from "@raypx/core";

const project = (overrides: Partial<ProjectV2> = {}): ProjectV2 => ({
  id: "project-1",
  createdByUserId: "user-1",
  personalOwnerId: "user-1",
  organizationId: null,
  title: "One project",
  description: null,
  stage: "draft",
  archived: false,
  deadline: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

const task = (overrides: Partial<TaskV2> = {}): TaskV2 => ({
  id: "task-1",
  projectId: "project-1",
  createdByUserId: "user-1",
  title: "First task",
  status: "todo",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

const unused = async (): Promise<never> => {
  throw new Error("unexpected repository call");
};

type RepositoryOptions = Omit<ProjectOptions, "now" | "id">;
type Overrides = { [K in keyof RepositoryOptions]?: Partial<RepositoryOptions[K]> };
function projectOptions(overrides: Overrides = {}): ProjectOptions {
  const options: ProjectOptions = {
    projects: {
      getById: async () => project(),
      listVisible: async () => ({ items: [], nextCursor: null }),
      create: async () => project(),
      update: async () => project(),
      setArchived: async () => project(),
      delete: async () => true,
    },
    tasks: {
      getById: async () => null,
      listByProject: async () => [],
      create: async () => task(),
      update: async () => null,
    },
    projectMembers: {
      getByProjectAndUser: async () => null,
      listByProject: async () => [],
      upsert: unused,
      remove: async () => null,
    },
    organizationMembers: { getByOrganizationAndUser: async () => null, listByUser: async () => [] },
    reviews: {
      getById: async () => null,
      listByProject: async () => [],
      create: unused,
      update: async () => null,
    },
    feedback: { listByReview: async () => [], create: unused },
    activity: {
      listByProject: async () => [],
      listVisible: async () => ({ items: [], nextCursor: null }),
    },
    assets: {
      listVisible: async () => ({ items: [], nextCursor: null }),
      getById: async () => null,
      listByProject: async () => [],
      create: unused,
    },
    assetVersions: { getById: async () => null, listByAsset: async () => [], create: unused },
    blobStorage: {
      createUpload: unused,
      completeUpload: unused,
      getDownload: async () => null,
      delete: async () => undefined,
    },
  };
  for (const key of Object.keys(overrides) as Array<keyof Overrides>)
    Object.assign(options, { [key]: { ...options[key], ...overrides[key] } });
  return options;
}

function application(overrides: Overrides = {}) {
  return createProjectApplication(projectOptions(overrides));
}

describe("V2 project application", () => {
  it("lists more than one personal project for an account", async () => {
    const projects = [project(), project({ id: "project-2", title: "Two projects" })];
    const app = application({
      projects: { listVisible: async () => ({ items: projects, nextCursor: null }) },
    });
    expect((await app.listForUser("user-1")).items).toHaveLength(2);
  });

  it("allows a personal project collaborator through its project grant", async () => {
    const member: ProjectMemberV2 = {
      projectId: "project-1",
      userId: "user-2",
      role: "commenter",
      status: "active",
    };
    const app = application({
      projectMembers: {
        getByProjectAndUser: async () => member,
      },
    });
    await expect(app.get({ actorId: "user-2", projectId: "project-1" })).resolves.toMatchObject({
      access: "comment",
    });
  });

  it("includes projects from active organization memberships", async () => {
    const personal = project();
    const organization = project({
      id: "project-org-1",
      personalOwnerId: null,
      organizationId: "org-1",
      title: "Organization project",
    });
    const repository: Partial<ProjectV2Repository> = {
      listVisible: async () => ({ items: [organization, personal], nextCursor: null }),
    };
    const app = application({
      projects: repository,
      organizationMembers: {
        getByOrganizationAndUser: async () => null,
        listByUser: async () => [
          { organizationId: "org-1", userId: "user-1", role: "editor", status: "active" },
        ],
      },
    });
    await expect(app.listForUser("user-1")).resolves.toEqual({
      items: [organization, personal],
      nextCursor: null,
    });
  });

  it("requires project write access to create and update tasks", async () => {
    let current = task();
    const app = application({
      tasks: {
        getById: async () => current,
        listByProject: async () => [current],
        create: async (input) =>
          (current = task({
            id: input.id,
            title: input.title,
            createdAt: input.now,
            updatedAt: input.now,
          })),
        update: async (input) => (current = task({ ...current, ...input, updatedAt: input.now })),
      },
    });
    await expect(
      app.createTask({ actorId: "user-1", projectId: "project-1", title: "Ship V2" }),
    ).resolves.toMatchObject({ title: "Ship V2" });
    await expect(
      app.updateTask({ actorId: "user-1", taskId: current.id, status: "done" }),
    ).resolves.toMatchObject({ status: "done" });
    await expect(
      app.createTask({ actorId: "user-2", projectId: "project-1", title: "Denied" }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED" });
  });

  it.each(["", " \t\n "])("rejects blank task titles before persistence: %j", async (title) => {
    const options = projectOptions();
    const create = vi.fn(options.tasks.create);
    const update = vi.fn(options.tasks.update);
    options.tasks.create = create;
    options.tasks.update = update;
    options.tasks.getById = async () => task();
    const app = createProjectApplication(options);
    for (const operation of [
      () => app.createTask({ actorId: "user-1", projectId: "project-1", title }),
      () => app.updateTask({ actorId: "user-1", taskId: "task-1", title }),
    ])
      await expect(operation()).rejects.toMatchObject({
        code: "PROJECT_SCOPE_INVALID",
        message: "Task title is required.",
      });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("trims task titles and preserves titles for status-only updates", async () => {
    let current = task();
    const options = projectOptions({
      tasks: {
        getById: async () => current,
        create: async (input) => (current = task({ title: input.title })),
        update: async (input) => (current = task({ ...current, ...input })),
      },
    });
    const create = vi.fn(options.tasks.create);
    const update = vi.fn(options.tasks.update);
    options.tasks.create = create;
    options.tasks.update = update;
    const app = createProjectApplication(options);
    await expect(
      app.createTask({ actorId: "user-1", projectId: "project-1", title: "  New task\n" }),
    ).resolves.toMatchObject({ title: "New task" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: "New task" }));
    await expect(
      app.updateTask({ actorId: "user-1", taskId: "task-1", title: "\tUpdated task  " }),
    ).resolves.toMatchObject({ title: "Updated task" });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Updated task" }));
    await expect(
      app.updateTask({ actorId: "user-1", taskId: "task-1", status: "done" }),
    ).resolves.toMatchObject({ title: "Updated task", status: "done" });
    expect(update.mock.calls.at(-1)?.[0]).not.toHaveProperty("title");
  });

  it("returns the authorized project for an explicit capability check", async () => {
    await expect(
      application().assertCapability({
        actorId: "user-1",
        projectId: "project-1",
        capability: "project.manage",
      }),
    ).resolves.toEqual(project());
  });

  it("manages project members through the project owner capability", async () => {
    let members: ProjectMemberV2[] = [];
    const app = application({
      projectMembers: {
        getByProjectAndUser: async ({ userId }) =>
          members.find((member) => member.userId === userId) ?? null,
        listByProject: async () => members,
        upsert: async (input) => {
          const value: ProjectMemberV2 = {
            projectId: input.projectId,
            userId: input.userId,
            role: input.role,
            status: "active",
          };
          members = [...members.filter((member) => member.userId !== input.userId), value];
          return value;
        },
        remove: async ({ userId }) => {
          const member = members.find((value) => value.userId === userId);
          if (!member) return null;
          const removed = { ...member, status: "removed" as const };
          members = members.map((value) => (value.userId === userId ? removed : value));
          return removed;
        },
      },
    });

    await expect(
      app.addMember({
        actorId: "user-1",
        projectId: "project-1",
        userId: "user-2",
        role: "viewer",
      }),
    ).resolves.toMatchObject({ userId: "user-2", role: "viewer", status: "active" });
    await expect(
      app.listMembers({ actorId: "user-1", projectId: "project-1" }),
    ).resolves.toHaveLength(1);
    await expect(
      app.updateMember({
        actorId: "user-1",
        projectId: "project-1",
        userId: "user-2",
        role: "editor",
      }),
    ).resolves.toMatchObject({ role: "editor" });
    await expect(
      app.removeMember({ actorId: "user-1", projectId: "project-1", userId: "user-2" }),
    ).resolves.toMatchObject({ status: "removed" });
    await expect(
      app.addMember({
        actorId: "user-2",
        projectId: "project-1",
        userId: "user-3",
        role: "viewer",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED" });
  });

  it("applies write and manage capabilities to project lifecycle changes", async () => {
    let current = project();
    const repository: Partial<ProjectV2Repository> = {
      getById: async () => current,
      update: async (input) => {
        current = project({ ...current, ...input, updatedAt: input.now });
        return current;
      },
      setArchived: async (input) => {
        current = project({ ...current, archived: input.archived, updatedAt: input.now });
        return current;
      },
      delete: async () => true,
    };
    const app = application({ projects: repository });
    await expect(
      app.updateProject({ actorId: "user-1", projectId: "project-1", title: "Renamed" }),
    ).resolves.toMatchObject({ title: "Renamed" });
    await expect(
      app.archiveProject({ actorId: "user-1", projectId: "project-1" }),
    ).resolves.toMatchObject({
      archived: true,
    });
    await expect(
      app.restoreProject({ actorId: "user-2", projectId: "project-1" }),
    ).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED",
    });
  });
});

describe("resource authorization boundary", () => {
  it.each(["missing project", "unrelated actor", "organization ceiling"])(
    "rejects writes before validation or persistence: %s",
    async (scenario) => {
      const options = projectOptions();
      options.projects.getById = async () =>
        scenario === "missing project"
          ? null
          : project({
              ...(scenario === "organization ceiling"
                ? { personalOwnerId: null, organizationId: "org-1" }
                : {}),
            });
      options.projectMembers.getByProjectAndUser = async () =>
        scenario === "organization ceiling"
          ? { projectId: "project-1", userId: "user-2", role: "editor", status: "active" }
          : null;
      options.organizationMembers.getByOrganizationAndUser = async () => ({
        organizationId: "org-1",
        userId: "user-2",
        role: "viewer",
        status: "active",
      });
      const createTask = vi.fn(options.tasks.create);
      const updateTask = vi.fn(options.tasks.update);
      options.tasks.create = createTask;
      options.tasks.update = updateTask;
      options.tasks.getById = async () => task();
      const app = createProjectApplication(options);
      const input = { actorId: "user-2", projectId: "project-1" };
      for (const operation of [
        () => app.createTask({ ...input, title: "" }),
        () => app.updateTask({ actorId: input.actorId, taskId: "task-1", title: " \t " }),
        () => app.createAsset({ ...input, name: "" }),
        () => app.createReview({ ...input, title: "", assetVersionId: null }),
        () =>
          app.createAssetUpload({
            ...input,
            byteSize: 1,
            contentType: "image/png",
            expectedHash: "hash",
          }),
      ])
        await expect(operation()).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED" });
      expect(createTask).not.toHaveBeenCalled();
      expect(updateTask).not.toHaveBeenCalled();
      await expect(
        app.assertCapability({ ...input, capability: "project.write" }),
      ).rejects.toMatchObject({
        code: "PROJECT_ACCESS_DENIED",
        message: "Project access denied.",
      });
    },
  );

  it("denies missing child resources without loading their project", async () => {
    const options = projectOptions();
    options.projects.getById = async () => {
      throw new Error("project lookup must not run");
    };
    const app = createProjectApplication(options);
    for (const operation of [
      () => app.updateTask({ actorId: "user-1", taskId: "missing" }),
      () => app.updateReview({ actorId: "user-1", reviewId: "missing", status: "approved" }),
      () => app.listFeedback({ actorId: "user-1", reviewId: "missing" }),
      () => app.listAssetVersions({ actorId: "user-1", assetId: "missing" }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED" });
  });
});
