import { domainFixtures } from "./test-fixtures.js";
import { createApiClient } from "@voidmix/client";
import { InMemorySystemSettingsRepository } from "@voidmix/db";
import type { AssetApplication, ProjectApplication } from "@voidmix/application";
import { ProjectV2DomainError, type MailSettingsFallback } from "@voidmix/core";
import { describe, expect, it } from "vite-plus/test";

import { createApiApp } from "./app.js";
import { createApiModules } from "./modules.js";
import { createHeaderSessionResolver } from "./session.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const project = {
  id: "project-1",
  createdByUserId: "user-1",
  personalOwnerId: "user-1",
  organizationId: null,
  title: "First project",
  description: null,
  stage: "draft" as const,
  archived: false,
  deadline: null,
  createdAt: now,
  updatedAt: now,
};

function createProjectApplication(): ProjectApplication {
  const notImplemented = async (): Promise<never> => {
    throw new Error("Not implemented in API contract smoke tests.");
  };
  return {
    get: async ({ actorId, projectId }) =>
      actorId === project.personalOwnerId && projectId === project.id
        ? { project, access: "manage" as const }
        : null,
    listForUser: async (userId) => ({
      items: userId === project.personalOwnerId ? [project] : [],
      nextCursor: null,
    }),
    create: async ({ actorId, title, description }) => ({
      ...project,
      id: `${actorId}-created`,
      createdByUserId: actorId,
      personalOwnerId: actorId,
      title,
      description: description ?? null,
    }),
    assertCapability: async ({ actorId, projectId }) => {
      if (actorId !== project.personalOwnerId || projectId !== project.id)
        throw new ProjectV2DomainError("PROJECT_ACCESS_DENIED", "Project access denied.");
      return project;
    },
    listTasks: notImplemented,
    createTask: notImplemented,
    updateTask: notImplemented,
    listMembers: notImplemented,
    addMember: notImplemented,
    updateMember: notImplemented,
    removeMember: notImplemented,
    updateProject: notImplemented,
    archiveProject: notImplemented,
    restoreProject: notImplemented,
    deleteProject: notImplemented,
  } as ProjectApplication;
}

function createApp(assetCompletion?: AssetApplication["completeAssetUpload"]) {
  const settings = new InMemorySystemSettingsRepository();
  const mailFallback: MailSettingsFallback = {
    enabled: { value: false, source: "default" },
    from: { value: null, source: "missing" },
    fromName: { value: "Voidmix", source: "default" },
    templatesBaseUrl: { value: null, source: "missing" },
    resendApiKey: { value: null, source: "missing" },
  };
  const projects = createProjectApplication();
  const domains = domainFixtures();
  return createApiApp({
    modules: createApiModules({
      ...domains,
      assets: {
        ...domains.assets,
        ...(assetCompletion ? { completeAssetUpload: assetCompletion } : {}),
      },
      settings,
      mailFallback,
      v2Projects: projects,
    }),
    resolveSession: createHeaderSessionResolver(),
    allowedOrigins: ["http://voidmix.test"],
    authHandler: async () => new Response(null, { status: 404 }),
    now: () => now,
  });
}

function clientFor(userId?: string, role = "user", app = createApp()) {
  return createApiClient({
    baseUrl: "http://voidmix.test",
    headers: userId
      ? {
          "x-voidmix-user-id": userId,
          "x-voidmix-role": role,
          "x-voidmix-email": `${userId}@example.com`,
          "x-voidmix-display-name": userId,
        }
      : {},
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
}

describe("canonical API", () => {
  it("permits credentialed oRPC batch/compression preflight only from configured origins", async () => {
    const app = createApp();
    for (const origin of ["http://voidmix.test", "https://untrusted.test"]) {
      const response = await app.request("http://voidmix.test/rpc/__batch__", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "orpc-batch,content-encoding,standard-server",
        },
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(
        origin === "http://voidmix.test" ? origin : null,
      );
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
      const allowed = response.headers.get("access-control-allow-headers")!.toLowerCase();
      for (const header of ["orpc-batch", "content-encoding", "standard-server"])
        expect(allowed).toContain(header);
    }
  });
  it("serves health and public auth capabilities", async () => {
    const client = clientFor();
    expect((await client.health({})).status).toBe("ok");
    expect((await client.auth.capabilities.get({})).registrationAvailable).toBe(false);
  });

  it("requires a session for account and projects", async () => {
    const client = clientFor();
    await expect(client.account.get({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(client.projects.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("scopes project reads and creates to the authenticated account", async () => {
    const client = clientFor("user-1");
    expect((await client.account.get({})).id).toBe("user-1");
    expect((await client.projects.list({})).items).toHaveLength(1);
    expect((await client.projects.get({ projectId: "project-1" })).access).toBe("manage");
    expect((await client.projects.create({ title: "New project" })).personalOwnerId).toBe("user-1");
  });

  it.each([
    "/admin/users/list",
    "/admin/users/get",
    "/admin/users/updateStatus",
    "/admin/audit/list",
    "/cloud/admin/runs/list",
    "/cloud/admin/runs/get",
    "/cloud/admin/usage/get",
    "/devices/register",
    "/devices/list",
    "/devices/bindProject",
    "/runner/heartbeat",
    "/runner/claim",
    "/runner/events/append",
    "/runner/artifacts/upload",
    "/projects/agentRuns/create",
    "/projects/agentRuns/snapshot",
    "/projects/agentRuns/events/stream",
    "/projects/agentRuns/commands/create",
  ])("returns the ordinary RPC not-found response for retired %s", async (path) => {
    const app = createApp();
    for (const role of [null, "user", "admin", "owner"]) {
      const response = await app.request(`http://voidmix.test/rpc${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(role ? { "x-voidmix-user-id": "user-1", "x-voidmix-role": role } : {}),
        },
        body: JSON.stringify({ json: {} }),
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        json: { code: "NOT_FOUND", data: { error: { code: "NOT_FOUND" } } },
      });
    }
  });

  it("keeps both Project upload completion routes decoding bytes for the authenticated actor", async () => {
    const body = new Uint8Array([0, 127, 128, 255]);
    const calls: Parameters<AssetApplication["completeAssetUpload"]>[0][] = [];
    const version = {
      id: "version-1",
      assetId: "asset-1",
      projectId: project.id,
      createdByUserId: "user-1",
      objectKey: "objects/asset-1",
      byteSize: body.byteLength,
      mediaType: "application/octet-stream",
      checksum: "a".repeat(64),
      createdAt: now,
    };
    const client = clientFor(
      "user-1",
      "user",
      createApp(async (input) => {
        calls.push(input);
        return version;
      }),
    );
    const input = {
      assetId: version.assetId,
      uploadId: "upload-1",
      byteSize: body.byteLength,
      contentType: version.mediaType,
      checksum: version.checksum,
      bodyBase64: Buffer.from(body).toString("base64"),
    };
    for (const complete of [client.projects.assets.upload.complete, client.assets.upload.complete])
      expect(await complete(input)).toEqual(version);
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call).toMatchObject({ actorId: "user-1", body });
  });

  it("rejects malformed and oversized upload bytes before calling the asset service", async () => {
    let completions = 0;
    const client = clientFor(
      "user-1",
      "user",
      createApp(async () => {
        completions += 1;
        throw new Error("Invalid uploads must not reach the asset service.");
      }),
    );
    const input = {
      assetId: "asset-1",
      uploadId: "upload-1",
      byteSize: 1,
      contentType: "text/plain",
      checksum: "a".repeat(64),
    };
    for (const bodyBase64 of ["invalid!", "AAA", "AAAA=", "AAA===", "AA=A"])
      await expect(
        client.projects.assets.upload.complete({ ...input, bodyBase64 }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        data: { error: { code: "BLOB_CHECKSUM_MISMATCH" } },
      });
    await expect(
      client.assets.upload.complete({
        ...input,
        bodyBase64: Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { error: { code: "BLOB_TOO_LARGE" } },
    });
    expect(completions).toBe(0);
  });
});
