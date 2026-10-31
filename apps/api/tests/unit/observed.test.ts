import { expect, it } from "vite-plus/test";
import { ControlService } from "../../server/control/service.js";
import { connected, controlAuth, memoryControlRepository } from "../helpers/control.js";
import { terminalRequestSchema, terminalSessionSchema } from "@raypx/contracts/terminal";

function observed(projectId: string) {
  const epoch = crypto.randomUUID(),
    session = terminalSessionSchema.parse({
      id: crypto.randomUUID(),
      provider: "codex",
      providerSessionId: "synthetic-session",
      projectId,
      projectName: "Synthetic project",
      capabilities: {
        permission: true,
        permissionTools: ["Bash"],
        question: false,
        plan: false,
        simultaneousAnswers: false,
        requiresHookTrust: true,
      },
    });
  const request = terminalRequestSchema.parse({
    version: 1,
    id: crypto.randomUUID(),
    sessionId: session.id,
    epoch,
    revision: 1,
    provider: "codex",
    invocationId: crypto.randomUUID(),
    kind: "permission",
    title: "Bash",
    encoding: "plain",
    body: '{"command":"printf synthetic"}',
    questions: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    status: "pending",
    decision: null,
  });
  return {
    epoch,
    session,
    request,
    frame: {
      type: "observed" as const,
      epoch,
      revision: 1,
      sessions: [session],
      requests: [request],
    },
  };
}
it("projects external sessions separately, excludes tool bodies from lists and routes only a matching receipt/revision", async () => {
  const service = new ControlService(memoryControlRepository()),
    host = await connected(service),
    f = observed(host.input.projectId);
  await service.observed(host.actor, f.frame);
  const projection = await service.listObserved(host.auth.user.id);
  expect(projection.sessions[0]).toMatchObject({ id: f.session.id, deviceId: host.grant.deviceId });
  expect(projection.requests[0]).not.toHaveProperty("body");
  expect(await service.getObserved(host.auth.user.id, f.request.id)).toMatchObject({
    body: f.request.body,
    status: "pending",
  });
  const input = {
    id: f.request.id,
    epoch: f.epoch,
    revision: 1,
    receiptId: crypto.randomUUID(),
    decision: { type: "allow" as const },
  };
  expect(
    (await service.route(host.auth.user.id, input.receiptId, { method: "observed.decide", input }))
      .deviceId,
  ).toBe(host.grant.deviceId);
  await expect(
    service.route(host.auth.user.id, crypto.randomUUID(), { method: "observed.decide", input }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(
    service.route(host.auth.user.id, input.receiptId, {
      method: "observed.decide",
      input: { ...input, revision: 2 },
    }),
  ).rejects.toThrow("STALE_REQUEST");
  expect((await service.listObserved("other-user")).requests).toEqual([]);
  await expect(service.getObserved("other-user", f.request.id)).rejects.toThrow("NOT_FOUND");
  expect(await service.listTasks(host.auth.user.id, { limit: 100 })).toEqual([]);
});
it("cancels old pending requests when the host epoch changes and rejects revision collisions", async () => {
  const service = new ControlService(memoryControlRepository()),
    host = await connected(service),
    f = observed(host.input.projectId);
  await service.observed(host.actor, f.frame);
  await expect(
    service.observed(host.actor, {
      ...f.frame,
      revision: 2,
      requests: [{ ...f.request, body: "different input" }],
    }),
  ).rejects.toThrow("EVENT_CONFLICT");
  const next = observed(host.input.projectId);
  await service.observed(host.actor, { ...next.frame, requests: [], sessions: [] });
  expect((await service.getObserved(host.auth.user.id, f.request.id)).status).toBe("cancelled");
  await service.revoke(host.auth.user.id, host.grant);
  expect((await service.listObserved(host.auth.user.id)).requests).toEqual([]);
});
it("fences other devices and revoked accounts from observed records", async () => {
  const service = new ControlService(memoryControlRepository()),
    first = await connected(service),
    second = await connected(service, controlAuth("user-b")),
    f = observed(first.input.projectId);
  await service.observed(first.actor, f.frame);
  await expect(
    service.route(second.auth.user.id, crypto.randomUUID(), {
      method: "observed.decide",
      input: {
        id: f.request.id,
        epoch: f.epoch,
        revision: 1,
        receiptId: crypto.randomUUID(),
        decision: { type: "allow" },
      },
    }),
  ).rejects.toThrow("NOT_FOUND");
  const other = await connected(service, first.auth);
  await expect(service.observed(other.actor, f.frame)).rejects.toThrow("NOT_FOUND");
});

it("keeps server cancellation outside the host revision sequence across epoch recovery", async () => {
  const service = new ControlService(memoryControlRepository()),
    host = await connected(service),
    f = observed(host.input.projectId);
  await service.observed(host.actor, f.frame);
  const next = observed(host.input.projectId);
  await service.observed(host.actor, next.frame);
  expect(await service.getObserved(host.auth.user.id, f.request.id)).toMatchObject({
    status: "cancelled",
    revision: 1,
  });
  await service.observed(host.actor, {
    ...next.frame,
    revision: 2,
    sessions: [f.session, next.session],
    requests: [{ ...f.request, status: "expired", revision: 2 }, next.request],
  });
  expect(await service.getObserved(host.auth.user.id, f.request.id)).toMatchObject({
    status: "expired",
    revision: 2,
  });
  await service.observed(host.actor, {
    ...next.frame,
    revision: 3,
    requests: [{ ...next.request, status: "delivered", revision: 3, decision: { type: "allow" } }],
  });
  expect((await service.getObserved(host.auth.user.id, next.request.id)).status).toBe("delivered");
});

it("rejects conflicting equal-revision cancellations without historical repair", async () => {
  const repository = memoryControlRepository(),
    service = new ControlService(repository),
    host = await connected(service),
    f = observed(host.input.projectId);
  await service.observed(host.actor, f.frame);
  await repository.transaction(host.auth.user.id, (tx) =>
    tx.put("observed_request", {
      ...f.request,
      deviceId: host.grant.deviceId,
      status: "cancelled",
      revision: 2,
    }),
  );
  const next = observed(host.input.projectId);
  await expect(
    service.observed(host.actor, {
      ...next.frame,
      sessions: [f.session, next.session],
      requests: [{ ...f.request, status: "expired", revision: 2 }, next.request],
    }),
  ).rejects.toThrow("EVENT_CONFLICT");
  expect(await service.getObserved(host.auth.user.id, f.request.id)).toMatchObject({
    status: "cancelled",
    revision: 2,
  });
});
