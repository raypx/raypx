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
export const configurationContract = {
  public: oc.input(z.object({})).output(publicConfigurationSchema),
  access: oc.input(z.object({})).output(z.object({ allowed: z.boolean() })),
  get: oc.input(z.object({})).output(
    configurationSnapshotSchema.extend({
      deployment: z.object({ jobsEnabled: z.boolean(), mailConfigured: z.boolean() }),
    }),
  ),
  update: oc.input(configurationUpdateSchema).output(configurationSnapshotSchema),
};
