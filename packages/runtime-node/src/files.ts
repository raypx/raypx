import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { globSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const readTextFile = (path: string | URL) => readFile(path, "utf8");
export async function readJsonFile<T = any>(path: string | URL): Promise<T> {
  return JSON.parse(await readTextFile(path)) as T;
}
export const readBinaryFile = (path: string | URL) => readFile(path);
export async function fileExists(path: string | URL) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
export async function writeResource(
  path: string | URL,
  value: string | ArrayBuffer | Uint8Array | Blob | Response,
) {
  const content =
    value instanceof Response || value instanceof Blob
      ? new Uint8Array(await value.arrayBuffer())
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : value;
  if (typeof path === "string") mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, content);
}
export const removeResource = (path: string | URL) => unlink(path);

export function globFiles(
  pattern: string | string[],
  options: { cwd?: string; absolute?: boolean; onlyFiles?: boolean; dot?: boolean } = {},
) {
  const cwd = options.cwd ?? process.cwd();
  return [...globSync(pattern, { cwd })]
    .filter((path) => options.onlyFiles === false || statSync(resolve(cwd, path)).isFile())
    .map((path) => (options.absolute ? resolve(cwd, path) : path));
}
