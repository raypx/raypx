import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Path utilities
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Project root directory (monorepo root) */
export const PROJECT_ROOT = resolve(__dirname, "../../");

/** Cache directory for build artifacts */
export const CACHE_DIR = resolve(PROJECT_ROOT, "node_modules/.cache");

export const NODE_MODULES_PATH = resolve(PROJECT_ROOT, "node_modules");
