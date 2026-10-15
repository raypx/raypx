import { workspaceTests } from "../../test.config.js";
const config = workspaceTests({ include: ["tests/**/*.integration.test.ts"] });
export default { ...config, test: { ...config.test, fileParallelism: false } };
