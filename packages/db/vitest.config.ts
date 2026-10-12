import { fileURLToPath } from "node:url";
import { workspaceTests } from "../../test.config.js";

// Resolve these test sources explicitly when an external emitter creates CommonJS siblings.
const resolve = {
  alias: ["budget", "rounds", "projection", "usage-limits"].map((name) => ({
    find: new RegExp(`^(?:\\.\\./tests/|\\./)cloud-${name}\\.js$`),
    replacement: fileURLToPath(new URL(`./tests/cloud-${name}.ts`, import.meta.url)),
  })),
};

export default { ...workspaceTests(), resolve };
