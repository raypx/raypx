import type { PluginOption } from "vite";

/**
 * Vite plugin configuration options
 */
export interface VitePluginOptions {
  /**
   * Enable in development mode
   * @default false
   */
  dev?: boolean;

  /**
   * Enable in production mode
   * @default true
   */
  prod?: boolean;
}

/**
 * Virtual module configuration
 */
export interface VirtualModuleConfig {
  /**
   * Virtual module ID (without virtual: prefix)
   */
  id: string;

  /**
   * Content generator function
   */
  content: () => string | Promise<string>;
}

/**
 * Plugin with metadata
 */
export interface PluginWithMetadata extends PluginOption {
  /**
   * Plugin name
   */
  name: string;

  /**
   * Plugin description
   */
  description?: string;
}
