import { RunResourceUnavailableError, type ModelAccess } from "@raypx/agents/server";
import type { Run } from "@raypx/core/conversation";
import {
  modelConnectionConfigurationSchema,
  type ModelConnection,
  type ModelConnectionConfiguration,
  type ModelConnectionTestCode,
} from "@raypx/core/model-connections";
import type { SpaceScope } from "@raypx/spaces/server";
import { taskText } from "@raypx/core/task-text";
import type { SealedSecret, SecretStore } from "./secret-types.js";
import type { ConversationModels } from "./models.js";

export class ModelConnectionError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_CONNECTION" | "CONNECTION_LIMIT") {
    super(code);
    this.name = "ModelConnectionError";
  }
}
export interface StoredModelConnection extends ModelConnection {
  secretId: string;
}
export interface ModelConnectionsRepository {
  list(this: void, accountId: string, spaceId?: string): Promise<StoredModelConnection[]>;
  get(this: void, accountId: string, id: string): Promise<StoredModelConnection>;
  create(
    this: void,
    accountId: string,
    id: string,
    secretId: string,
    input: ModelConnectionConfiguration,
    secret: SealedSecret,
  ): Promise<StoredModelConnection>;
  update(
    this: void,
    accountId: string,
    id: string,
    input: ModelConnectionConfiguration,
    secret?: SealedSecret,
  ): Promise<StoredModelConnection>;
  delete(this: void, accountId: string, id: string): Promise<{ deleted: true }>;
}
type ResolvedModel = Awaited<ReturnType<ModelAccess["resolve"]>>;
export interface ConnectionTransport {
  validate(this: void, input: ModelConnectionConfiguration): void;
  resolve(
    this: void,
    connection: ModelConnection,
    model: string,
    secret: string,
  ): Promise<ResolvedModel>;
  test(
    this: void,
    connection: ModelConnection,
    model: string,
    secret: string,
  ): Promise<ModelConnectionTestCode>;
  close(this: void): void;
}
function publicConnection(row: StoredModelConnection): ModelConnection {
  const { secretId: _secretId, ...connection } = row;
  return connection;
}
export function connectionModelId(id: string, model: string): string {
  return `connection:${id}:${model}`;
}
export async function connectionFingerprint(
  connection: ModelConnection,
  model: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify([connection.id, connection.kind, connection.baseUrl, connection.api, model]),
    ),
  );
  return `connection:${connection.id}:${Buffer.from(digest).toString("hex")}`;
}

/** Account identity is always supplied by the session or the Run actor, never by input. */
export function createModelConnections(
  repository: ModelConnectionsRepository,
  secrets: SecretStore,
  transport: ConnectionTransport,
) {
  const protectedSecrets = new Map<string, string>();
  function validate(input: ModelConnectionConfiguration) {
    try {
      const parsed = modelConnectionConfigurationSchema.parse(input);
      transport.validate(parsed);
      return parsed;
    } catch {
      throw new ModelConnectionError("INVALID_CONNECTION");
    }
  }
  return {
    /** Internal Computer boundary input; never an RPC projection. */
    protectedValues: () => [...protectedSecrets.values()],
    list: async (accountId: string) => (await repository.list(accountId)).map(publicConnection),
    async create(accountId: string, input: ModelConnectionConfiguration, value: string) {
      const parsed = validate(input);
      const id = crypto.randomUUID();
      const secretId = crypto.randomUUID();
      const sealed = await secrets.seal(accountId, secretId, value);
      return publicConnection(await repository.create(accountId, id, secretId, parsed, sealed));
    },
    async update(
      accountId: string,
      id: string,
      input: ModelConnectionConfiguration,
      value?: string,
    ) {
      const parsed = validate(input);
      const current = await repository.get(accountId, id);
      const sealed =
        value === undefined ? undefined : await secrets.seal(accountId, current.secretId, value);
      return publicConnection(await repository.update(accountId, id, parsed, sealed));
    },
    delete: (accountId: string, id: string) => repository.delete(accountId, id),
    async test(accountId: string, id: string, requestedModel?: string) {
      const connection = await repository.get(accountId, id);
      const model = requestedModel ?? connection.models[0]!;
      if (!connection.models.includes(model)) return { code: "MODEL_UNAVAILABLE" as const };
      try {
        const secret = await secrets.read(accountId, id, connection.secretId);
        return { code: await transport.test(publicConnection(connection), model, secret) };
      } catch {
        return { code: "REQUEST_FAILED" as const };
      }
    },
    models(deployment: ConversationModels): ConversationModels {
      return {
        ...(deployment.reviewModel ? { reviewModel: deployment.reviewModel } : {}),
        async list(scope: SpaceScope) {
          const connections = await repository.list(scope.member.accountId, scope.spaceId);
          const memberModels = connections.flatMap((connection) =>
            connection.models.map((model) => ({
              modelId: connectionModelId(connection.id, model),
              name: taskText(`${connection.name} / ${model}`, 200),
              source: "connection" as const,
            })),
          );
          const offered = new Map<
            string,
            { modelId: string; name: string; source?: "connection" | "deployment" }
          >();
          for (const model of [...memberModels, ...(await deployment.list(scope))]) {
            if (!offered.has(model.modelId)) offered.set(model.modelId, model);
          }
          return [...offered.values()].sort((a, b) => a.modelId.localeCompare(b.modelId));
        },
        async resolve(run: Run) {
          const pinned =
            "connectionId" in run && typeof run.connectionId === "string" ? run.connectionId : null;
          // A pinned member connection must never fall back to a deployment model.
          if (!run.model.modelId.startsWith("connection:")) {
            if (pinned?.startsWith("connection:"))
              throw new RunResourceUnavailableError("CONNECTION_UNAVAILABLE");
            return deployment.resolve(run);
          }
          const connections = await repository.list(run.memberAccountId, run.spaceId);
          for (const connection of connections) {
            const model = connection.models.find(
              (candidate) => connectionModelId(connection.id, candidate) === run.model.modelId,
            );
            if (!model) continue;
            const fingerprint = await connectionFingerprint(connection, model);
            if (pinned && pinned !== fingerprint)
              throw new RunResourceUnavailableError("CONNECTION_UNAVAILABLE");
            try {
              const value = await secrets.read(
                run.memberAccountId,
                connection.id,
                connection.secretId,
              );
              protectedSecrets.set(run.id, value);
              const resolved = await transport.resolve(publicConnection(connection), model, value);
              return { ...resolved, connectionId: fingerprint };
            } catch {
              throw new RunResourceUnavailableError("CONNECTION_UNAVAILABLE");
            }
          }
          if (pinned?.startsWith("connection:"))
            throw new RunResourceUnavailableError("CONNECTION_UNAVAILABLE");
          return deployment.resolve(run);
        },
        release(run) {
          protectedSecrets.delete(run.id);
          deployment.release?.(run);
        },
        close() {
          protectedSecrets.clear();
          transport.close();
          deployment.close();
        },
      };
    },
  };
}
export type ModelConnectionsService = ReturnType<typeof createModelConnections>;
