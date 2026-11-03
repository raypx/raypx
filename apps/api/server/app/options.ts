import type { InstanceService } from "@raypx/instances/server";
import type { ConfigurationService } from "../configuration/types.js";
import type { ControlService } from "@raypx/control";
import type { AuthSession } from "@raypx/auth/types";
import type { AccessPolicy } from "../access.js";
import type { ApiLogging } from "../logging.js";
import type { RateLimiter } from "../rate-limit/types.js";
import type { CloudJobsService } from "@raypx/jobs/server";
import type { ContextLibraryService } from "@raypx/memory/server";
export interface ApiAppOptions {
  instances?: InstanceService;
  access?: AccessPolicy;
  configuration?: ConfigurationService;
  jobsEnabled?: boolean;
  control?: ControlService;
  cloudJobs?: CloudJobsService;
  memory?: ContextLibraryService;
  onRevoke?: (userId: string, deviceId: string) => Promise<void>;
  authHandler(request: Request): Promise<Response>;
  readSession(headers: Headers): Promise<AuthSession | null>;
  allowedOrigins: string[];
  mailAvailable?: boolean;
  logger?: ApiLogging;
  rateLimit?: RateLimiter;
  /** Platform-owned, sanitized client address header, never a fallback header supplied by callers. */
  clientIpHeader?: string;
  /** Upper bound for producing one RPC response (default 15 s). */
  rpcTimeoutMs?: number;
  /** Named dependency probes for `/ready`; each resolves when the dependency answers. */
  readiness?: Record<string, () => Promise<unknown>>;
}
