import type { RpcBoundary } from "./boundary.js";
export function createMemoryHandlers({ os, memoryCall }: Pick<RpcBoundary, "os" | "memoryCall">) {
  return {
    list: os.memory.list.handler(({ context }) =>
      memoryCall(context, "memory.list", false, (service, owner) => service.list(owner)),
    ),
    get: os.memory.get.handler(({ context, input }) =>
      memoryCall(context, "memory.get", false, (service, owner) => service.get(owner, input)),
    ),
    create: os.memory.create.handler(({ context, input }) =>
      memoryCall(context, "memory.create", true, (service, owner) => service.create(owner, input)),
    ),
    update: os.memory.update.handler(({ context, input }) =>
      memoryCall(context, "memory.update", true, (service, owner) => service.update(owner, input)),
    ),
    archive: os.memory.archive.handler(({ context, input }) =>
      memoryCall(context, "memory.archive", true, (service, owner) =>
        service.archive(owner, input),
      ),
    ),
    history: os.memory.history.handler(({ context, input }) =>
      memoryCall(context, "memory.history", false, (service, owner) =>
        service.history(owner, input),
      ),
    ),
    delete: os.memory.delete.handler(({ context, input }) =>
      memoryCall(context, "memory.delete", true, (service, owner) => service.delete(owner, input)),
    ),
    restore: os.memory.restore.handler(({ context, input }) =>
      memoryCall(context, "memory.restore", true, (service, owner) =>
        service.restore(owner, input),
      ),
    ),
    resolve: os.memory.resolve.handler(({ context, input }) =>
      memoryCall(context, "memory.resolve", false, (service, owner) =>
        service.resolve(owner, input.selection, input.target, input.prompt ?? " "),
      ),
    ),
  };
}
