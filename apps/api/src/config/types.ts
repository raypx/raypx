import type { AuthSession } from "@raypx/core/auth";
import type {
  ConfigurationSnapshot,
  ConfigurationValues,
  ResendSettingsSnapshot,
  ResendSettingsUpdate,
  StorageSettingsSnapshot,
  StorageSettingsUpdate,
} from "@raypx/contracts/api";

export interface StorageSettingsService {
  read(): Promise<StorageSettingsSnapshot>;
  update(input: StorageSettingsUpdate): Promise<StorageSettingsSnapshot>;
}

export interface ResendSettingsService {
  read(): Promise<ResendSettingsSnapshot>;
  update(input: ResendSettingsUpdate): Promise<ResendSettingsSnapshot>;
}

/** Inject this capability into consumers that only need to read settings. */
export interface ConfigReader {
  read(this: void): Promise<ConfigurationSnapshot>;
}

export interface ConfigService extends ConfigReader {
  /** Briefly cached read for public pages and pre-checks; authoritative paths use read(). */
  readCached(this: void): Promise<ConfigurationSnapshot>;
  /** Pass a freshly resolved server session, never identity supplied by a client. */
  update(
    this: void,
    input: Pick<ConfigurationSnapshot, "values" | "revision">,
    auth: AuthSession | null,
  ): Promise<ConfigurationSnapshot>;
}

/** Storage adapters must atomically compare revisions, returning null on conflict. */
export interface ConfigRepository extends ConfigReader {
  update(
    this: void,
    values: ConfigurationValues,
    revision: number,
    actorId: string,
  ): Promise<ConfigurationSnapshot | null>;
}
