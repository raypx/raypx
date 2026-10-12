import { terminalRunStatuses, type RunEvent } from "@voidmix/core";
import type { RouterContext } from "./router-context.js";
import { createApiError, mapDomainError } from "./canonical-errors.js";
import { actorInput } from "./router-context.js";

export function decodeUpload(bodyBase64: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(bodyBase64))
    throw createApiError("BAD_REQUEST", "BLOB_CHECKSUM_MISMATCH");
  const body = new Uint8Array(Buffer.from(bodyBase64, "base64"));
  if (body.byteLength > 10 * 1024 * 1024) throw createApiError("BAD_REQUEST", "BLOB_TOO_LARGE");
  return body;
}
export function createExecutionHandlers(context: RouterContext) {
  const { authenticated, execution, command, call } = context;
  const device = context.os.use(async ({ context, next }) => {
    const authorization = context.reqHeaders?.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      throw createApiError("UNAUTHORIZED", "DEVICE_UNAUTHORIZED");
    const principal = await call(() => execution().authenticateDevice(authorization.slice(7)));
    return next({ context: { device: principal } });
  });
  return {
    devices: {
      register: authenticated.devices.register.handler(command(() => execution().registerDevice)),
      list: authenticated.devices.list.handler(command(() => execution().listDevices)),
      revoke: authenticated.devices.revoke.handler(command(() => execution().revokeDevice)),
      bindProject: authenticated.devices.bindProject.handler(
        command(() => execution().bindProject),
      ),
      listBindings: authenticated.devices.listBindings.handler(
        command(() => execution().listBindings),
      ),
    },
    agentRuns: {
      create: authenticated.projects.agentRuns.create.handler(command(() => execution().create)),
      list: authenticated.projects.agentRuns.list.handler(command(() => execution().list)),
      get: authenticated.projects.agentRuns.get.handler(command(() => execution().get)),
      cancel: authenticated.projects.agentRuns.cancel.handler(command(() => execution().cancel)),
      retry: authenticated.projects.agentRuns.retry.handler(command(() => execution().retry)),
      snapshot: authenticated.projects.agentRuns.snapshot.handler(
        command(() => execution().snapshot),
      ),
      events: {
        list: authenticated.projects.agentRuns.events.list.handler(
          command(() => execution().events),
        ),
        stream: authenticated.projects.agentRuns.events.stream.handler(
          async ({ context, input, signal }) => {
            const application = execution();
            const args = actorInput(context, input);
            // Authorize before headers/stream are sent; reconnect always rechecks access.
            await call(() => application.get(args));
            return (async function* () {
              let afterSeq = input.afterSeq;
              while (!signal?.aborted) {
                try {
                  const page = await application.events({ ...args, afterSeq, limit: 100 });
                  for (const event of page.items) {
                    if (signal?.aborted) return;
                    afterSeq = event.seq;
                    yield event;
                  }
                  if (page.hasMore) continue;
                  const run = await application.get(args);
                  if (terminalRunStatuses.has(run.status) && afterSeq >= run.lastSeq) return;
                  await new Promise<void>((resolve) => {
                    const finish = () => {
                      clearTimeout(timer);
                      signal?.removeEventListener("abort", finish);
                      resolve();
                    };
                    const timer = setTimeout(finish, 500);
                    signal?.addEventListener("abort", finish, { once: true });
                  });
                } catch (error) {
                  throw mapDomainError(error);
                }
              }
            })();
          },
        ),
      },
      commands: {
        create: authenticated.projects.agentRuns.commands.create.handler(
          command(() => execution().createCommand),
        ),
        list: authenticated.projects.agentRuns.commands.list.handler(
          command(() => execution().listCommands),
        ),
      },
      artifacts: {
        list: authenticated.projects.agentRuns.artifacts.list.handler(
          command(() => execution().listArtifacts),
        ),
        attach: authenticated.projects.agentRuns.artifacts.attach.handler(
          command(() => execution().attachArtifact),
        ),
      },
    },
    runner: {
      heartbeat: device.runner.heartbeat.handler(({ context }) =>
        call(() => execution().heartbeat({ deviceId: context.device.id })),
      ),
      claim: device.runner.claim.handler(({ context }) =>
        call(() => execution().claim({ deviceId: context.device.id })),
      ),
      acknowledge: device.runner.acknowledge.handler(({ context, input }) =>
        call(() => execution().acknowledge({ ...input, deviceId: context.device.id })),
      ),
      events: {
        append: device.runner.events.append.handler(({ context, input }) =>
          call(() =>
            execution().appendEvents({
              ...input,
              events: input.events as RunEvent[],
              deviceId: context.device.id,
            }),
          ),
        ),
      },
      commands: {
        list: device.runner.commands.list.handler(({ context, input }) =>
          call(() => execution().runnerCommands({ ...input, deviceId: context.device.id })),
        ),
        acknowledge: device.runner.commands.acknowledge.handler(({ context, input }) => {
          const { error, ...fields } = input;
          return call(() =>
            execution().acknowledgeCommand({
              ...fields,
              ...(error === undefined ? {} : { error }),
              deviceId: context.device.id,
            }),
          );
        }),
      },
      artifacts: {
        upload: device.runner.artifacts.upload.handler(({ context, input }) =>
          call(() =>
            execution().uploadArtifact({
              ...input,
              body: decodeUpload(input.bodyBase64),
              deviceId: context.device.id,
            }),
          ),
        ),
      },
    },
  };
}
