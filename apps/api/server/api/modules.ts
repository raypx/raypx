import {
  createPublicAuthCapabilities,
  type AuthSettings,
  type MailSettingsFallback,
  type SystemSettingsRepository,
} from "@raypx/core";
import {
  type ProjectApplication,
  type AssetApplication,
  type ReviewApplication,
  type ActivityApplication,
  type CloudApplication,
} from "@raypx/application";
import type { ObjectStorage } from "@raypx/core";
import type { CloudCapabilitiesDto } from "@raypx/contracts";

interface CloudApiModules {
  cloud?: CloudApplication;
  objectStorage?: ObjectStorage;
  cloudCapabilities?: CloudCapabilitiesDto;
  traceOperation?: <Result>(name: string, operation: () => Promise<Result>) => Promise<Result>;
}

export interface CreateApiModulesOptions extends CloudApiModules {
  v2Projects: ProjectApplication;
  settings: SystemSettingsRepository;
  mailFallback: MailSettingsFallback;
  resolveAuthSettings?: () => Promise<AuthSettings>;
  assets: AssetApplication;
  reviews: ReviewApplication;
  activity: ActivityApplication;
  reportError?: (error: unknown) => void;
}

export interface ApiModules extends CloudApiModules {
  v2Projects: ProjectApplication;
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
    publicAuthCapabilities: createPublicAuthCapabilities({
      settings: options.settings,
      mailFallback: options.mailFallback,
      ...(options.resolveAuthSettings ? { resolveAuthSettings: options.resolveAuthSettings } : {}),
    }),
  };
}
