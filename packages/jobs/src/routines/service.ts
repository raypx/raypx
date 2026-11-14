import {
  RoutineError,
  routineInputSchema,
  type RoutineInput,
  type RoutineDeliveryOutcome,
  type Routine,
} from "@raypx/core/routines";
import type { SpaceScope } from "@raypx/spaces/server";
import type {
  RoutineSecret,
  RoutineSecretStore,
  RoutinesRepository,
  RoutinesService,
} from "./types.js";

const ROUTINE_BODY_BYTES = 65_536;
function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
export async function routineDigest(text: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}
function sameDigest(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
function bounded(text: string) {
  if (new TextEncoder().encode(text).byteLength > ROUTINE_BODY_BYTES)
    throw new RoutineError("PAYLOAD_TOO_LARGE");
}
function deliveryId(value: string) {
  if (!value || value.length > 200) throw new RoutineError("INVALID_INPUT");
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) < 32) throw new RoutineError("INVALID_INPUT");
  }
  return value;
}
function limit(value = 50) {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new RoutineError("INVALID_INPUT");
  return value;
}
function definition(value: RoutineInput) {
  const parsed = routineInputSchema.safeParse(value);
  if (!parsed.success) throw new RoutineError("INVALID_INPUT");
  return parsed.data;
}
/** Construction performs no I/O. Only the worker calls scan; mutations dispatch after commit. */
export function createRoutinesService(
  repository: RoutinesRepository,
  options: {
    now?: () => Date;
    dispatch(scope: SpaceScope, conversationId: string): void;
    secrets: RoutineSecretStore;
    emailDomain?: string;
    publicApiOrigin?: string;
  },
): RoutinesService {
  const now = options.now ?? (() => new Date());
  const publicApiOrigin = options.publicApiOrigin ? new URL(options.publicApiOrigin).origin : null;
  if (publicApiOrigin && !/^https?:\/\//.test(publicApiOrigin))
    throw new Error("Invalid public API origin");
  function httpIngress(enabled: boolean, path: string): NonNullable<Routine["ingress"]>["webhook"] {
    if (!enabled) return { url: null, unavailableReason: "TRIGGER_NOT_CONFIGURED" };
    if (!publicApiOrigin)
      return { url: null, unavailableReason: "PUBLIC_API_ORIGIN_NOT_CONFIGURED" };
    return { url: new URL(path, publicApiOrigin).href, unavailableReason: null };
  }
  function emailIngress(routine: Routine): NonNullable<Routine["ingress"]>["email"] {
    if (!routine.triggers.email)
      return { address: null, unavailableReason: "TRIGGER_NOT_CONFIGURED" };
    if (!options.emailDomain || !routine.emailAddress)
      return { address: null, unavailableReason: "EMAIL_NOT_CONFIGURED" };
    return { address: routine.emailAddress, unavailableReason: null };
  }
  function readProjection(routine: Routine): Routine {
    return {
      ...routine,
      ingress: {
        webhook: httpIngress(Boolean(routine.triggers.webhook), `/routines/${routine.id}/webhook`),
        repository: httpIngress(
          Boolean(routine.triggers.repository),
          `/routines/${routine.id}/repository`,
        ),
        email: emailIngress(routine),
      },
    };
  }
  function requireEmail(input: RoutineInput) {
    if (input.triggers.email && !options.emailDomain) throw new RoutineError("INVALID_INPUT");
  }
  function dispatch(scope: SpaceScope, outcome: RoutineDeliveryOutcome) {
    if (outcome.conversationId && outcome.status !== "ignored")
      options.dispatch(scope, outcome.conversationId);
    return outcome;
  }
  async function seal(accountId: string, value: string): Promise<RoutineSecret> {
    const id = crypto.randomUUID();
    return { id, accountId, ...(await options.secrets.seal(accountId, id, value)) };
  }
  async function update(scope: SpaceScope, id: string, rawInput: RoutineInput) {
    const input = definition(rawInput);
    requireEmail(input);
    const current = await repository.admission(scope, id);
    const webhookKey = input.triggers.webhook && !current.webhookDigest ? randomKey() : null;
    let repositorySecret: string | null = null;
    let secret = input.triggers.repository ? current.secret : null;
    if (input.triggers.repository && !secret) {
      repositorySecret = randomKey();
      secret = await seal(scope.member.accountId, repositorySecret);
    } else if (secret && secret.accountId !== scope.member.accountId) {
      secret = await seal(
        scope.member.accountId,
        await options.secrets.open(secret.accountId, secret.id, secret),
      );
    }
    let webhookDigest: string | null = null;
    if (input.triggers.webhook) webhookDigest = current.webhookDigest;
    if (webhookKey) webhookDigest = await routineDigest(webhookKey);
    const routine = await repository.update(scope, id, input, now(), {
      expectedOwner: current.routine.ownerAccountId,
      expectedWebhookDigest: current.webhookDigest,
      expectedSecretId: current.secret?.id ?? null,
      webhookDigest,
      secret,
      emailAddress: input.triggers.email ? `${id}@${options.emailDomain}` : null,
    });
    return { routine, webhookKey, repositorySecret };
  }
  return {
    list: async (scope, agentId, count) =>
      (await repository.list(scope, agentId, limit(count))).map(readProjection),
    get: async (scope, id) => readProjection(await repository.get(scope, id)),
    async create(scope, rawInput) {
      const input = definition(rawInput);
      requireEmail(input);
      const id = crypto.randomUUID();
      const webhookKey = input.triggers.webhook ? randomKey() : null;
      const repositorySecret = input.triggers.repository ? randomKey() : null;
      const routine = await repository.create(scope, id, input, now(), {
        webhookDigest: webhookKey ? await routineDigest(webhookKey) : null,
        secret: repositorySecret ? await seal(scope.member.accountId, repositorySecret) : null,
        emailAddress: input.triggers.email ? `${id}@${options.emailDomain}` : null,
      });
      return { routine, webhookKey, repositorySecret };
    },
    update,
    async pause(scope, id) {
      const current = await repository.get(scope, id);
      return (
        await update(scope, id, {
          agentId: current.agentId,
          name: current.name,
          prompt: current.prompt,
          triggers: current.triggers,
          enabled: false,
        })
      ).routine;
    },
    async resume(scope, id) {
      const current = await repository.get(scope, id);
      return (
        await update(scope, id, {
          agentId: current.agentId,
          name: current.name,
          prompt: current.prompt,
          triggers: current.triggers,
          enabled: true,
        })
      ).routine;
    },
    delete: (scope, id) => repository.delete(scope, id),
    history: (scope, id, count) => repository.history(scope, id, limit(count)),
    events: (scope, id, count) => repository.events(scope, id, limit(count)),
    async rotateWebhookKey(scope, id) {
      const current = await repository.admission(scope, id);
      if (!current.routine.triggers.webhook) throw new RoutineError("INVALID_INPUT");
      let secret = current.secret;
      if (secret && secret.accountId !== scope.member.accountId)
        secret = await seal(
          scope.member.accountId,
          await options.secrets.open(secret.accountId, secret.id, secret),
        );
      const webhookKey = randomKey();
      const routine = await repository.rotateWebhook(
        scope,
        id,
        await routineDigest(webhookKey),
        now(),
        {
          secret,
          expectedOwner: current.routine.ownerAccountId,
          expectedWebhookDigest: current.webhookDigest,
          expectedSecretId: current.secret?.id ?? null,
        },
      );
      return { routine, webhookKey };
    },
    async test(scope, id, key) {
      const instant = now();
      const admission = await repository.admission(scope, id);
      return dispatch(
        admission.scope,
        await repository.fire(scope, id, {
          kind: "manual",
          id: deliveryId(key),
          bodyDigest: "manual",
          dueAt: instant,
          now: instant,
        }),
      );
    },
    async webhook(id, key, keyId, rawBody) {
      bounded(rawBody);
      deliveryId(keyId);
      try {
        JSON.parse(rawBody);
      } catch {
        throw new RoutineError("INVALID_INPUT");
      }
      const admission = await repository.ingress({ id });
      const digest = await routineDigest(key);
      if (
        !admission.routine.triggers.webhook ||
        !admission.webhookDigest ||
        !sameDigest(digest, admission.webhookDigest)
      )
        throw new RoutineError("UNAUTHORIZED");
      const instant = now();
      return dispatch(
        admission.scope,
        await repository.fire(admission.scope, id, {
          kind: "webhook",
          id: keyId,
          bodyDigest: await routineDigest(rawBody),
          expectedWebhookDigest: digest,
          untrustedText: rawBody,
          dueAt: instant,
          now: instant,
        }),
      );
    },
    async email(input) {
      if (!options.emailDomain) throw new RoutineError("UNAUTHORIZED");
      deliveryId(input.messageId);
      bounded(input.text);
      if (input.text.length > 32_000 || (input.subject?.length ?? 0) > 512)
        throw new RoutineError("PAYLOAD_TOO_LARGE");
      const admission = await repository.ingress({ address: input.address.toLowerCase() });
      const sender = input.sender.toLowerCase();
      if (
        !admission.routine.triggers.email ||
        admission.routine.triggers.email.allowedSender !== sender
      )
        throw new RoutineError("UNAUTHORIZED");
      const instant = now();
      const body = JSON.stringify({ sender, subject: input.subject ?? "", text: input.text });
      return dispatch(
        admission.scope,
        await repository.fire(admission.scope, admission.routine.id, {
          kind: "email",
          id: input.messageId,
          bodyDigest: await routineDigest(body),
          emailSender: sender,
          untrustedText: body,
          dueAt: instant,
          now: instant,
        }),
      );
    },
    async repository(id, signature, keyId, eventKind, rawBody) {
      bounded(rawBody);
      deliveryId(keyId);
      if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(eventKind)) throw new RoutineError("INVALID_INPUT");
      if (!/^sha256=[a-f0-9]{64}$/.test(signature)) throw new RoutineError("UNAUTHORIZED");
      const admission = await repository.ingress({ id });
      if (!admission.routine.triggers.repository || !admission.secret)
        throw new RoutineError("UNAUTHORIZED");
      const secret = await options.secrets.open(
        admission.secret.accountId,
        admission.secret.id,
        admission.secret,
      );
      const signingKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const bytes = await crypto.subtle.sign(
        "HMAC",
        signingKey,
        new TextEncoder().encode(`${keyId}\n${eventKind}\n${rawBody}`),
      );
      const expected =
        "sha256=" +
        Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
      if (!sameDigest(signature, expected)) throw new RoutineError("UNAUTHORIZED");
      try {
        JSON.parse(rawBody);
      } catch {
        throw new RoutineError("INVALID_INPUT");
      }
      const instant = now();
      return dispatch(
        admission.scope,
        await repository.fire(admission.scope, id, {
          kind: "repository",
          id: keyId,
          bodyDigest: await routineDigest(`${eventKind}\n${rawBody}`),
          expectedSecretId: admission.secret.id,
          repositoryEvent: eventKind,
          untrustedText: rawBody,
          dueAt: instant,
          now: instant,
        }),
      );
    },
    async scan(count = 100) {
      const claims = await repository.scan(now(), limit(count));
      for (const claim of claims) dispatch(claim.scope, claim.outcome);
    },
  };
}
