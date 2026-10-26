import type { HumanDecision, HumanRequest } from "@raypx/contracts/tasks";
import { JsonProcess } from "../../transport";

/** The provider adapter sees protocol I/O, never Bun's child process or task storage. */
export interface ProviderProcess {
  readonly completed: Promise<number>;
  send(value: unknown): void;
  request(method: string, params: unknown): Promise<Record<string, unknown>>;
  control(request: Record<string, unknown>): Promise<Record<string, unknown>>;
  kill(): Promise<void>;
}
export type ProcessFactory = (
  executable: string,
  args: string[],
  directory: string,
  onMessage: (message: Record<string, unknown>) => void,
  env?: Record<string, string | undefined>,
) => ProviderProcess;
export const createProcess: ProcessFactory = (...args) => new JsonProcess(...args);
export type AskApproval = (
  kind: HumanRequest["kind"],
  title: string,
  body: string,
  questions?: HumanRequest["questions"],
  deadline?: number,
) => Promise<HumanDecision>;
export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
