import { hasPermission, type Permission } from "@voidmix/auth";
import { apiContract } from "@voidmix/contracts";
import { DomainError } from "@voidmix/core";
import { implement } from "@orpc/server";
import { evlog as orpcEvlog } from "@voidmix/shared/logger/orpc";

import type { ApiContext, CreateApiRouterOptions } from "./api-types.js";
import { createApiError, mapDomainError } from "./canonical-errors.js";

export function createRouterContext(options: CreateApiRouterOptions) {
  const os = implement(apiContract)
    .$context<ApiContext>()
    .use(orpcEvlog())
    .use(async ({ context, next, path }) => {
      context.log?.set({ requestId: context.requestId });
      context.resHeaders?.set("x-request-id", context.requestId);
      return options.modules.traceOperation
        ? options.modules.traceOperation(path.join("."), async () => next())
        : next();
    });
  const requireAuthenticated = os.middleware(async ({ context, next }) => {
    const session = context.auth.session;
    if (!session) throw createApiError("UNAUTHORIZED");
    return next({ context: { principal: { session, user: session.user } } });
  });
  const requirePermission = (permission: Permission) =>
    requireAuthenticated.use(async ({ context, next }) => {
      if (!hasPermission(context.principal.session, permission)) throw createApiError("FORBIDDEN");
      return next({ context: { principal: context.principal } });
    });
  const v2Projects = () => options.modules.v2Projects;
  const assets = () => options.modules.assets;
  const reviews = () => options.modules.reviews;
  const agentRuns = () => {
    if (!options.modules.v2AgentRuns)
      throw createApiError("INTERNAL_SERVER_ERROR", "V2_AGENT_RUNS_NOT_CONFIGURED");
    return options.modules.v2AgentRuns;
  };
  const execution = () => {
    if (!options.modules.execution)
      throw createApiError("SERVICE_UNAVAILABLE", "EXECUTION_NOT_CONFIGURED");
    return options.modules.execution;
  };
  const cloud = () => {
    if (!options.modules.cloud) throw createApiError("SERVICE_UNAVAILABLE", "CLOUD_NOT_CONFIGURED");
    return options.modules.cloud;
  };
  const objectStorage = () => {
    if (!options.modules.objectStorage)
      throw createApiError("SERVICE_UNAVAILABLE", "OBJECT_STORAGE_UNAVAILABLE");
    return options.modules.objectStorage;
  };
  const call = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof DomainError)) options.modules.reportError?.(error);
      throw mapDomainError(error);
    }
  };

  const command =
    <Input extends { actorId: string }, Result>(resolve: () => (input: Input) => Promise<Result>) =>
    ({
      context,
      input,
    }: {
      context: { principal: { user: { id: string } } };
      input: Omit<
        { [K in keyof Input]: Input[K] | ({} extends Pick<Input, K> ? undefined : never) },
        "actorId"
      >;
    }) =>
      call(() => resolve()(actorInput(context, input) as Input));
  const list =
    <Input extends { actorId: string }, Item>(resolve: () => (input: Input) => Promise<Item[]>) =>
    async (args: Parameters<ReturnType<typeof command<Input, Item[]>>>[0]) =>
      page(await command(resolve)(args));

  return {
    os,
    authenticated: os.use(requireAuthenticated),
    requirePermission,
    v2Projects,
    assets,
    reviews,
    agentRuns,
    execution,
    cloud,
    objectStorage,
    cloudCapabilities: () =>
      options.modules.cloudCapabilities ?? {
        search: false,
        computer: false,
        delegation: false,
        export: false,
        unavailableReason: "CLOUD_NOT_CONFIGURED",
      },
    call,
    command,
    list,
  };
}
export type RouterContext = ReturnType<typeof createRouterContext>;

export function page<T>(items: T[]) {
  return { items, nextCursor: null };
}

/** Zod optional inputs may contain undefined; application commands distinguish omission. */
export function actorInput<T extends object>(
  context: { principal: { user: { id: string } } },
  input: T,
): { [K in keyof T]: Exclude<T[K], undefined> } & { actorId: string } {
  const fields = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
  return { ...fields, actorId: context.principal.user.id } as {
    [K in keyof T]: Exclude<T[K], undefined>;
  } & { actorId: string };
}
