import { inflateRawSync } from "node:zlib";
import {
  MAX_SKILL_PACKAGE_BYTES,
  MAX_SKILL_BODY,
  SkillError,
  skillContentSchema,
  type SkillContent,
  type SkillImportInput,
} from "@raypx/core/skills";

const MAX_FILES = 128;
const MAX_EXPANDED_BYTES = 524_288;
const decoder = new TextDecoder("utf-8", { fatal: true });
interface Entry {
  name: string;
  bytes: Uint8Array;
  runnable: boolean;
}
function unsafe(): never {
  throw new SkillError("SKILL_PACKAGE_UNSAFE");
}
function invalid(): never {
  throw new SkillError("SKILL_PACKAGE_INVALID");
}
function large(): never {
  throw new SkillError("SKILL_PACKAGE_TOO_LARGE");
}
function path(name: string): string {
  if (
    !name ||
    name.length > 256 ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name)
  )
    unsafe();
  if (name.split("/").some((part) => part === ".." || part === ".")) unsafe();
  return name;
}
function u16(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) invalid();
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}
function u32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) invalid();
  return (u16(bytes, offset) | (u16(bytes, offset + 2) << 16)) >>> 0;
}
/** Parse only bounded ordinary ZIP entries; no path is ever materialized on disk. */
function unzip(bytes: Uint8Array): Entry[] {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(bytes, i) === 0x06054b50 && i + 22 + u16(bytes, i + 20) === bytes.length) {
      end = i;
      break;
    }
  }
  if (end < 0 || u16(bytes, end + 4) || u16(bytes, end + 6)) invalid();
  const count = u16(bytes, end + 10);
  if (count !== u16(bytes, end + 8) || count > MAX_FILES) large();
  const directoryEnd = u32(bytes, end + 16) + u32(bytes, end + 12);
  if (directoryEnd !== end) invalid();
  let offset = u32(bytes, end + 16);
  let expanded = 0;
  const entries: Entry[] = [];
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (u32(bytes, offset) !== 0x02014b50) invalid();
    const flags = u16(bytes, offset + 8);
    const compression = u16(bytes, offset + 10);
    const compressed = u32(bytes, offset + 20);
    const length = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const external = u32(bytes, offset + 38);
    const local = u32(bytes, offset + 42);
    if (flags & 1 || ![0, 8].includes(compression) || u16(bytes, offset + 34)) invalid();
    const name = path(decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)));
    if (names.has(name)) invalid();
    names.add(name);
    const mode = external >>> 16;
    if ((mode & 0xf000) === 0xa000) unsafe();
    if (mode & 0xf000 && ![0x8000, 0x4000].includes(mode & 0xf000)) unsafe();
    expanded += length;
    if (expanded > MAX_EXPANDED_BYTES || length > MAX_EXPANDED_BYTES) large();
    if (
      u32(bytes, local) !== 0x04034b50 ||
      u16(bytes, local + 8) !== compression ||
      u16(bytes, local + 6) & 1
    )
      invalid();
    const localNameLength = u16(bytes, local + 26);
    const start = local + 30 + localNameLength + u16(bytes, local + 28);
    if (
      decoder.decode(bytes.slice(local + 30, local + 30 + localNameLength)) !== name ||
      start + compressed > u32(bytes, end + 16)
    )
      invalid();
    const packed = bytes.slice(start, start + compressed);
    let unpacked: Uint8Array;
    if (compression === 0) unpacked = packed;
    else {
      try {
        unpacked = inflateRawSync(packed, { maxOutputLength: MAX_EXPANDED_BYTES });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ERR_BUFFER_TOO_LARGE"
        )
          large();
        throw error;
      }
    }
    if (unpacked.length !== length) invalid();
    if (!name.endsWith("/"))
      entries.push({ name, bytes: unpacked, runnable: Boolean(mode & 0o111) });
    offset += 46 + nameLength + extraLength + commentLength;
    if (offset > directoryEnd) invalid();
  }
  if (offset !== directoryEnd) invalid();
  return entries;
}
function frontMatter(text: string): { content: SkillContent; omittedFields: string[] } {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normalized);
  if (!match) invalid();
  const fields: Record<string, string> = {};
  const omittedFields: string[] = [];
  const keys = new Set<string>();
  const lines = match[1]!.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || line.startsWith("#")) continue;
    const entry = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!entry) invalid();
    const key = entry[1]!;
    if (keys.has(key)) invalid();
    keys.add(key);
    if (!["name", "description"].includes(key)) {
      if (
        [
          "hooks",
          "scripts",
          "binaries",
          "command",
          "commands",
          "server",
          "servers",
          "mcpServers",
        ].includes(key)
      )
        omittedFields.push(`SKILL.md#${key}`);
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]!) || !lines[i + 1]!.trim())) i++;
      continue;
    }
    if (fields[key] !== undefined) invalid();
    let value = entry[2]!.trim();
    if (value === "|" || value === ">") {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1]!)) block.push(lines[++i]!.trim());
      value = block.join(" ");
    } else if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        invalid();
      }
    } else if (value.startsWith("'") && value.endsWith("'"))
      value = value.slice(1, -1).replace(/''/g, "'");
    if (typeof value !== "string") invalid();
    fields[key] = value;
  }
  if (match[2]!.length > MAX_SKILL_BODY) large();
  return {
    content: skillContentSchema.parse({
      name: fields.name,
      description: fields.description,
      body: match[2]!,
    }),
    omittedFields,
  };
}
function executable(name: string): boolean {
  const parts = name.toLowerCase().split("/");
  return (
    parts.some((part) =>
      ["scripts", "hooks", "bin", "node_modules", ".git", "servers", "commands"].includes(part),
    ) || !/\.(md|txt)$/i.test(name)
  );
}
export function importSkillPackage(input: SkillImportInput): {
  content: SkillContent;
  omitted: { name: string; reason: "EXECUTABLE_OR_UNSUPPORTED" }[];
} {
  try {
    const bytes = Buffer.from(input.bytes, "base64");
    if (!bytes.length || bytes.toString("base64") !== input.bytes) invalid();
    if (bytes.length > MAX_SKILL_PACKAGE_BYTES) large();
    if (input.format === "markdown") {
      if (bytes.length > MAX_EXPANDED_BYTES) large();
      const parsed = frontMatter(decoder.decode(bytes));
      return {
        content: parsed.content,
        omitted: parsed.omittedFields.map((name) => ({
          name,
          reason: "EXECUTABLE_OR_UNSUPPORTED",
        })),
      };
    }
    const entries = unzip(bytes).sort((a, b) => a.name.localeCompare(b.name));
    const roots = entries.filter(
      (entry) =>
        /(?:^|\/)SKILL\.md$/i.test(entry.name) && !executable(entry.name) && !entry.runnable,
    );
    if (roots.length !== 1) invalid();
    const root = roots[0]!;
    const parsed = frontMatter(decoder.decode(root.bytes));
    const content = parsed.content;
    const omitted: { name: string; reason: "EXECUTABLE_OR_UNSUPPORTED" }[] =
      parsed.omittedFields.map((name) => ({
        name: name.replace(/^SKILL\.md/, root.name),
        reason: "EXECUTABLE_OR_UNSUPPORTED",
      }));
    for (const entry of entries) {
      if (entry === root) continue;
      if (executable(entry.name) || entry.runnable)
        omitted.push({ name: entry.name, reason: "EXECUTABLE_OR_UNSUPPORTED" });
      else
        content.body += `\n\n---\nText reference: ${JSON.stringify(entry.name)}\n\n${decoder.decode(entry.bytes)}`;
    }
    if (content.body.length > MAX_SKILL_BODY) large();
    return { content: skillContentSchema.parse(content), omitted };
  } catch (error) {
    if (error instanceof SkillError) throw error;
    throw new SkillError("SKILL_PACKAGE_INVALID");
  }
}
