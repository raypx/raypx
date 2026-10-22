import type { AuthSession } from "@raypx/auth/types";
import type { ConfigurationSnapshot, ConfigurationValues } from "@raypx/contracts/api";

/** Inject this capability into consumers that only need to read settings. */
export interface ConfigurationReader {
  read(this: void): Promise<ConfigurationSnapshot>;
}

export interface ConfigurationService extends ConfigurationReader {
  /** Briefly cached read for public pages and pre-checks; authoritative paths use read(). */
  readCached(this: void): Promise<ConfigurationSnapshot>;
  isAdmin(this: void, auth: AuthSession | null): boolean;
  /** Pass a freshly resolved server session, never identity supplied by a client. */
  update(
    this: void,
    input: Pick<ConfigurationSnapshot, "values" | "revision">,
    auth: AuthSession | null,
  ): Promise<ConfigurationSnapshot>;
}

/** Storage adapters must atomically compare revisions, returning null on conflict. */
export interface ConfigurationRepository extends ConfigurationReader {
  update(
    this: void,
    values: ConfigurationValues,
    revision: number,
    actorId: string,
  ): Promise<ConfigurationSnapshot | null>;
}

/** Holder shared by services that should reuse one cached read, e.g. per Worker isolate. */
export interface ConfigurationCache {
  entry?: { snapshot: Promise<ConfigurationSnapshot>; expiresAt: number };
}
