import { describe, expect, it } from "vite-plus/test";
import { createCloudApplication } from "@raypx/application";
import { cloudToolNames } from "@raypx/core";
import { InMemoryCloudRepository } from "@raypx/db";
import { computeTable, parseCsv, validateXlsxArchive } from "./files.js";
import { literalCell, renderTable } from "./render.js";
import ExcelJS from "exceljs";
import { validateCitations } from "./citations.js";
import { createTrustedTools, type ToolHost } from "./index.js";

describe("trusted data and document tools", () => {
  it("keeps the registry aligned with authorized names and limits modes and children", async () => {
    const app = createCloudApplication({
      repository: new InMemoryCloudRepository({
        users: [{ id: "owner", email: "owner@example.com" }],
      }),
    });
    const conversation = await app.createConversation({
      actorId: "owner",
      title: "Tool registry",
      idempotencyKey: "conversation",
    });
    const { run } = await app.sendTurn({
      actorId: "owner",
      conversationId: conversation.id,
      prompt: "Research and produce deliverables",
      mode: "computer",
      idempotencyKey: "turn",
    });
    const host: ToolHost = {
      app,
      storage: null,
      run,
      ownerId: "owner",
      epoch: run.epoch,
      executionId: "registry",
      context: {
        tables: new Map(),
        sources: new Map(),
        assets: new Map(),
        generatedAssetIds: new Set(),
      },
      renderer: { directory: "/unused" },
      research: {
        search: async () => [],
        read: async (url) => ({ url, title: "Source", text: "Evidence" }),
      },
    };
    const computer = createTrustedTools({ ...host, delegate: async () => [] }).map(
      (tool) => tool.name,
    );
    expect([...computer].sort()).toEqual([...cloudToolNames].sort());
    expect(new Set(computer).size).toBe(computer.length);

    const child = createTrustedTools(host).map((tool) => tool.name);
    expect(child).not.toContain("delegate");
    expect([...child].sort()).toEqual(cloudToolNames.filter((name) => name !== "delegate").sort());

    const searchHost: ToolHost = { ...host, run: { ...run, mode: "search" } };
    const search = createTrustedTools({ ...searchHost, delegate: async () => [] }).map(
      (tool) => tool.name,
    );
    expect(search).toEqual(["search", "read_source", "extract_file", "compute_table", "delegate"]);
    expect(search.every((name) => cloudToolNames.includes(name))).toBe(true);

    const searchChild = createTrustedTools(searchHost).map((tool) => tool.name);
    expect(searchChild).toEqual(["search", "read_source", "extract_file", "compute_table"]);
    expect(searchChild).not.toContain("delegate");

    const { research: _research, ...withoutResearch } = host;
    const local = createTrustedTools(withoutResearch).map((tool) => tool.name);
    expect(local).not.toContain("search");
    expect(local).not.toContain("read_source");
    expect(local).toContain("extract_file");
    expect(local).toContain("render_table");
  });

  it("requires searched evidence and rejects invented citations including reference links", () => {
    const sources = [{ url: "https://example.com/research" }];
    expect(() =>
      validateCitations("[source](https://example.com/research)", sources, true),
    ).not.toThrow();
    expect(() => validateCitations("Unverified answer", sources, true)).toThrow("evidence");
    expect(() => validateCitations("[1]: https://invented.example/source", sources)).toThrow(
      "not found",
    );
    expect(() => validateCitations("[source](https://example.com/research)", [], true)).toThrow(
      "not found",
    );
  });
  it("parses quoted CSV lines and computes trusted numeric aggregates", () => {
    const table = parseCsv(
      'Category,Value,Note\nA,10,"line one\nline two"\nA,20,"say ""hi"""\nB,5,plain\n',
    );
    expect(table.rows[0]).toEqual(["A", 10, "line one\nline two"]);
    expect(table.rows[1]?.[2]).toBe('say "hi"');
    expect(
      computeTable(table, { operation: "group_sum", column: "Value", groupBy: "Category" }).rows,
    ).toEqual([
      ["A", 30],
      ["B", 5],
    ]);
    expect(computeTable(table, { operation: "summary", column: "Value" }).rows).toContainEqual([
      "sum",
      35,
    ]);
    expect(() => parseCsv("A,A\n1,2")).toThrow("unique");
    expect(() => parseCsv("A,B\n1")).toThrow("width");
  });
  it("exports Chinese spreadsheet values literally and never adds executable formulas", async () => {
    const generated = await renderTable("分析", [
      {
        name: "统计",
        columns: ["名称", "值"],
        rows: [
          ["中文", 42],
          ['=WEBSERVICE("bad")', 1],
          [" +CMD", 2],
        ],
        notes: [],
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(generated[0]!.body.slice().buffer as ArrayBuffer);
    expect(workbook.worksheets[0]?.getCell("A2").value).toBe("中文");
    expect(workbook.worksheets[0]?.getCell("A3").value).toBe('\'=WEBSERVICE("bad")');
    expect(new TextDecoder().decode(generated[1]!.body)).toContain("中文,42");
    expect(literalCell("  @import")).toBe("'  @import");
    expect(() => validateXlsxArchive(generated[0]!.body)).not.toThrow();
    expect(() => validateXlsxArchive(new Uint8Array(100))).toThrow("invalid");
  });
});
