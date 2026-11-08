import { z } from "zod";
const normalizedUrl = z.url({ protocol: /^https?$/, normalize: true });
export const instanceOrigin = (value: string) => {
  const unsafe = Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 32 || code === 127 || character === "\\";
  });
  if (value.length > 2048 || unsafe) throw new InstanceError("INSTANCE_INVALID_ORIGIN");
  const result = normalizedUrl.safeParse(value);
  if (!result.success) throw new InstanceError("INSTANCE_INVALID_ORIGIN");
  const match = /^(https?):\/\/([^/?#@]+)\/$/.exec(result.data);
  if (
    !match ||
    (match[1] === "http" && !/^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$/.test(match[2]!))
  )
    throw new InstanceError("INSTANCE_INVALID_ORIGIN");
  return result.data.slice(0, -1);
};
const key = z.string().min(32).max(1024);
export const instanceIdentitySchema = z.object({
  instanceId: z.uuid(),
  publicKey: key,
  name: z.string().trim().min(1).max(120),
  platform: z.string().min(1).max(30),
  appVersion: z.string().min(1).max(120),
});
export const instanceBindingSchema = instanceIdentitySchema.extend({
  version: z.literal(1),
  origin: z.string().url(),
  accountId: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  status: z.enum(["registered", "revoked"]),
  issuedAt: z.iso.datetime(),
});
export const instanceReceiptSchema = z.object({
  binding: instanceBindingSchema,
  signature: z.string().min(32).max(1024),
  issuerKey: key,
});
export const enrollmentBeginSchema = instanceIdentitySchema.extend({
  proof: z.string().min(32).max(1024),
});
export const enrollmentPollSchema = z.object({ id: z.uuid(), token: z.string().min(64).max(128) });
export const enrollmentCodeSchema = z.object({ code: z.string().regex(/^[A-Z2-9]{10}$/) });
export const instanceCheckSchema = z.object({
  instanceId: z.uuid(),
  timestamp: z.number().int().positive(),
  proof: z.string().min(32).max(1024),
});
export const instanceStatusSchema = z.object({
  state: z.enum(["unregistered", "registered", "revoked", "unavailable"]),
  binding: instanceBindingSchema.optional(),
});
export const enrollmentStartSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  token: z.string(),
  expiresAt: z.iso.datetime(),
  issuerKey: key,
});
export const enrollmentResultSchema = z.object({
  status: z.enum(["pending", "approved"]),
  receipt: instanceReceiptSchema.optional(),
});
export type InstanceIdentity = z.infer<typeof instanceIdentitySchema>;
export type InstanceBinding = z.infer<typeof instanceBindingSchema>;
export type InstanceReceipt = z.infer<typeof instanceReceiptSchema>;
export type InstanceStatus = z.infer<typeof instanceStatusSchema>;
export type EnrollmentBegin = z.infer<typeof enrollmentBeginSchema>;
export class InstanceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "InstanceError";
  }
}
export const enrollmentProof = (origin: string, identity: InstanceIdentity) =>
  JSON.stringify([
    "raypx-enrollment-v1",
    instanceOrigin(origin),
    identity.instanceId,
    identity.publicKey,
    identity.name,
    identity.platform,
    identity.appVersion,
  ]);
export const instanceCheckProof = (origin: string, instanceId: string, timestamp: number) =>
  JSON.stringify(["raypx-instance-check-v1", instanceOrigin(origin), instanceId, timestamp]);
export const receiptPayload = (binding: InstanceBinding) =>
  JSON.stringify(instanceBindingSchema.parse(binding));
