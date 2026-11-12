import { oc } from "@orpc/contract";
import { z } from "zod";

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
export const configurationContract = {
  public: oc.input(z.object({})).output(publicConfigurationSchema),
  access: oc.input(z.object({})).output(z.object({ allowed: z.boolean() })),
  get: oc.input(z.object({})).output(
    configurationSnapshotSchema.extend({
      deployment: z.object({ jobsEnabled: z.boolean(), mailConfigured: z.boolean() }),
    }),
  ),
  update: oc.input(configurationUpdateSchema).output(configurationSnapshotSchema),
  storage: oc.input(z.strictObject({})).output(storageSettingsSnapshotSchema),
  updateStorage: oc.input(storageSettingsUpdateSchema).output(storageSettingsSnapshotSchema),
};
