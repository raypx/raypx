import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { importSkillPackage } from "./import.js";

const markdown =
  "---\nname: Reports\ndescription: Write clear reports\n---\nUse a concise summary.";
function zip(
  entries: { name: string; body?: string; mode?: number; advertisedSize?: number }[],
): string {
  const local: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const body = Buffer.from(entry.body ?? "");
    const packed = deflateRawSync(body);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(entry.advertisedSize ?? body.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, packed);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50);
    index.writeUInt16LE(0x0314, 4);
    index.writeUInt16LE(8, 10);
    index.writeUInt32LE(packed.length, 20);
    index.writeUInt32LE(entry.advertisedSize ?? body.length, 24);
    index.writeUInt16LE(name.length, 28);
    index.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    index.writeUInt32LE(offset, 42);
    directory.push(index, name);
    offset += header.length + name.length + packed.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, central, end]).toString("base64");
}
describe("text-only skill packages", () => {
  it("imports Markdown front matter without executing or retaining hook configuration", () => {
    const bytes = Buffer.from(
      markdown.replace("description:", "hooks:\n  pre: do-not-run\ndescription:"),
    ).toString("base64");
    expect(importSkillPackage({ format: "markdown", bytes })).toEqual({
      content: {
        name: "Reports",
        description: "Write clear reports",
        body: "Use a concise summary.",
      },
      omitted: [{ name: "SKILL.md#hooks", reason: "EXECUTABLE_OR_UNSUPPORTED" }],
    });
  });
  it("installs text references and names every executable/unsupported package part", () => {
    const bytes = zip([
      { name: "reports/SKILL.md", body: markdown },
      { name: "reports/references/style.md", body: "Use headings." },
      { name: "reports/scripts/run.sh", body: "exit 99", mode: 0o100755 },
      { name: "reports/hooks/before.md", body: "do not install" },
      { name: "reports/tool.bin", body: "binary" },
      { name: "reports/mcp.json", body: '{"command":"do-not-run"}' },
      { name: "reports/launch.md", body: "executable text", mode: 0o100755 },
    ]);
    const result = importSkillPackage({ format: "zip", bytes });
    expect(result.content.body).toContain("Use headings.");
    expect(result.content.body).not.toContain("exit 99");
    expect(result.omitted.map((part) => part.name)).toEqual([
      "reports/hooks/before.md",
      "reports/launch.md",
      "reports/mcp.json",
      "reports/scripts/run.sh",
      "reports/tool.bin",
    ]);
  });
  it.each(["../SKILL.md", "/SKILL.md", "x/../../SKILL.md", "x\\SKILL.md", "C:/SKILL.md"])(
    "rejects traversal %s",
    (name) => {
      expect(() =>
        importSkillPackage({ format: "zip", bytes: zip([{ name, body: markdown }]) }),
      ).toThrow("SKILL_PACKAGE_UNSAFE");
    },
  );
  it("rejects symbolic links, duplicates, unsupported archives and expansion bombs", () => {
    expect(() =>
      importSkillPackage({
        format: "zip",
        bytes: zip([
          { name: "SKILL.md", body: markdown },
          { name: "linked.md", body: "../secret", mode: 0o120777 },
        ]),
      }),
    ).toThrow("SKILL_PACKAGE_UNSAFE");
    expect(() =>
      importSkillPackage({
        format: "zip",
        bytes: zip([
          { name: "SKILL.md", body: markdown },
          { name: "SKILL.md", body: markdown },
        ]),
      }),
    ).toThrow("SKILL_PACKAGE_INVALID");
    expect(() =>
      importSkillPackage({
        format: "zip",
        bytes: Buffer.from("not an archive").toString("base64"),
      }),
    ).toThrow("SKILL_PACKAGE_INVALID");
    expect(() =>
      importSkillPackage({
        format: "zip",
        bytes: zip([
          { name: "SKILL.md", body: markdown },
          { name: "large.txt", body: "x", advertisedSize: 524_289 },
        ]),
      }),
    ).toThrow("SKILL_PACKAGE_TOO_LARGE");
    expect(() =>
      importSkillPackage({
        format: "zip",
        bytes: zip([
          { name: "SKILL.md", body: markdown },
          { name: "large.txt", body: "x".repeat(600_000), advertisedSize: 1 },
        ]),
      }),
    ).toThrow("SKILL_PACKAGE_TOO_LARGE");
  });
  it("bounds installed body and package bytes", () => {
    expect(() =>
      importSkillPackage({
        format: "markdown",
        bytes: Buffer.from(markdown + "x".repeat(64_001)).toString("base64"),
      }),
    ).toThrow("SKILL_PACKAGE_TOO_LARGE");
    expect(() =>
      importSkillPackage({
        format: "markdown",
        bytes: Buffer.alloc(2_097_153, 32).toString("base64"),
      }),
    ).toThrow("SKILL_PACKAGE_TOO_LARGE");
  });
});
