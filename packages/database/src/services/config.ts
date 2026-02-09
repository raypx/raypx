/**
 * Configuration service for reading user-specific configurations from database
 * Falls back to environment variables if not found in database
 */

import { and, db, eq } from "../index";
import { configNamespaces as ConfigNamespaces, configs as Configs } from "../schemas/pg";

export type ConfigValueType = "string" | "number" | "boolean" | "json";

export interface ConfigValue {
  key: string;
  value: unknown;
  valueType: ConfigValueType;
}

export interface NamespaceConfig {
  [key: string]: unknown;
}

/**
 * Parse config value based on its type
 */
function parseConfigValue(value: string | null, valueType: ConfigValueType): unknown {
  if (value === null) {
    return null;
  }

  switch (valueType) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true";
    case "json":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

/**
 * Get or create a config namespace for a user
 */
export async function getOrCreateNamespace(
  userId: string,
  namespaceName: string,
  options?: {
    description?: string;
    icon?: string;
  },
): Promise<string> {
  let namespace = await db.query.configNamespaces.findFirst({
    where: and(eq(ConfigNamespaces.name, namespaceName), eq(ConfigNamespaces.userId, userId)),
  });

  if (!namespace) {
    const [created] = await db
      .insert(ConfigNamespaces)
      .values({
        name: namespaceName,
        description: options?.description,
        icon: options?.icon,
        userId,
      })
      .returning();

    if (!created) {
      throw new Error(`Failed to create namespace: ${namespaceName}`);
    }

    namespace = created;
  }

  return namespace.id;
}

/**
 * Get a single config value by namespace and key
 */
export async function getConfigValue(
  userId: string,
  namespaceName: string,
  key: string,
): Promise<ConfigValue | null> {
  const namespace = await db.query.configNamespaces.findFirst({
    where: and(eq(ConfigNamespaces.name, namespaceName), eq(ConfigNamespaces.userId, userId)),
  });

  if (!namespace) {
    return null;
  }

  const config = await db.query.configs.findFirst({
    where: and(eq(Configs.namespaceId, namespace.id), eq(Configs.key, key)),
  });

  if (!config) {
    return null;
  }

  return {
    key: config.key,
    value: parseConfigValue(config.value, config.valueType as ConfigValueType),
    valueType: config.valueType as ConfigValueType,
  };
}

/**
 * Get all config values for a namespace
 * Returns a flat object with key-value pairs
 */
export async function getNamespaceConfig(
  userId: string,
  namespaceName: string,
): Promise<NamespaceConfig> {
  const namespace = await db.query.configNamespaces.findFirst({
    where: and(eq(ConfigNamespaces.name, namespaceName), eq(ConfigNamespaces.userId, userId)),
  });

  const config: NamespaceConfig = {};

  if (!namespace) {
    return config;
  }

  const configs = await db.query.configs.findMany({
    where: eq(Configs.namespaceId, namespace.id),
  });

  for (const cfg of configs) {
    config[cfg.key] = parseConfigValue(cfg.value, cfg.valueType as ConfigValueType);
  }

  return config;
}

/**
 * Get config with fallback to environment variables
 * This is useful for runtime configuration that should prefer database values
 * but fall back to environment variables for defaults
 */
export async function getConfigWithFallback<T extends Record<string, unknown>>(
  userId: string,
  namespaceName: string,
  fallbackConfig: T,
): Promise<T> {
  const dbConfig = await getNamespaceConfig(userId, namespaceName);

  // Merge: database config takes precedence, then fallback config
  return {
    ...fallbackConfig,
    ...dbConfig,
  } as T;
}

/**
 * Get config value with fallback to environment variable
 */
export async function getConfigValueWithFallback(
  userId: string,
  namespaceName: string,
  key: string,
  fallbackValue?: string,
): Promise<unknown> {
  const configValue = await getConfigValue(userId, namespaceName, key);

  if (configValue !== null) {
    return configValue.value;
  }

  // Fallback to environment variable if provided
  if (fallbackValue !== undefined) {
    return process.env[fallbackValue];
  }

  return null;
}
