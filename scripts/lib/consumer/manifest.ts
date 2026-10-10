import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type JsonObject = Record<string, unknown>;
export interface Manifest extends JsonObject {
  name: string;
  version: string;
  exports: Record<string, unknown>;
}

export function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object");
  return value as JsonObject;
}
export function strings(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, item]) => {
      if (typeof item !== "string") throw new Error(`Expected a string dependency for ${key}`);
      return [key, item];
    }),
  );
}
export async function json(path: string): Promise<JsonObject> {
  return object(JSON.parse(await readFile(path, "utf8")));
}
export async function write(path: string, value: string | JsonObject): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
}

export function entries(manifest: Manifest): [string, unknown][] {
  return Object.entries(manifest.exports);
}
export function condition(value: unknown, name: string): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = (value as JsonObject)[name];
  return typeof item === "string" ? item : undefined;
}
export function specifier(manifest: Manifest, subpath: string): string {
  return subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
}
