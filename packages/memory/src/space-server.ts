export { createSpaceMemoryService } from "./space-server/service.js";
export { MemoryExecutionFenceError } from "./space-server/types.js";
export type {
  SpaceMemoryService,
  SpaceMemoryRepository,
  MemorySearch,
  MemoryActor,
  MemoryListOptions,
  MemoryRunActor,
} from "./space-server/types.js";
export {
  createMemoryTools,
  memoryToolSchemas,
  type MemoryToolCall,
  type MemoryToolName,
} from "./space-server/tools.js";
