import type { AuditService } from "../admin/audit.js";
import type { AdministrationQueries } from "../admin/types.js";
import type { InstanceService } from "@raypx/instances/server";
import type {
  ConfigService,
  ResendSettingsService,
  StorageSettingsService,
} from "../config/types.js";
import type { ControlService, ResolveTaskContext } from "@raypx/control";
import type { SessionAttachments } from "../storage/types.js";
import type { AuthSession } from "@raypx/core/auth";
import type { AccessPolicy } from "../access.js";
import type { ApiLogging } from "../logging.js";
import type { RateLimiter } from "../rate-limit/types.js";
import type { CloudJobsService } from "@raypx/jobs/server";
import type { ContextLibraryService } from "@raypx/memory/server";
import type { SpaceAccess } from "@raypx/spaces/server";
import type { ConversationsRepository, AgentsRepository } from "@raypx/agents/server";
/** Every service is required: an absent one is a composition error, not a runtime state. */
export interface ApiAppOptions {
  spaces: SpaceAccess;
  agents: AgentsRepository;
  conversations: ConversationsRepository;
  instances: InstanceService;
  audit?: AuditService;
  administration: AdministrationQueries;
  access?: AccessPolicy;
  config: ConfigService;
  storageSettings: StorageSettingsService;
  resendSettings: ResendSettingsService;
  jobsEnabled?: boolean;
  control: ControlService;
  cloudJobs: CloudJobsService;
  memory: ContextLibraryService;
  attachments: SessionAttachments;
  resolveContext: ResolveTaskContext;
  onRevoke?: (userId: string, deviceId: string) => Promise<void>;
  authHandler(request: Request): Promise<Response>;
  readSession(headers: Headers): Promise<AuthSession | null>;
  allowedOrigins: string[];
  mailAvailable?: () => Promise<boolean>;
  logger?: ApiLogging;
  rateLimit?: RateLimiter;
  /** Platform-owned, sanitized client address header, never a fallback header supplied by callers. */
  clientIpHeader?: string;
  /** Upper bound for producing one RPC response (default 15 s). */
  rpcTimeoutMs?: number;
  /** Named dependency probes for `/ready`; each resolves when the dependency answers. */
  readiness?: Record<string, () => Promise<unknown>>;
}
