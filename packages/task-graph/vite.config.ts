// Every workspace registers tasks through this package, so it uses its own source.
import { workspaceTaskConfig } from "./src/config.js";

export default workspaceTaskConfig(import.meta.url);
