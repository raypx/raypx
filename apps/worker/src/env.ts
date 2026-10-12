import { createEnv, z } from "@voidmix/shared/env";
import { runtimeEnv } from "@voidmix/shared/env/runtime";
const enabled = (initial: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(initial)
    .transform((value) => value === "true");
const documentServer = {
  SOFFICE_BINARY: z.string().min(1).default("/usr/bin/libreoffice"),
  CLOUD_PDF_FONT_PATH: z.string().min(1).optional(),
  CLOUD_PDF_FONT_FAMILY: z.string().min(1).optional(),
  CLOUD_PPTX_FONT_FACE: z.string().min(1).default("Noto Sans CJK SC"),
  PDFTOTEXT_BINARY: z.string().min(1).default("/usr/bin/pdftotext"),
  PDFINFO_BINARY: z.string().min(1).default("/usr/bin/pdfinfo"),
};
export function getDocumentEnvironment() {
  return createEnv({ extends: [runtimeEnv], server: documentServer });
}
export function getWorkerEnvironment(
  values?: Record<string, string | boolean | number | undefined>,
) {
  return createEnv({
    extends: [runtimeEnv],
    server: {
      DATABASE_URL: z.url(),
      CLOUD_EXECUTION_GATEWAY_URL: z.url().default("http://localhost:3002"),
      CLOUD_ACCOUNT_MODEL_CALL_LIMIT: z.coerce.number().int().positive().optional(),
      CLOUD_ACCOUNT_CONCURRENCY: z.coerce.number().int().positive().optional(),
      CLOUD_ACCOUNT_STORAGE_BYTES: z.coerce.number().int().positive().optional(),
      CLOUD_DELEGATION_ENABLED: enabled("true"),
      CLOUD_EXPORT_ENABLED: enabled("true"),
      CLOUD_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(3),
      CLOUD_WEB_URL: z.url().default("http://localhost:3000"),
      BLOB_STORAGE_DIR: z.string().min(1).optional(),
      S3_BUCKET: z.string().min(1).optional(),
      S3_REGION: z.string().min(1).default("us-east-1"),
      S3_ENDPOINT: z.url().optional(),
      S3_FORCE_PATH_STYLE: enabled("false"),
      S3_ACCESS_KEY_ID: z.string().min(1).optional(),
      S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
      ...documentServer,
      SENTRY_DSN: z.url().optional(),
    },
    ...(values ? { runtimeEnv: values } : {}),
  });
}
