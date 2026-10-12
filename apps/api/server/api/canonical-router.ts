import { createExecutionHandlers, decodeUpload } from "./execution-handlers.js";
import { createProjectHandlers } from "./project-handlers.js";
import { createIdentityHandlers } from "./identity-handlers.js";
import type { CreateApiRouterOptions } from "./api-types.js";
import { createRouterContext } from "./router-context.js";
import { createCloudHandlers } from "./cloud-handlers.js";
export function createCanonicalApiRouter(options: CreateApiRouterOptions) {
  const context = createRouterContext(options);
  const executionHandlers = createExecutionHandlers(context);
  const { os, authenticated, assets, command } = context;
  const contextCallComplete = (
    ctx: { principal: { user: { id: string } } },
    input: {
      assetId: string;
      uploadId: string;
      byteSize: number;
      contentType: string;
      checksum: string;
      bodyBase64: string;
    },
  ) =>
    context.call(() =>
      assets().completeAssetUpload({
        ...input,
        actorId: ctx.principal.user.id,
        body: decodeUpload(input.bodyBase64),
      }),
    );
  return os.router({
    cloud: createCloudHandlers(context),
    projects: createProjectHandlers(context),
    devices: executionHandlers.devices,
    runner: executionHandlers.runner,
    admin: createIdentityHandlers(context, options),
    health: os.health.handler(() => ({
      status: "ok" as const,
      timestamp: options.now?.() ?? new Date(),
    })),
    account: {
      get: authenticated.account.get.handler(({ context }) => {
        const { id, email, displayName } = context.principal.user;
        return { id, email, displayName };
      }),
    },
    auth: {
      capabilities: {
        get: os.auth.capabilities.get.handler(() => options.modules.publicAuthCapabilities.get()),
      },
    },
    library: {
      assets: {
        list: authenticated.library.assets.list.handler(command(() => assets().listLibrary)),
      },
    },
    assets: {
      upload: {
        create: authenticated.assets.upload.create.handler(
          command(() => assets().createAssetUpload),
        ),
        complete: authenticated.assets.upload.complete.handler(({ context, input }) =>
          contextCallComplete(context, input),
        ),
      },
    },
    activity: {
      list: authenticated.activity.list.handler(
        command(() => options.modules.activity.listActivity),
      ),
    },
  });
}
