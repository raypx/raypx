import {
  AssetDomainError,
  CloudDomainError,
  ExecutionDomainError,
  AgentRunV2DomainError,
  DomainError,
  ProjectV2DomainError,
} from "@voidmix/core";
import { ORPCError } from "@orpc/server";

type ApiErrorValues = Record<string, string | number | boolean | null>;

export function createApiError(
  transportCode: string,
  detailCode = transportCode,
  values?: ApiErrorValues,
): ORPCError<string, unknown> {
  return new ORPCError(transportCode, {
    data: {
      error: {
        code: detailCode,
        ...(values ? { values } : {}),
      },
    },
  });
}

export function mapDomainError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ORPCError) return error;
  const transportCode =
    error instanceof CloudDomainError
      ? cloudErrors[error.code]
      : error instanceof AssetDomainError
        ? assetErrors[error.code]
        : error instanceof ExecutionDomainError
          ? executionErrors[error.code]
          : error instanceof ProjectV2DomainError
            ? projectErrors[error.code]
            : error instanceof AgentRunV2DomainError
              ? agentErrors[error.code]
              : error instanceof DomainError
                ? userErrors[error.code]
                : undefined;
  if (transportCode && error instanceof Error && "code" in error) {
    return createApiError(transportCode, String(error.code));
  }
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    data: { error: { code: "INTERNAL_SERVER_ERROR" } },
  });
}

const projectErrors = {
  PROJECT_MEMBER_NOT_FOUND: "NOT_FOUND",
  PROJECT_MEMBER_INVALID_ROLE: "BAD_REQUEST",
  PROJECT_SCOPE_INVALID: "BAD_REQUEST",
  PROJECT_ACCESS_DENIED: "FORBIDDEN",
} satisfies Record<ProjectV2DomainError["code"], string>;
const agentErrors = {
  AGENT_RUN_INVALID_INPUT: "BAD_REQUEST",
  AGENT_RUN_TERMINAL: "CONFLICT",
} satisfies Record<AgentRunV2DomainError["code"], string>;
const userErrors: Readonly<Record<string, string | undefined>> = {
  USER_NOT_FOUND: "NOT_FOUND",
  SELF_SUSPENSION: "CONFLICT",
  LAST_ADMIN: "CONFLICT",
  EMAIL_ALREADY_EXISTS: "CONFLICT",
  BAD_REQUEST: "BAD_REQUEST",
} satisfies Partial<Record<DomainError["code"], string>>;

const executionErrors = {
  EXECUTION_ACCESS_DENIED: "FORBIDDEN",
  DEVICE_UNAUTHORIZED: "UNAUTHORIZED",
  DEVICE_NOT_BOUND: "CONFLICT",
  RUN_NOT_FOUND: "NOT_FOUND",
  RUN_ACTIVE: "CONFLICT",
  RUN_TERMINAL: "CONFLICT",
  RUN_INVALID_TRANSITION: "CONFLICT",
  RUN_EVENT_GAP: "CONFLICT",
  RUN_EVENT_CONFLICT: "CONFLICT",
  RUN_CLAIM_INVALID: "FORBIDDEN",
  COMMAND_INVALID: "BAD_REQUEST",
  IDEMPOTENCY_CONFLICT: "CONFLICT",
} satisfies Record<ExecutionDomainError["code"], string>;

const assetErrors: Record<string, string> = {
  BLOB_TOO_LARGE: "BAD_REQUEST",
  BLOB_CHECKSUM_MISMATCH: "BAD_REQUEST",
  BLOB_UPLOAD_EXPIRED: "BAD_REQUEST",
  BLOB_NOT_FOUND: "NOT_FOUND",
  BLOB_UNSUPPORTED_MEDIA_TYPE: "BAD_REQUEST",
};
const cloudErrors: Record<CloudDomainError["code"], string> = {
  CLOUD_ACCESS_DENIED: "FORBIDDEN",
  CLOUD_NOT_FOUND: "NOT_FOUND",
  CLOUD_INVALID_INPUT: "BAD_REQUEST",
  CLOUD_RUN_ACTIVE: "CONFLICT",
  CLOUD_RUN_TERMINAL: "CONFLICT",
  CLOUD_OWNER_INVALID: "CONFLICT",
  CLOUD_BUDGET_EXCEEDED: "CONFLICT",
  CLOUD_IDEMPOTENCY_CONFLICT: "CONFLICT",
  CLOUD_REVISION_INVALID: "CONFLICT",
};
