import { createHash } from "node:crypto";

export const argumentKey = (reference: string) =>
  `RAYPX_TASK_ARGS_${createHash("sha256").update(reference).digest("hex").slice(0, 16).toUpperCase()}`;

export function taskArguments(
  reference: string,
  environment: Record<string, string | undefined>,
): string[] {
  const args: unknown = JSON.parse(environment[argumentKey(reference)] ?? "[]");
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string"))
    throw new Error("Task arguments must be a string array");
  return args;
}
