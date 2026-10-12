import ExcelJS from "exceljs";
import { inflateRawSync } from "node:zlib";
import { extractPdfText, type PdfParserOptions } from "./pdf.js";

export type Cell = string | number | boolean | null;
export interface TableData {
  name: string;
  columns: string[];
  rows: Cell[][];
  notes: string[];
}
export interface ExtractedFile {
  text: string;
  tables: TableData[];
}
const MAX_ROWS = 20_000,
  MAX_COLUMNS = 128,
  MAX_CELLS = 500_000;

export function parseCsv(text: string): TableData {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  const cell = () => {
    row.push(value);
    value = "";
    if (row.length > MAX_COLUMNS) throw new Error("Table exceeds column limit.");
  };
  const line = () => {
    cell();
    rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new Error("Table exceeds row limit.");
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value === "") quoted = true;
    else if (char === ",") cell();
    else if (char === "\n") line();
    else if (char !== "\r") value += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value.");
  if (value || row.length) line();
  const headers = rows.shift() ?? [];
  if (!headers.length) throw new Error("CSV has no columns.");
  if (rows.length * headers.length > MAX_CELLS) throw new Error("Table exceeds cell limit.");
  const columns = headers.map((h, i) => h.trim() || `Column ${i + 1}`);
  if (new Set(columns).size !== columns.length)
    throw new Error("Table column names must be unique.");
  return {
    name: "Sheet 1",
    columns,
    rows: rows
      .filter((r) => r.some(Boolean))
      .map((r) => {
        if (r.length !== columns.length) throw new Error("CSV row width differs from its header.");
        return r.map((v) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v));
      }),
    notes: [],
  };
}

/** Check declared ZIP expansion before ExcelJS allocates workbook contents. */
export function validateXlsxArchive(bytes: Uint8Array): void {
  const buffer = Buffer.from(bytes);
  let entries = 0,
    total = 0;
  for (let offset = 0; offset + 46 <= buffer.length; offset++)
    if (buffer.readUInt32LE(offset) === 0x02014b50) {
      const size = buffer.readUInt32LE(offset + 24),
        nameLength = buffer.readUInt16LE(offset + 28),
        extraLength = buffer.readUInt16LE(offset + 30),
        commentLength = buffer.readUInt16LE(offset + 32);
      entries++;
      total += size;
      if (size === 0xffffffff || total > 40 * 1024 * 1024 || entries > 512)
        throw new Error("Workbook exceeds ZIP expansion limit.");
      const compressed = buffer.readUInt32LE(offset + 20),
        local = buffer.readUInt32LE(offset + 42),
        method = buffer.readUInt16LE(offset + 10);
      if (
        local + 30 > buffer.length ||
        buffer.readUInt32LE(local) !== 0x04034b50 ||
        buffer.readUInt16LE(offset + 8) & 1
      )
        throw new Error("Workbook ZIP entry is invalid.");
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      if (start + compressed > buffer.length) throw new Error("Workbook ZIP entry is truncated.");
      const chunk = buffer.subarray(start, start + compressed);
      const actual =
        method === 0
          ? chunk
          : method === 8
            ? inflateRawSync(chunk, { maxOutputLength: Math.max(1, size) })
            : null;
      if (!actual || actual.byteLength !== size)
        throw new Error("Workbook ZIP expansion differs from declared size.");
      offset += 45 + nameLength + extraLength + commentLength;
    }
  if (!entries) throw new Error("Workbook archive is invalid.");
}

export async function extractFile(
  bytes: Uint8Array,
  mediaType: string,
  name: string,
  pdf: PdfParserOptions = {},
): Promise<ExtractedFile> {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("File exceeds 10MiB limit.");
  if (mediaType === "text/csv" || /\.csv$/i.test(name))
    return { text: "", tables: [parseCsv(new TextDecoder().decode(bytes))] };
  if (
    mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    /\.xlsx$/i.test(name)
  ) {
    validateXlsxArchive(bytes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(bytes).buffer);
    if (workbook.worksheets.length > 20) throw new Error("Workbook exceeds sheet limit.");
    const tables: TableData[] = [];
    for (const sheet of workbook.worksheets) {
      if (
        sheet.rowCount > MAX_ROWS + 1 ||
        sheet.columnCount > MAX_COLUMNS ||
        sheet.rowCount * sheet.columnCount > MAX_CELLS
      )
        throw new Error("Workbook exceeds table limits.");
      const notes = new Set<string>();
      const rows: Cell[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const cells: Cell[] = [];
        for (let col = 1; col <= sheet.columnCount; col++) {
          const value = row.getCell(col).value;
          let result: Cell = null;
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
            result = value;
          else if (value instanceof Date) result = value.toISOString();
          else if (value && typeof value === "object") {
            if ("formula" in value || "sharedFormula" in value) {
              notes.add("Formula cells use cached values; formulas were not recalculated.");
              const cached = "result" in value ? value.result : undefined;
              if (
                typeof cached === "string" ||
                typeof cached === "number" ||
                typeof cached === "boolean"
              )
                result = cached;
              else {
                notes.add("Some formula cells have no cached result and are unavailable.");
                result = null;
              }
            } else if ("richText" in value)
              result = value.richText.map((part) => part.text).join("");
            else if ("text" in value) result = value.text;
          }
          cells.push(result);
        }
        rows.push(cells);
      });
      const header = rows.shift() ?? [];
      const columns = header.map((v, i) => String(v ?? `Column ${i + 1}`));
      if (new Set(columns).size !== columns.length)
        throw new Error("Workbook column names must be unique.");
      tables.push({ name: sheet.name, columns, rows, notes: [...notes] });
    }
    return { text: "", tables };
  }
  if (mediaType === "application/pdf" || /\.pdf$/i.test(name)) {
    return { text: await extractPdfText(bytes, pdf), tables: [] };
  }
  if (mediaType.startsWith("text/") || /\.(md|txt)$/i.test(name))
    return { text: new TextDecoder().decode(bytes).slice(0, 100_000), tables: [] };
  throw new Error("File media type is unsupported.");
}

export function computeTable(
  table: TableData,
  input: {
    operation: "summary" | "group_sum" | "filter";
    column: string;
    groupBy?: string;
    equals?: Cell;
  },
): TableData {
  const index = table.columns.indexOf(input.column);
  if (index < 0) throw new Error("Column does not exist.");
  if (input.operation === "filter")
    return { ...table, rows: table.rows.filter((row) => row[index] === input.equals) };
  if (input.operation === "summary") {
    const values = table.rows
      .map((r) => r[index])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!values.length) throw new Error("Column has no numeric values.");
    const sum = values.reduce((n, v) => n + v, 0);
    return {
      name: `${table.name} summary`,
      columns: ["Metric", "Value"],
      rows: [
        ["count", values.length],
        ["sum", sum],
        ["mean", sum / values.length],
        ["min", Math.min(...values)],
        ["max", Math.max(...values)],
      ],
      notes: table.notes,
    };
  }
  const group = table.columns.indexOf(input.groupBy ?? "");
  if (group < 0) throw new Error("Grouping column does not exist.");
  const sums = new Map<string, number>();
  for (const row of table.rows) {
    const value = row[index];
    if (typeof value !== "number") continue;
    const key = String(row[group] ?? "");
    sums.set(key, (sums.get(key) ?? 0) + value);
  }
  return {
    name: `${table.name} grouped`,
    columns: [input.groupBy!, input.column],
    rows: [...sums].map(([key, sum]) => [key, sum]),
    notes: table.notes,
  };
}
