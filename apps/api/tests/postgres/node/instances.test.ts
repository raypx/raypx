import { beforeAll, afterAll, expect, it } from "vite-plus/test";
import { eq, inArray } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { user, instanceEnrollment } from "@raypx/database/schema";
import { createApiClient } from "@raypx/client/api";
import { InstanceService } from "@raypx/instances/server";
import { enrollmentProof, instanceCheckProof } from "@raypx/instances";
import {
  createInstanceKey,
  createInstanceSigner,
  instanceDigest,
  signProof,
  verifyProof,
  verifyInstanceReceipt,
} from "@raypx/instances/crypto";
import { createInstanceRepository } from "../../../server/instances/repository.ts";
import { createApiApp } from "../../../server/api.ts";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must name an isolated *_test database");
const connection = connectDatabase(url);
const owners: string[] = [crypto.randomUUID(), crypto.randomUUID()];
const origin = "https://instance-api.example";
const web = "https://instance-web.example";
const signer = createInstanceSigner("isolated-instance-test-secret");
const service = new InstanceService({
  origin,
  repository: createInstanceRepository(connection.db),
  issuerKey: signer.publicKey,
  issue: (binding) => signer.issue(binding),
  digest: instanceDigest,
  verify: verifyProof,
});
const app = createApiApp({
  instances: service,
  allowedOrigins: [web],
  authHandler: async () => Response.json({}),
  readSession: async (headers) => {
    const id = headers.get("cookie");
    if (!id || !owners.includes(id)) return null;
    return {
      user: {
        id,
        email: id + "@example.test",
        name: "Fixture",
        emailVerified: true,
        role: "member",
      },
      session: { id: "session-" + id, userId: id, expiresAt: new Date(Date.now() + 600_000) },
    };
  },
});
const client = (owner?: string, requestOrigin = web) =>
  createApiClient({
    baseUrl: origin,
    headers: { origin: requestOrigin, ...(owner ? { cookie: owner } : {}) },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values(owners.map((id) => ({ id, name: "Instance fixture", email: id + "@example.test" })));
});
afterAll(async () => {
  await connection.db.delete(user).where(inArray(user.id, owners));
  await connection.close();
});
async function begin() {
  const keys = createInstanceKey();
  const identity = {
    instanceId: crypto.randomUUID(),
    publicKey: keys.publicKey,
    name: "Headless fixture",
    platform: "linux",
    appVersion: "0.1.0",
  };
  const pending = await client().instances.begin({
    ...identity,
    proof: signProof(keys.privateKey, enrollmentProof(origin, identity)),
  });
  return { keys, identity, pending };
}
it("runs enrollment, owner authorization, signed polling and revocation through HTTP and PostgreSQL", async () => {
  const { keys, identity, pending } = await begin();
  await expect(client().instances.inspect({ code: pending.code })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await expect(
    client(owners[0], "https://untrusted.example").instances.approve({ code: pending.code }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await client(owners[0]).instances.inspect({ code: pending.code })).toEqual(identity);
  expect(await client().instances.poll({ id: pending.id, token: pending.token })).toEqual({
    status: "pending",
  });
  await client(owners[0]).instances.approve({ code: pending.code });
  const result = await client().instances.poll({ id: pending.id, token: pending.token });
  expect(verifyInstanceReceipt(result.receipt, signer.publicKey).binding).toMatchObject({
    accountId: owners[0],
    status: "registered",
  });
  await expect(client(owners[1]).instances.approve({ code: pending.code })).rejects.toMatchObject({
    data: { error: { code: "INSTANCE_OWNER_MISMATCH" } },
  });
  expect(await client(owners[1]).instances.list({})).toEqual([]);
  await expect(
    client(owners[1]).instances.revoke({ instanceId: identity.instanceId }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const [row] = await connection.db
    .select()
    .from(instanceEnrollment)
    .where(eq(instanceEnrollment.id, pending.id));
  expect(JSON.stringify(row)).not.toContain(pending.token);
  expect(JSON.stringify(row)).not.toContain(pending.code);
  await client(owners[0]).instances.revoke({ instanceId: identity.instanceId });
  const timestamp = Date.now();
  const receipt = await client().instances.check({
    instanceId: identity.instanceId,
    timestamp,
    proof: signProof(keys.privateKey, instanceCheckProof(origin, identity.instanceId, timestamp)),
  });
  expect(verifyInstanceReceipt(receipt, signer.publicKey).binding).toMatchObject({
    status: "revoked",
    revision: 2,
  });
  // An enrollment approved before revocation cannot mint a fresh registered receipt.
  const revokedPoll = await client().instances.poll({ id: pending.id, token: pending.token });
  expect(revokedPoll.receipt?.binding.status).toBe("revoked");
  await expect(
    client().instances.poll({ id: pending.id, token: "x".repeat(64) }),
  ).rejects.toMatchObject({ data: { error: { code: "INSTANCE_ENROLLMENT_EXPIRED" } } });
});
it("serializes competing owners under the instance lock", async () => {
  const { pending, identity } = await begin();
  const outcomes = await Promise.allSettled(
    owners.map((owner) => client(owner).instances.approve({ code: pending.code })),
  );
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const bindings = (await Promise.all(owners.map((owner) => service.list(owner))))
    .flat()
    .filter((binding) => binding.instanceId === identity.instanceId);
  expect(bindings).toHaveLength(1);
  expect(bindings[0]?.revision).toBe(1);
});
