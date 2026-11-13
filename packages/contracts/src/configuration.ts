import { oc } from "@orpc/contract";
import { z } from "zod";
import { httpRead } from "./http.js";

/** Explicit, non-secret settings. Never accept arbitrary environment keys. */
export const configurationValuesSchema = z.strictObject({
  siteName: z.string().trim().min(1).max(60),
  registrationEnabled: z.boolean(),
  cleanupEnabled: z.boolean(),
});
export type ConfigurationValues = z.infer<typeof configurationValuesSchema>;
export const configurationDefaults: ConfigurationValues = {
  siteName: "Raypx",
  registrationEnabled: true,
  cleanupEnabled: true,
};
export const configurationSnapshotSchema = z.object({
  values: configurationValuesSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
});
export type ConfigurationSnapshot = z.infer<typeof configurationSnapshotSchema>;
export const configurationUpdateSchema = z.strictObject({
  values: configurationValuesSchema,
  revision: z.number().int().nonnegative(),
});
export const publicConfigurationSchema = configurationValuesSchema.pick({
  siteName: true,
  registrationEnabled: true,
});
export const storageLocationSchema = z.strictObject({
  endpoint: z
    .url({ protocol: /^https?$/, normalize: true })
    .max(2_048)
    .transform((value) => value.replace(/\/$/, "")),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  region: z.string().regex(/^[a-z0-9-]{1,64}$/),
});
export const storageCredentialsSchema = z.strictObject({
  accessKeyId: z.string().min(1).max(512),
  secretAccessKey: z.string().min(1).max(512),
});
const storageSettingsSchema = storageLocationSchema.extend({ enabled: z.boolean() });
const storageSettingsSnapshotSchema = z.strictObject({
  values: storageSettingsSchema.nullable(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
});
const storageSettingsUpdateSchema = z.strictObject({
  values: storageSettingsSchema,
  revision: z.number().int().nonnegative(),
  credentials: storageCredentialsSchema.optional(),
});
export type StorageSettingsSnapshot = z.infer<typeof storageSettingsSnapshotSchema>;
export type StorageSettingsUpdate = z.infer<typeof storageSettingsUpdateSchema>;
const addressSchema = z.email();
const resendSenderSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .refine((value) => {
    if (/[\r\n\t]/.test(value)) return false;
    const mailbox = /^[^<>]+ <([^<>]+)>$/.exec(value);
    return addressSchema.safeParse(mailbox?.[1] ?? value).success;
  });
const resendValuesSchema = z.strictObject({
  from: resendSenderSchema,
  defaultLocale: z.enum(["en", "zh"]),
  enabled: z.boolean(),
});
const resendSnapshotSchema = z.strictObject({
  values: resendValuesSchema.nullable(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
});
export const resendUpdateSchema = z.strictObject({
  values: resendValuesSchema,
  apiKey: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[!-~]+$/)
    .optional(),
  revision: z.number().int().nonnegative(),
});
export type ResendSettingsSnapshot = z.infer<typeof resendSnapshotSchema>;
export type ResendSettingsUpdate = z.infer<typeof resendUpdateSchema>;
export const configurationContract = {
  public: httpRead("/configuration", "configuration", "Read public site settings", "public")
    .input(z.object({}))
    .output(publicConfigurationSchema),
  access: oc.input(z.object({})).output(z.object({ allowed: z.boolean() })),
  get: oc.input(z.object({})).output(
    configurationSnapshotSchema.extend({
      deployment: z.object({ jobsEnabled: z.boolean(), mailConfigured: z.boolean() }),
    }),
  ),
  update: oc.input(configurationUpdateSchema).output(configurationSnapshotSchema),
  storage: oc.input(z.strictObject({})).output(storageSettingsSnapshotSchema),
  updateStorage: oc.input(storageSettingsUpdateSchema).output(storageSettingsSnapshotSchema),
  resend: oc.input(z.strictObject({})).output(resendSnapshotSchema),
  updateResend: oc.input(resendUpdateSchema).output(resendSnapshotSchema),
};
