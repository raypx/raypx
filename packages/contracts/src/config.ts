import { exposeApiTo } from "./exposure.js";
import { rpcAccess, rpcAudit } from "./policy.js";
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
export const publicConfigurationSchema = configurationValuesSchema
  .pick({
    siteName: true,
    registrationEnabled: true,
  })
  .extend({
    bootstrap: z.boolean(),
    setupTokenRequired: z.boolean(),
    mailConfigured: z.boolean(),
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
/** Administrator-owned supervisor location. HTTP requires a protected private channel. */
export const sandboxValuesSchema = z
  .strictObject({
    provider: z.enum(["none", "docker", "e2b"]),
    url: z
      .url({ protocol: /^https?$/, normalize: true })
      .max(2048)
      .regex(/^https?:\/\/[^/?#@]+\/?$/)
      .transform((value) => value.replace(/\/$/, ""))
      .nullable(),
    template: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
    screen: z.boolean(),
  })
  .refine((value) => {
    if (value.provider === "e2b")
      return Boolean(value.template && value.url === null && !value.screen);
    return value.template === undefined && (value.provider === "none" || value.url !== null);
  });
const sandboxSnapshotSchema = z.strictObject({
  values: sandboxValuesSchema,
  hasCredential: z.boolean(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
});
export const sandboxUpdateSchema = z.strictObject({
  values: sandboxValuesSchema,
  credential: z
    .string()
    .min(32)
    .max(512)
    .regex(/^[!-~]+$/)
    .optional(),
  revision: z.number().int().nonnegative(),
});
const sandboxTestSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("connected"),
    untrustedTenants: z.boolean(),
    runtime: z.enum(["runc", "runsc", "other"]),
    screen: z.boolean(),
  }),
  z.strictObject({ status: z.literal("e2b-connected") }),
  z.strictObject({
    status: z.enum(["not-configured", "authentication-failed", "timeout", "unavailable"]),
  }),
]);
export type SandboxSettingsSnapshot = z.infer<typeof sandboxSnapshotSchema>;
export type SandboxSettingsUpdate = z.infer<typeof sandboxUpdateSchema>;
export type SandboxConnectionTest = z.infer<typeof sandboxTestSchema>;
/** Configuration presence only; no addresses, credentials or other accounts' models. */
export const setupStatusSchema = z.strictObject({
  model: z.boolean(),
  sandbox: z.boolean(),
  mail: z.boolean(),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;
export const configurationContract = {
  setupStatus: oc
    .meta(exposeApiTo("renderer"), rpcAccess("configuration.read"))
    .input(z.strictObject({}))
    .output(setupStatusSchema),
  public: httpRead("/configuration", "configuration", "Read public site settings", "public")
    .meta(exposeApiTo("renderer"), rpcAccess("public"))
    .input(z.object({}))
    .output(publicConfigurationSchema),
  access: oc
    .meta(exposeApiTo("renderer"), rpcAccess("public"))
    .input(z.object({}))
    .output(z.object({ allowed: z.boolean() })),
  get: oc
    .meta(exposeApiTo("renderer"), rpcAccess("configuration.read"))
    .input(z.object({}))
    .output(
      configurationSnapshotSchema.extend({
        deployment: z.object({ jobsEnabled: z.boolean(), mailConfigured: z.boolean() }),
      }),
    ),
  update: oc
    .meta(
      exposeApiTo("renderer"),
      rpcAccess("configuration.update"),
      rpcAudit("configuration.update"),
    )
    .input(configurationUpdateSchema)
    .output(configurationSnapshotSchema),
  storage: oc
    .meta(exposeApiTo("web"), rpcAccess("configuration.read"))
    .input(z.strictObject({}))
    .output(storageSettingsSnapshotSchema),
  updateStorage: oc
    .meta(exposeApiTo("web"), rpcAccess("configuration.update"), rpcAudit("configuration.update"))
    .input(storageSettingsUpdateSchema)
    .output(storageSettingsSnapshotSchema),
  resend: oc
    .meta(exposeApiTo("web"), rpcAccess("configuration.read"))
    .input(z.strictObject({}))
    .output(resendSnapshotSchema),
  sandbox: oc
    .meta(exposeApiTo("web"), rpcAccess("configuration.read"))
    .input(z.strictObject({}))
    .output(sandboxSnapshotSchema),
  updateSandbox: oc
    .meta(exposeApiTo("web"), rpcAccess("configuration.update"), rpcAudit("configuration.update"))
    .input(sandboxUpdateSchema)
    .output(sandboxSnapshotSchema),
  testSandbox: oc
    .meta(exposeApiTo("web"), rpcAccess("configuration.read"))
    .input(z.strictObject({}))
    .output(sandboxTestSchema),
  testMail: oc
    .meta(exposeApiTo("web"), rpcAccess("configuration.read"))
    .input(z.strictObject({ locale: z.enum(["en", "zh"]).optional() }))
    .output(z.strictObject({ sent: z.boolean() })),
  updateResend: oc
    .meta(exposeApiTo("web"), rpcAccess("configuration.update"), rpcAudit("configuration.update"))
    .input(resendUpdateSchema)
    .output(resendSnapshotSchema),
};
