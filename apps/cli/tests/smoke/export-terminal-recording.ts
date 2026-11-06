import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Explicit export step: raw recordings and credentials never go directly into Git.
const [directory, destination, mode] = process.argv.slice(2);
if (!directory || !destination)
  throw new Error("Provide a private capture directory and reviewed fixture destination");
const captureDirectory = directory;
const metadata = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8"));
if (!["claude", "codex"].includes(metadata.provider)) throw new Error("Unknown recording provider");
const cliMode =
  metadata.cliMode ??
  (metadata.transport === "app-server"
    ? "app-server"
    : (await Bun.file(join(directory, "terminal.txt")).exists())
      ? "terminal"
      : "print");
const lines = (source: string) =>
  source
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
let records: unknown[],
  expectedMessage = "";
if (mode === "session") {
  if (metadata.provider !== "claude")
    throw new Error("Session JSONL export currently requires Claude");
  metadata.scenario = "stream-and-usage";
  metadata.transport = "stream-json";
  records = lines(await readFile(join(directory, "session.jsonl"), "utf8")).filter((value) =>
    ["stream_event", "assistant", "user", "result"].includes(value.type),
  );
  for (const value of records) {
    const message = object(object(value).message);
    if (object(value).type === "assistant" && Array.isArray(message.content)) {
      const text = message.content
        .map((item) => object(item))
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .filter((item) => typeof item === "string")
        .join("\n");
      if (text) expectedMessage = text;
    }
  }
} else if (metadata.scenario === "stream-and-usage") {
  records = lines(await readFile(join(directory, "events.jsonl"), "utf8")).filter((value) =>
    [
      "turn/started",
      "turn/completed",
      "item/started",
      "item/completed",
      "item/agentMessage/delta",
      "thread/tokenUsage/updated",
    ].includes(value.method),
  );
  for (const value of records) {
    const message = object(value),
      item = object(object(message.params).item);
    if (
      message.method === "item/completed" &&
      item.type === "agentMessage" &&
      typeof item.text === "string"
    )
      expectedMessage = item.text;
  }
} else {
  records = lines(await readFile(join(directory, "hooks.jsonl"), "utf8"));
}
const identities = new Map<string, string>();
function redact(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [field, redact(item, field)]),
    );
  if (typeof value !== "string") return value;
  if (key === "id" || key === "uuid" || /(?:Id|_id)$/.test(key)) {
    let alias = identities.get(value);
    if (!alias) {
      alias = `recorded-id-${identities.size + 1}`;
      identities.set(value, alias);
    }
    return alias;
  }
  if (key === "transcript_path") return "/fixture/transcript.jsonl";
  if (key === "cwd") return "/fixture/project";
  if (["thinking", "reasoning", "encrypted_content", "signature"].includes(key)) return "[omitted]";
  if (/(?:authorization|api.?key|access.?token|refresh.?token)/i.test(key)) return "[redacted]";
  return value
    .replaceAll(captureDirectory, "/fixture")
    .replaceAll(captureDirectory.replace("/var/", "/private/var/"), "/fixture");
}
const result = {
  provenance: {
    provider: metadata.provider,
    version: metadata.version,
    transport: metadata.transport ?? "command-hook",
    cliMode,
    scenario: metadata.scenario,
    recordedAt: metadata.recordedAt,
    source: "real-cli",
    redaction:
      "Identity fields and local paths replaced; event structure/order and numeric usage retained",
  },
  records: redact(records),
  ...(expectedMessage ? { expectedMessage: redact(expectedMessage) } : {}),
};
await writeFile(destination, JSON.stringify(result, null, 2) + "\n");
console.info(
  `Exported ${metadata.provider} ${metadata.scenario}; review the fixture before committing`,
);
