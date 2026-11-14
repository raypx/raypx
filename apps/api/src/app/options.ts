import type { AuditService } from "../admin/audit.js";
import type { AdministrationQueries } from "../admin/types.js";
import type {
  ConfigService,
  ResendSettingsService,
  StorageSettingsService,
} from "../config/types.js";
import type { AuthSession } from "@raypx/core/auth";
import type { AccessPolicy } from "../access.js";
import type { ApiLogging } from "../logging.js";
import type { RateLimiter } from "../rate-limit/types.js";
import type { SpaceAccess, SpaceManagement } from "@raypx/spaces/server";
import type { ConversationsRepository, AgentsRepository } from "@raypx/agents/server";
import type { ConversationModels } from "../conversations/models.js";
/** Every service is required: an absent one is a composition error, not a runtime state. */
export interface ApiAppOptions {
  registration?: { status(): Promise<{ bootstrap: boolean; setupTokenRequired: boolean }> };
  testMail?: (input: { email: string; locale?: "en" | "zh" }) => Promise<void>;
  passwordResetLinks?: (
    actorId: string,
    targetId: string,
  ) => Promise<{ token: string; expiresAt: string }>;
  notifications: import("@raypx/agents/server").MemberNotificationsService;
  deviceFiles: import("@raypx/computers/server").DeviceMemberFilesService;
  messageAttachments: import("@raypx/agents/server").MessageAttachmentsService;
  deviceComputers: import("@raypx/computers/server").DeviceComputersService;
  deviceConnector: import("@raypx/computers/server").DeviceConnectorRegistry;
  pages: import("@raypx/pages/server").PagesService;
  skills: import("@raypx/skills/server").SkillsService;
  openApiServers: import("../conversations/openapi-servers.js").OpenApiServersService;
  mcpServers: import("../conversations/mcp-servers.js").McpServersService;
  routines: import("@raypx/jobs/routines").RoutinesService;
  spaceMemory: import("@raypx/memory/space-server").SpaceMemoryService;
  routineEmailRelayToken?: string;
  modelConnections: ReturnType<
    typeof import("../conversations/connections.js").createModelConnections
  >;
  protectedInputs: import("@raypx/agents/server").ProtectedInputsService;
  agentApprovals: import("@raypx/agents/server").ApprovalsService;
  computers: import("@raypx/computers/server").ComputersService;
  computerScreens: import("@raypx/computers/server").ComputerScreensService;
  spaces: SpaceAccess;
  spaceManagement: SpaceManagement;
  agents: AgentsRepository;
  conversations: ConversationsRepository;
  conversationModels: Pick<ConversationModels, "list">;
  audit?: AuditService;
  administration: AdministrationQueries;
  access?: AccessPolicy;
  config: ConfigService;
  storageSettings: StorageSettingsService;
  resendSettings: ResendSettingsService;
  jobsEnabled?: boolean;
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
