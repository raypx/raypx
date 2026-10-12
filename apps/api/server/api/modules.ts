import {
  createPublicAuthCapabilities,
  type AuthSettings,
  type MailSettingsFallback,
  type SystemSettingsRepository,
  type UserRepository,
} from "@voidmix/core";
import {
  createUserAdministration,
  type AgentRunApplication,
  type ExecutionApplication,
  type ProjectApplication,
  type AssetApplication,
  type ReviewApplication,
  type ActivityApplication,
  type CloudApplication,
} from "@voidmix/application";
import type { ObjectStorage } from "@voidmix/core";
import type { CloudCapabilitiesDto } from "@voidmix/contracts";

interface CloudApiModules {
  cloud?: CloudApplication;
  objectStorage?: ObjectStorage;
  cloudCapabilities?: CloudCapabilitiesDto;
  traceOperation?: <Result>(name: string, operation: () => Promise<Result>) => Promise<Result>;
}

export interface CreateApiModulesOptions extends CloudApiModules {
  v2Projects: ProjectApplication;
  v2AgentRuns?: AgentRunApplication;
  execution?: ExecutionApplication;
  users: UserRepository;
  settings: SystemSettingsRepository;
  mailFallback: MailSettingsFallback;
  now?: () => Date;
  id?: () => string;
  resolveAuthSettings?: () => Promise<AuthSettings>;
  assets: AssetApplication;
  reviews: ReviewApplication;
  activity: ActivityApplication;
  reportError?: (error: unknown) => void;
}

export interface ApiModules extends CloudApiModules {
  v2Projects: ProjectApplication;
  v2AgentRuns?: AgentRunApplication;
  execution?: ExecutionApplication;
  users: ReturnType<typeof createUserAdministration>;
  publicAuthCapabilities: ReturnType<typeof createPublicAuthCapabilities>;
  assets: AssetApplication;
  reviews: ReviewApplication;
  activity: ActivityApplication;
  reportError?: (error: unknown) => void;
}

export function createApiModules(options: CreateApiModulesOptions): ApiModules {
  return {
    v2Projects: options.v2Projects,
    assets: options.assets,
    reviews: options.reviews,
    activity: options.activity,
    ...(options.cloud ? { cloud: options.cloud } : {}),
    ...(options.objectStorage ? { objectStorage: options.objectStorage } : {}),
    ...(options.cloudCapabilities ? { cloudCapabilities: options.cloudCapabilities } : {}),
    ...(options.reportError ? { reportError: options.reportError } : {}),
    ...(options.traceOperation ? { traceOperation: options.traceOperation } : {}),
    ...(options.execution ? { execution: options.execution } : {}),
    ...(options.v2AgentRuns ? { v2AgentRuns: options.v2AgentRuns } : {}),
    users: createUserAdministration({
      users: options.users,
      ...(options.now ? { now: options.now } : {}),
      ...(options.id ? { id: options.id } : {}),
    }),
    publicAuthCapabilities: createPublicAuthCapabilities({
      settings: options.settings,
      mailFallback: options.mailFallback,
      ...(options.resolveAuthSettings ? { resolveAuthSettings: options.resolveAuthSettings } : {}),
    }),
  };
}
