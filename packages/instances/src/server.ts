import { z } from "zod";
import {
  InstanceError,
  instanceIdentitySchema,
  instanceReceiptSchema,
  instanceOrigin,
  enrollmentProof,
  instanceCheckProof,
  type EnrollmentBegin,
  type InstanceBinding,
  type InstanceReceipt,
} from "./index.ts";
export const enrollmentRecordSchema = z.object({
  id: z.uuid(),
  identity: instanceIdentitySchema,
  tokenHash: z.string().length(64),
  codeHash: z.string().length(64),
  expiresAt: z.iso.datetime(),
  receipt: instanceReceiptSchema.optional(),
});
export type EnrollmentRecord = z.infer<typeof enrollmentRecordSchema>;
export interface InstanceTransaction {
  enrollment(id: string): Promise<EnrollmentRecord | undefined>;
  saveEnrollment(value: EnrollmentRecord): Promise<void>;
  instance(id: string): Promise<InstanceBinding | undefined>;
  saveInstance(value: InstanceBinding): Promise<void>;
}
export interface InstanceRepository {
  transaction<T>(key: string, run: (tx: InstanceTransaction) => Promise<T>): Promise<T>;
  findCode(hash: string): Promise<EnrollmentRecord | undefined>;
  list(accountId: string): Promise<InstanceBinding[]>;
}
export class InstanceService {
  private readonly origin: string;
  constructor(
    private readonly options: {
      origin: string;
      repository: InstanceRepository;
      digest(value: string): string;
      verify(key: string, value: string, signature: string): boolean;
      issue(binding: InstanceBinding): InstanceReceipt;
      issuerKey: string;
      now?: () => number;
    },
  ) {
    this.origin = instanceOrigin(options.origin);
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  async begin(input: EnrollmentBegin) {
    const { proof, ...identity } = input;
    if (!this.options.verify(identity.publicKey, enrollmentProof(this.origin, identity), proof))
      throw new InstanceError("INSTANCE_INVALID_PROOF");
    const id = crypto.randomUUID(),
      token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from(
      crypto.getRandomValues(new Uint8Array(10)),
      (n) => alphabet[n % alphabet.length],
    ).join("");
    const expiresAt = new Date(this.now() + 600_000).toISOString();
    await this.options.repository.transaction(identity.instanceId, async (tx) => {
      await tx.saveEnrollment({
        id,
        identity,
        tokenHash: this.options.digest(token),
        codeHash: this.options.digest(code),
        expiresAt,
      });
    });
    return { id, token, code, expiresAt, issuerKey: this.options.issuerKey };
  }
  async inspect(code: string) {
    const record = await this.options.repository.findCode(this.options.digest(code));
    if (!record || Date.parse(record.expiresAt) <= this.now())
      throw new InstanceError("INSTANCE_ENROLLMENT_EXPIRED");
    return record.identity;
  }
  async approve(accountId: string, code: string) {
    const found = await this.options.repository.findCode(this.options.digest(code));
    if (!found) throw new InstanceError("INSTANCE_ENROLLMENT_EXPIRED");
    return this.options.repository.transaction(found.identity.instanceId, async (tx) => {
      const record = await tx.enrollment(found.id);
      if (!record || Date.parse(record.expiresAt) <= this.now())
        throw new InstanceError("INSTANCE_ENROLLMENT_EXPIRED");
      if (record.receipt) {
        if (record.receipt.binding.accountId !== accountId)
          throw new InstanceError("INSTANCE_OWNER_MISMATCH");
        return { approved: true as const };
      }
      const old = await tx.instance(record.identity.instanceId);
      if (
        old &&
        (old.accountId !== accountId ||
          old.publicKey !== record.identity.publicKey ||
          old.status === "revoked")
      )
        throw new InstanceError("INSTANCE_OWNER_MISMATCH");
      const binding: InstanceBinding = {
        ...record.identity,
        version: 1,
        origin: this.origin,
        accountId,
        revision: old?.revision ?? 1,
        status: "registered",
        issuedAt: new Date(this.now()).toISOString(),
      };
      await tx.saveInstance(binding);
      await tx.saveEnrollment({ ...record, receipt: this.options.issue(binding) });
      return { approved: true as const };
    });
  }
  async poll(id: string, token: string) {
    return this.options.repository.transaction(id, async (tx) => {
      const record = await tx.enrollment(id);
      if (
        !record ||
        record.tokenHash !== this.options.digest(token) ||
        Date.parse(record.expiresAt) <= this.now()
      )
        throw new InstanceError("INSTANCE_ENROLLMENT_EXPIRED");
      if (!record.receipt) return { status: "pending" as const };
      const binding = await tx.instance(record.identity.instanceId);
      if (!binding) throw new InstanceError("INSTANCE_NOT_FOUND");
      return { status: "approved" as const, receipt: this.options.issue(binding) };
    });
  }
  list(accountId: string) {
    return this.options.repository.list(accountId);
  }
  async revoke(accountId: string, id: string) {
    return this.options.repository.transaction(id, async (tx) => {
      const old = await tx.instance(id);
      if (!old || old.accountId !== accountId) throw new InstanceError("INSTANCE_NOT_FOUND");
      if (old.status !== "revoked")
        await tx.saveInstance({
          ...old,
          status: "revoked",
          revision: old.revision + 1,
          issuedAt: new Date(this.now()).toISOString(),
        });
      return { revoked: true as const };
    });
  }
  async check(input: { instanceId: string; timestamp: number; proof: string }) {
    return this.options.repository.transaction(input.instanceId, async (tx) => {
      const binding = await tx.instance(input.instanceId);
      if (
        !binding ||
        Math.abs(input.timestamp - this.now()) > 60_000 ||
        !this.options.verify(
          binding.publicKey,
          instanceCheckProof(this.origin, input.instanceId, input.timestamp),
          input.proof,
        )
      )
        throw new InstanceError("INSTANCE_INVALID_PROOF");
      return this.options.issue(binding);
    });
  }
}
