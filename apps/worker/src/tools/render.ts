import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TableData, Cell } from "./files.js";
import { countPdfPages, type PdfParserOptions } from "./pdf.js";
import { CloudExecutionError } from "../errors.js";

export interface GeneratedFile {
  name: string;
  mediaType: string;
  body: Uint8Array;
}
export interface ReportSpec {
  title: string;
  sections: { heading: string; body: string }[];
  sources?: { title: string; url: string }[];
}
export interface DeckSpec {
  title: string;
  slides: { title: string; bullets: string[]; notes?: string }[];
}
export interface RendererOptions extends PdfParserOptions {
  directory: string;
  fontPath?: string;
  fontFamily?: string;
  fontFace?: string;
  libreOfficePath?: string;
}
const execute = promisify(execFile);
const utf8 = (text: string) => new TextEncoder().encode(text);
const safeLabel = (name: string) =>
  // Filesystem labels must exclude the full ASCII control range.
  // eslint-disable-next-line no-control-regex
  name.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_").slice(0, 100) || "Voidmix";

export async function renderReport(
  spec: ReportSpec,
  options: RendererOptions,
): Promise<GeneratedFile[]> {
  if (
    !spec.title ||
    spec.sections.length < 1 ||
    spec.sections.length > 100 ||
    JSON.stringify(spec).length > 200_000
  )
    throw new Error("Report content exceeds limits.");
  const markdown = `# ${spec.title}\n\n${spec.sections.map((section) => `## ${section.heading}\n\n${section.body}`).join("\n\n")}${spec.sources?.length ? `\n\n## Sources\n\n${spec.sources.map((source) => `- [${source.title}](${source.url})`).join("\n")}` : ""}\n`;
  const containsCjk = /[\u3400-\u9fff]/.test(markdown);
  if (containsCjk && !options.fontPath)
    throw new CloudExecutionError(
      "DOCUMENT_RENDERER_UNAVAILABLE",
      "PDF export is unavailable: a Chinese font is not configured.",
    );
  if (options.fontPath)
    try {
      await access(options.fontPath);
    } catch {
      throw new CloudExecutionError("DOCUMENT_RENDERER_UNAVAILABLE", "PDF font is unavailable.");
    }
  const document = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: spec.title, Author: "Voidmix" },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  if (options.fontPath) {
    if (options.fontFamily) document.font(options.fontPath, options.fontFamily);
    else document.font(options.fontPath);
  }
  document.fontSize(22).text(spec.title);
  document.moveDown();
  for (const section of spec.sections) {
    options.signal?.throwIfAborted();
    document.fontSize(14).text(section.heading);
    document.moveDown(0.3);
    document.fontSize(10).text(section.body);
    document.moveDown();
  }
  if (spec.sources?.length) {
    document.fontSize(14).text("Sources");
    for (const source of spec.sources) document.fontSize(9).text(`${source.title}: ${source.url}`);
  }
  document.end();
  const body = await completed;
  if (body.byteLength > 10 * 1024 * 1024 || body.subarray(0, 4).toString() !== "%PDF")
    throw new Error("Report PDF is invalid or too large.");
  const name = safeLabel(spec.title);
  return [
    { name: `${name}.md`, mediaType: "text/markdown", body: utf8(markdown) },
    { name: `${name}.pdf`, mediaType: "application/pdf", body },
  ];
}

/** Text is always exported as literal values in Excel and CSV. */
export function literalCell(value: Cell): Cell {
  return typeof value === "string" && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
}
const csvValue = (value: Cell) => {
  const text = String(literalCell(value) ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export async function renderTable(title: string, tables: TableData[]): Promise<GeneratedFile[]> {
  if (!tables.length || tables.length > 20) throw new Error("Spreadsheet requires 1–20 sheets.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Voidmix";
  const files: GeneratedFile[] = [];
  const labels = new Set<string>();
  for (const table of tables) {
    if (
      !table.columns.length ||
      table.columns.length > 128 ||
      table.rows.length > 20_000 ||
      table.rows.length * table.columns.length > 500_000
    )
      throw new Error("Spreadsheet exceeds cell limits.");
    const label = safeLabel(table.name).replace(/[[\]]/g, "_").slice(0, 31);
    if (labels.has(label.toLowerCase())) throw new Error("Spreadsheet sheet names collide.");
    labels.add(label.toLowerCase());
    const sheet = workbook.addWorksheet(label);
    sheet.addRow(table.columns.map(literalCell));
    for (const row of table.rows) {
      if (row.length !== table.columns.length) throw new Error("Spreadsheet row width mismatch.");
      sheet.addRow(row.map(literalCell));
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns.forEach((column) => {
      column.width = 24;
    });
    files.push({
      name: `${safeLabel(title)}-${label}.csv`,
      mediaType: "text/csv",
      body: utf8(
        [table.columns, ...table.rows].map((row) => row.map(csvValue).join(",")).join("\r\n"),
      ),
    });
  }
  const body = await workbook.xlsx.writeBuffer();
  if (body.byteLength > 10 * 1024 * 1024) throw new Error("Spreadsheet exceeds output limit.");
  const verify = new ExcelJS.Workbook();
  await verify.xlsx.load(body);
  if (verify.worksheets.length !== tables.length)
    throw new Error("Spreadsheet verification failed.");
  return [
    {
      name: `${safeLabel(title)}.xlsx`,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: new Uint8Array(body),
    },
    ...files,
  ];
}

export async function renderDeck(
  spec: DeckSpec,
  options: RendererOptions,
): Promise<GeneratedFile[]> {
  if (
    !spec.title ||
    !spec.slides.length ||
    spec.slides.length > 30 ||
    JSON.stringify(spec).length > 100_000
  )
    throw new Error("Presentation content exceeds limits.");
  const binary = options.libreOfficePath ?? "/usr/bin/libreoffice";
  try {
    await access(binary);
  } catch {
    throw new CloudExecutionError(
      "DOCUMENT_RENDERER_UNAVAILABLE",
      "Presentation preview is unavailable: LibreOffice is not installed.",
    );
  }
  const Pptx = PptxGenJS as unknown as typeof PptxGenJS.default;
  await mkdir(options.directory, { recursive: true });
  const presentation = new Pptx();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "Voidmix";
  presentation.title = spec.title;
  presentation.subject = "Voidmix deliverable";
  const fontFace = options.fontFace ?? "Noto Sans CJK SC";
  presentation.theme = { headFontFace: fontFace, bodyFontFace: fontFace };
  for (const item of spec.slides) {
    if (
      !item.title ||
      item.title.length > 160 ||
      item.bullets.length > 8 ||
      item.bullets.some((bullet) => bullet.length > 500)
    )
      throw new Error("Presentation slide exceeds content limits.");
    const slide = presentation.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(item.title, {
      x: 0.6,
      y: 0.5,
      w: 12.1,
      h: 0.9,
      fontFace,
      lang: "zh-CN",
      fontSize: 28,
      bold: true,
      color: "202020",
      breakLine: false,
    });
    slide.addText(
      item.bullets.map((bullet) => ({
        text: bullet,
        options: { bullet: { indent: 18 }, breakLine: true },
      })),
      {
        x: 0.8,
        y: 1.8,
        w: 11.8,
        h: 4.8,
        fontFace,
        lang: "zh-CN",
        fontSize: 20,
        color: "333333",
        paraSpaceAfter: 14,
        valign: "top",
        fit: "shrink",
      },
    );
    if (item.notes) slide.addNotes(item.notes);
  }
  const pptx = (await presentation.write({ outputType: "nodebuffer" })) as Buffer;
  const filename = join(options.directory, "presentation.pptx");
  await writeFile(filename, pptx);
  const profile = new URL(`file://${join(options.directory, "lo-profile")}`).href;
  try {
    await execute(
      binary,
      [
        `-env:UserInstallation=${profile}`,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        options.directory,
        filename,
      ],
      {
        timeout: 120_000,
        maxBuffer: 64 * 1024,
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
  } catch {
    throw new Error("Presentation PDF conversion failed.");
  }
  const pdf = await readFile(join(options.directory, "presentation.pdf"));
  if (
    pdf.subarray(0, 4).toString() !== "%PDF" ||
    pdf.byteLength > 10 * 1024 * 1024 ||
    pptx.byteLength > 10 * 1024 * 1024
  )
    throw new Error("Presentation output is invalid or too large.");
  if (
    (await countPdfPages(join(options.directory, "presentation.pdf"), options)) !==
    spec.slides.length
  )
    throw new Error("Presentation PDF page count does not match slides.");
  const name = safeLabel(spec.title);
  return [
    {
      name: `${name}.pptx`,
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      body: pptx,
    },
    { name: `${name}.pdf`, mediaType: "application/pdf", body: pdf },
  ];
}
