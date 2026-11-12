import { expect, it } from "vitest";
import { InstanceService, type InstanceRepository, type EnrollmentRecord } from "./server.js";
import {
  createInstanceKey,
  createInstanceSigner,
  instanceDigest,
  signProof,
  verifyProof,
  verifyInstanceReceipt,
} from "./crypto.js";
import {
  instanceOrigin,
  enrollmentProof,
  instanceCheckProof,
  type InstanceBinding,
} from "./index.js";
function fixture() {
  const instances = new Map<string, InstanceBinding>(),
    enrollments = new Map<string, EnrollmentRecord>();
  const repository: InstanceRepository = {
    transaction: async (_key, run) =>
      run({
        enrollment: async (id) => structuredClone(enrollments.get(id)),
        saveEnrollment: async (value) => {
          enrollments.set(value.id, structuredClone(value));
        },
        instance: async (id) => structuredClone(instances.get(id)),
        saveInstance: async (value) => {
          instances.set(value.instanceId, structuredClone(value));
        },
      }),
    findCode: async (hash) =>
      structuredClone([...enrollments.values()].find((row) => row.codeHash === hash)),
    list: async (owner) => [...instances.values()].filter((row) => row.accountId === owner),
  };
  let now = Date.now();
  const signer = createInstanceSigner("isolated-test-signer"),
    keys = createInstanceKey();
  const service = new InstanceService({
    repository,
    origin: "https://account.example",
    issuerKey: signer.publicKey,
    issue: (binding) => signer.issue(binding),
    digest: instanceDigest,
    verify: verifyProof,
    now: () => now,
  });
  const identity = {
    instanceId: crypto.randomUUID(),
    publicKey: keys.publicKey,
    name: "Fixture",
    platform: "linux",
    appVersion: "0.1.0",
  };
  const begin = () =>
    service.begin({
      ...identity,
      proof: signProof(keys.privateKey, enrollmentProof("https://account.example", identity)),
    });
  return {
    service,
    identity,
    keys,
    signer,
    begin,
    advance: () => {
      now += 600_001;
    },
    now: () => now,
  };
}
it("registers only after an authenticated owner decision and preserves the receipt on retries", async () => {
  const f = fixture(),
    pending = await f.begin();
  expect(await f.service.poll(pending.id, pending.token)).toEqual({ status: "pending" });
  expect(await f.service.inspect(pending.code)).toEqual(f.identity);
  await f.service.approve("owner", pending.code);
  const result = await f.service.poll(pending.id, pending.token);
  expect(verifyInstanceReceipt(result.receipt, f.signer.publicKey).binding.accountId).toBe("owner");
  await expect(f.service.approve("another-owner", pending.code)).rejects.toMatchObject({
    code: "INSTANCE_OWNER_MISMATCH",
  });
  await f.service.approve("owner", pending.code);
  expect(await f.service.poll(pending.id, pending.token)).toEqual(result);
  expect(await f.service.list("another-owner")).toEqual([]);
});
it("rejects cross-origin proof, invalid signatures, bad polling tokens and expired codes", async () => {
  const f = fixture();
  await expect(
    f.service.begin({
      ...f.identity,
      proof: signProof(f.keys.privateKey, enrollmentProof("https://other.example", f.identity)),
    }),
  ).rejects.toMatchObject({ code: "INSTANCE_INVALID_PROOF" });
  const p = await f.begin();
  await expect(f.service.poll(p.id, "0".repeat(64))).rejects.toThrow(/INSTANCE_/);
  f.advance();
  await expect(f.service.approve("owner", p.code)).rejects.toMatchObject({
    code: "INSTANCE_ENROLLMENT_EXPIRED",
  });
  await expect(f.service.poll(p.id, p.token)).rejects.toThrow(/INSTANCE_/);
});
it("fences ownership, signs revocation, and rejects an old possession proof", async () => {
  const f = fixture(),
    p = await f.begin();
  await f.service.approve("owner", p.code);
  await expect(f.service.revoke("other", f.identity.instanceId)).rejects.toMatchObject({
    code: "INSTANCE_NOT_FOUND",
  });
  await f.service.revoke("owner", f.identity.instanceId);
  await f.service.revoke("owner", f.identity.instanceId);
  const timestamp = f.now();
  const receipt = await f.service.check({
    instanceId: f.identity.instanceId,
    timestamp,
    proof: signProof(
      f.keys.privateKey,
      instanceCheckProof("https://account.example", f.identity.instanceId, timestamp),
    ),
  });
  expect(verifyInstanceReceipt(receipt, f.signer.publicKey).binding).toMatchObject({
    status: "revoked",
    revision: 2,
  });
  const another = await f.begin();
  await expect(f.service.approve("owner", another.code)).rejects.toMatchObject({
    code: "INSTANCE_OWNER_MISMATCH",
  });
  f.advance();
  await expect(
    f.service.check({
      instanceId: f.identity.instanceId,
      timestamp,
      proof: signProof(
        f.keys.privateKey,
        instanceCheckProof("https://account.example", f.identity.instanceId, timestamp),
      ),
    }),
  ).rejects.toThrow(/INSTANCE_/);
});
it("rejects tampered receipts and an issuer different from the enrolled issuer", async () => {
  const f = fixture(),
    p = await f.begin();
  await f.service.approve("owner", p.code);
  const { receipt } = await f.service.poll(p.id, p.token);
  expect(() =>
    verifyInstanceReceipt(
      { ...receipt, binding: { ...receipt!.binding, accountId: "other" } },
      f.signer.publicKey,
    ),
  ).toThrow(/INSTANCE_/);
  expect(() => verifyInstanceReceipt(receipt, createInstanceSigner("another").publicKey)).toThrow(
    /INSTANCE_/,
  );
});

it("accepts only credential-free HTTPS or loopback origins", () => {
  for (const value of [
    "https://EXAMPLE.test:443/",
    "http://127.0.0.1:3002",
    "http://[::1]:3002",
    "http://localhost",
  ]) {
    expect(instanceOrigin(value).endsWith("/")).toBe(false);
  }
  for (const value of [
    "http://public.example",
    "https://user:pass@example.test",
    "https://example.test/path",
    "https://example.test?query",
    "https://example.test#hash",
    "https://example.test\\n",
    "https://example.test\\\\@attacker.test",
    "file:///tmp/test",
  ]) {
    expect(() => instanceOrigin(value)).toThrow("INSTANCE_INVALID_ORIGIN");
  }
});
