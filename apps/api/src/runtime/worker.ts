import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "@raypx/database/connection";
import type { ConversationFanout } from "@raypx/agents/server";
import { createConversationFanout } from "@raypx/agents/server/postgres";
import { createStreamDrain } from "@raypx/logger/stream";
import type { ConversationModels } from "../conversations/models.js";
import type { WorkerEnvironment } from "../env.js";
import { createApiLogging, type ApiLogging } from "../logging.js";
import { createReadinessCheck } from "../app/readiness.js";
import { createClientIpReader } from "../app/client-ip.js";
import { createRelayHttpApp } from "../routers/relay/http.js";
import { composeAgents } from "./agents.js";
import { connectRuntimeDatabase } from "./database.js";
import { createLifecycle } from "./lifecycle.js";

export interface WorkerRuntimeResources {
  connect(): DatabaseConnection;
  logger: ApiLogging;
  closeLogger(): Promise<void>;
  createModels?: () => ConversationModels;
  createConversationFanout?: () => ConversationFanout;
}

/** No Auth or RPC composition; only start() subscribes and scans for runnable work. */
export async function createWorkerRuntime(
  environment: WorkerEnvironment,
  resources?: WorkerRuntimeResources,
) {
  const logger =
    resources?.logger ??
    createApiLogging({
      service: "raypx-worker",
      environment: environment.NODE_ENV,
      sink: createStreamDrain(),
    });
  const lifecycle = createLifecycle();
  lifecycle.own(() => resources?.closeLogger() ?? logger.close());
  try {
    const connection = resources?.connect() ?? connectRuntimeDatabase(environment.DATABASE_URL);
    lifecycle.own(() => connection.close());
    const {
      runner,
      routines,
      spaceMemory,
      routineWorker,
      spaceManagement,
      spaceDeletionWorker,
      deviceConnector,
    } = await composeAgents(connection.db, environment, logger, resources?.createModels);
    const fanout =
      resources?.createConversationFanout?.() ?? createConversationFanout(environment.DATABASE_URL);
    lifecycle.own(() => fanout.close());
    lifecycle.own(() => runner.close());
    lifecycle.own(() => deviceConnector.shutdown());
    lifecycle.own(() => routineWorker.close());
    lifecycle.own(() => spaceDeletionWorker.close());
    const readiness = createReadinessCheck({
      database: () => connection.db.execute(sql`select 1`),
    });
    let closing: Promise<void> | undefined;
    return {
      runner,
      routines,
      spaceMemory,
      spaceManagement,
      spaceDeletionWorker,
      stopClaiming: () => {
        routineWorker.stop();
        spaceDeletionWorker.stop();
        runner.stopClaiming();
      },
      app: createRelayHttpApp(readiness, "worker"),
      allowedOrigins: [] as string[],
      clientIp: createClientIpReader([], []),
      start: async () => {
        await deviceConnector.start().catch(() => {});
        await runner.startWorker(fanout);
        await routineWorker.start();
        await spaceDeletionWorker.start();
      },
      close: () => (closing ??= lifecycle.close()),
    };
  } catch (error) {
    await lifecycle.close().catch(() => {});
    throw error;
  }
}
