import type { RouterContext } from "./router-context.js";
import { actorInput } from "./router-context.js";
import { createApiError, mapDomainError } from "./canonical-errors.js";
import { isCloudTerminal } from "@voidmix/core";
import type { Session } from "@voidmix/auth";

async function requireStreamSession(context: {
  auth: { revalidateSession?: () => Promise<Session | null> };
  principal: { session: Session; user: { id: string } };
}) {
  const session = context.auth.revalidateSession
    ? await context.auth.revalidateSession()
    : context.principal.session;
  if (
    !session ||
    session.user.id !== context.principal.user.id ||
    session.expiresAt.getTime() <= Date.now()
  )
    throw createApiError("UNAUTHORIZED");
}

async function pause(signal?: AbortSignal) {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 500);
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
  });
}
export function createCloudHandlers(context: RouterContext) {
  const { authenticated, cloud, objectStorage, command, call, os, requirePermission } = context;
  const conversationGet = command(() => cloud().getConversation);
  const download = async (args: { actorId: string; assetVersionId: string }, preview = false) => {
    const asset = await call(() => cloud().getAsset(args));
    if (!asset.published) throw createApiError("NOT_FOUND", "CLOUD_ASSET_UNPUBLISHED");
    const signed = await call(() =>
      objectStorage().signDownload({
        key: asset.objectKey,
        expiresInSeconds: 60,
        ...(!preview ? { filename: asset.name } : {}),
      }),
    );
    return { asset, download: signed };
  };
  return {
    admin: {
      runs: {
        list: os.cloud.admin.runs.list
          .use(requirePermission("admin.runs.read"))
          .handler(command(() => cloud().adminListRuns)),
        get: os.cloud.admin.runs.get
          .use(requirePermission("admin.runs.read"))
          .handler(command(() => cloud().adminInspectRun)),
      },
      usage: {
        get: os.cloud.admin.usage.get
          .use(requirePermission("admin.usage.read"))
          .handler(command(() => cloud().adminUsage)),
      },
    },
    conversations: {
      create: authenticated.cloud.conversations.create.handler(
        command(() => cloud().createConversation),
      ),
      list: authenticated.cloud.conversations.list.handler(
        command(() => cloud().listConversations),
      ),
      get: authenticated.cloud.conversations.get.handler(conversationGet),
      snapshot: authenticated.cloud.conversations.snapshot.handler(conversationGet),
      history: authenticated.cloud.conversations.history.handler(
        command(() => cloud().conversationHistory),
      ),
      stream: authenticated.cloud.conversations.stream.handler(
        async ({ context, input, signal }) => {
          const args = actorInput(context, input);
          const first = await call(() => cloud().getConversation(args));
          return (async function* () {
            let lastSignature = "";
            let next = first;
            while (!signal?.aborted) {
              await requireStreamSession(context);
              const signature = JSON.stringify([
                next.conversation.updatedAt,
                next.turns.map((t) => t.id),
                next.runs.map((r) => [r.id, r.lastSequence, r.status, r.cancelRequested]),
              ]);
              if (signature !== lastSignature) {
                lastSignature = signature;
                yield next;
              }
              await pause(signal);
              if (signal?.aborted) return;
              next = await call(() => cloud().getConversation(args));
            }
          })();
        },
      ),
      sendTurn: authenticated.cloud.conversations.sendTurn.handler(command(() => cloud().sendTurn)),
    },
    tasks: {
      listSpendingGrants: authenticated.cloud.tasks.listSpendingGrants.handler(
        command(() => cloud().listSpendingGrants),
      ),
      startRound: authenticated.cloud.tasks.startRound.handler(command(() => cloud().startRound)),
      continueRound: authenticated.cloud.tasks.continueRound.handler(
        command(() => cloud().continueRound),
      ),
      setSpendingGrant: authenticated.cloud.tasks.setSpendingGrant.handler(
        command(() => cloud().setSpendingGrant),
      ),
      create: authenticated.cloud.tasks.create.handler(command(() => cloud().createTask)),
      list: authenticated.cloud.tasks.list.handler(command(() => cloud().listTasks)),
      get: authenticated.cloud.tasks.get.handler(command(() => cloud().getTask)),
      update: authenticated.cloud.tasks.update.handler(command(() => cloud().updateTask)),
      acceptRevision: authenticated.cloud.tasks.acceptRevision.handler(
        command(() => cloud().acceptRevision),
      ),
    },
    runs: {
      snapshot: authenticated.cloud.runs.snapshot.handler(command(() => cloud().getRunSnapshot)),
      history: authenticated.cloud.runs.history.handler(command(() => cloud().listEvents)),
      stream: authenticated.cloud.runs.stream.handler(async ({ context, input, signal }) => {
        const args = actorInput(context, input);
        await call(() => cloud().getRunSnapshot(args));
        return (async function* () {
          let afterSequence = input.afterSequence;
          while (!signal?.aborted) {
            try {
              await requireStreamSession(context);
              const page = await cloud().listEvents({ ...args, afterSequence, limit: 100 });
              for (const event of page.items) {
                if (signal?.aborted) return;
                afterSequence = event.sequence;
                yield event;
              }
              if (page.hasMore) continue;
              const snapshot = await cloud().getRunSnapshot(args);
              if (
                isCloudTerminal(snapshot.run.status) &&
                afterSequence >= snapshot.run.lastSequence
              )
                return;
              await pause(signal);
            } catch (error) {
              throw mapDomainError(error);
            }
          }
        })();
      }),
      commands: {
        create: authenticated.cloud.runs.commands.create.handler(
          command(() => cloud().createCommand),
        ),
      },
      retry: authenticated.cloud.runs.retry.handler(command(() => cloud().retryRun)),
    },
    assets: {
      get: authenticated.cloud.assets.get.handler(command(() => cloud().getAsset)),
      list: authenticated.cloud.assets.list.handler(command(() => cloud().listAssets)),
      createUpload: authenticated.cloud.assets.createUpload.handler(async ({ context, input }) => {
        const storage = objectStorage();
        const asset = await call(() => cloud().createUpload(actorInput(context, input)));
        const upload = await call(() =>
          storage.signUpload({
            key: asset.objectKey,
            byteSize: asset.byteSize,
            contentType: asset.mediaType,
            checksumSha256: asset.checksum,
          }),
        );
        return { asset, upload };
      }),
      completeUpload: authenticated.cloud.assets.completeUpload.handler(
        async ({ context, input }) => {
          const args = actorInput(context, input);
          const asset = await call(() => cloud().getAsset(args));
          if (asset.published)
            return call(() =>
              cloud().completeUpload({
                ...args,
                byteSize: asset.byteSize,
                checksum: asset.checksum,
              }),
            );
          const head = await call(() => objectStorage().head(asset.objectKey));
          if (
            !head ||
            head.byteSize !== asset.byteSize ||
            head.contentType !== asset.mediaType ||
            head.checksumSha256 !== asset.checksum
          )
            throw createApiError("BAD_REQUEST", "CLOUD_UPLOAD_MISMATCH");
          return call(() =>
            cloud().completeUpload({
              ...args,
              byteSize: head.byteSize,
              checksum: head.checksumSha256,
            }),
          );
        },
      ),
      download: authenticated.cloud.assets.download.handler(({ context, input }) =>
        download(actorInput(context, input)),
      ),
      preview: authenticated.cloud.assets.preview.handler(({ context, input }) =>
        download(actorInput(context, input), true),
      ),
    },
    usage: { get: authenticated.cloud.usage.get.handler(command(() => cloud().getUsage)) },
    notifications: {
      list: authenticated.cloud.notifications.list.handler(
        command(() => cloud().listNotifications),
      ),
      markRead: authenticated.cloud.notifications.markRead.handler(
        command(() => cloud().markNotificationRead),
      ),
    },
    preferences: {
      get: authenticated.cloud.preferences.get.handler(command(() => cloud().getPreferences)),
      update: authenticated.cloud.preferences.update.handler(
        command(() => cloud().updatePreferences),
      ),
    },
    capabilities: {
      get: authenticated.cloud.capabilities.get.handler(() => context.cloudCapabilities()),
    },
    tools: { get: authenticated.cloud.tools.get.handler(command(() => cloud().getToolDetail)) },
  };
}
