import { describe, expect, it } from "vite-plus/test";
import { computeTable, parseCsv, validateXlsxArchive } from "./files.js";
import { isPublicAddress, validateSourceUrl } from "./network.js";
import { literalCell, renderTable } from "./render.js";
import ExcelJS from "exceljs";
import { validateCitations } from "./citations.js";

describe("trusted data and network tools", () => {
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
  it("blocks private, loopback, metadata, mapped and documentation addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "2001:db8::1",
      "2001:0db8:0000:0000::1",
      "2001:0000:0000::1",
      "2002:0a00:0101::",
    ])
      expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    for (const url of [
      "file:///etc/passwd",
      "http://127.0.0.1",
      "http://localhost",
      "https://user:pass@example.com",
      "http://example.com:8080",
    ])
      expect(() => validateSourceUrl(url)).toThrow();
  });
});
