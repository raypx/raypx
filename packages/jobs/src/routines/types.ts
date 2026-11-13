import type {
  Routine,
  RoutineInput,
  RoutineDeliveryOutcome,
  RoutineHistory,
  RoutineEvent,
} from "@raypx/core/routines";
import type { SpaceScope } from "@raypx/spaces/server";

export interface RoutineSealedSecret {
  keyId: string;
  wrappedDataKey: string;
  ciphertext: string;
}
export interface RoutineSecretStore {
  seal(accountId: string, secretId: string, value: string): Promise<RoutineSealedSecret>;
  open(accountId: string, secretId: string, sealed: RoutineSealedSecret): Promise<string>;
}
export interface RoutineSecret extends RoutineSealedSecret {
  id: string;
  accountId: string;
}
export interface RoutineAdmission {
  scope: SpaceScope;
  routine: Routine;
  webhookDigest: string | null;
  secret: RoutineSecret | null;
}
export interface RoutineMutation {
  routine: Routine;
  webhookKey: string | null;
  repositorySecret: string | null;
}
export type RoutineOccurrenceKind = "schedule" | "manual" | "webhook" | "email" | "repository";
export interface RoutineFire {
  kind: RoutineOccurrenceKind;
  id: string;
  dueAt: Date;
  now: Date;
  bodyDigest: string;
  untrustedText?: string;
  expectedWebhookDigest?: string;
  expectedSecretId?: string;
  emailSender?: string;
  repositoryEvent?: string;
}
export interface RoutineDispatch {
  scope: SpaceScope;
  outcome: RoutineDeliveryOutcome;
}
export interface RoutinesRepository {
  list(scope: SpaceScope, agentId: string | undefined, limit: number): Promise<Routine[]>;
  get(scope: SpaceScope, id: string): Promise<Routine>;
  admission(scope: SpaceScope, id: string): Promise<RoutineAdmission>;
  /** Selector only. Authentication is checked under the routine lock before firing. */
  ingress(selector: { id: string } | { address: string }): Promise<RoutineAdmission>;
  create(
    scope: SpaceScope,
    id: string,
    input: RoutineInput,
    now: Date,
    values: {
      webhookDigest: string | null;
      secret: RoutineSecret | null;
      emailAddress: string | null;
    },
  ): Promise<Routine>;
  update(
    scope: SpaceScope,
    id: string,
    input: RoutineInput,
    now: Date,
    values: {
      webhookDigest: string | null;
      secret: RoutineSecret | null;
      emailAddress: string | null;
      expectedOwner: string;
      expectedWebhookDigest: string | null;
      expectedSecretId: string | null;
    },
  ): Promise<Routine>;
  rotateWebhook(
    scope: SpaceScope,
    id: string,
    digest: string,
    now: Date,
    values: {
      secret: RoutineSecret | null;
      expectedOwner: string;
      expectedWebhookDigest: string | null;
      expectedSecretId: string | null;
    },
  ): Promise<Routine>;
  delete(scope: SpaceScope, id: string): Promise<{ deleted: true }>;
  history(scope: SpaceScope, id: string, limit: number): Promise<RoutineHistory[]>;
  events(scope: SpaceScope, id: string, limit: number): Promise<RoutineEvent[]>;
  fire(scope: SpaceScope, id: string, input: RoutineFire): Promise<RoutineDeliveryOutcome>;
  /** Worker-only unscoped scan; locked rows resolve a current owner membership before firing. */
  scan(now: Date, limit: number): Promise<RoutineDispatch[]>;
}
export interface RoutinesService {
  list(scope: SpaceScope, agentId?: string, limit?: number): Promise<Routine[]>;
  get(scope: SpaceScope, id: string): Promise<Routine>;
  create(scope: SpaceScope, input: RoutineInput): Promise<RoutineMutation>;
  update(scope: SpaceScope, id: string, input: RoutineInput): Promise<RoutineMutation>;
  pause(scope: SpaceScope, id: string): Promise<Routine>;
  resume(scope: SpaceScope, id: string): Promise<Routine>;
  delete(scope: SpaceScope, id: string): Promise<{ deleted: true }>;
  test(scope: SpaceScope, id: string, idempotencyKey: string): Promise<RoutineDeliveryOutcome>;
  rotateWebhookKey(
    scope: SpaceScope,
    id: string,
  ): Promise<{ routine: Routine; webhookKey: string }>;
  history(scope: SpaceScope, id: string, limit?: number): Promise<RoutineHistory[]>;
  events(scope: SpaceScope, id: string, limit?: number): Promise<RoutineEvent[]>;
  webhook(
    id: string,
    key: string,
    idempotencyKey: string,
    rawBody: string,
  ): Promise<RoutineDeliveryOutcome>;
  email(input: {
    address: string;
    sender: string;
    messageId: string;
    text: string;
    subject?: string;
  }): Promise<RoutineDeliveryOutcome>;
  repository(
    id: string,
    signature: string,
    deliveryId: string,
    eventKind: string,
    rawBody: string,
  ): Promise<RoutineDeliveryOutcome>;
  scan(limit?: number): Promise<void>;
}
