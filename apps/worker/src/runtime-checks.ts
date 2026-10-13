import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getDocumentEnvironment } from "./env.js";
import { runnerEnvironment } from "./process-executor.js";
import configuration from "./runtime-check.config.json" with { type: "json" };
import { extractFile } from "./tools/files.js";
import { renderReport, renderTable, renderDeck } from "./tools/render.js";

export async function checkRuntime(workerEntry: URL): Promise<void> {
  const sample = configuration.runtime;
  await promisify(execFile)(
    process.execPath,
    ["--no-env-file", "--no-install", fileURLToPath(workerEntry), "--runner", "--check"],
    { env: runnerEnvironment(), timeout: 30_000 },
  );
  const pdf = await renderReport(sample.report, { directory: "." });
  const xlsx = await renderTable(sample.spreadsheet.title, sample.spreadsheet.sheets);
  if (
    pdf[1]?.mediaType !== sample.expectedPdfMediaType ||
    xlsx[0]?.mediaType !== sample.expectedSpreadsheetMediaType
  )
    throw new Error("Document runtime check failed.");
  process.stdout.write(
    "Raypx single Worker entry and isolated Runner mode, PDF and XLSX runtime verified.\n",
  );
}

export async function checkDocuments(): Promise<void> {
  const sample = configuration.documents;
  const env = getDocumentEnvironment();
  const directory = await mkdtemp(join(tmpdir(), "raypx-document-check-"));
  const options = {
    directory,
    fontPath: env.CLOUD_PDF_FONT_PATH ?? sample.font.path,
    fontFamily: env.CLOUD_PDF_FONT_FAMILY ?? sample.font.family,
    fontFace: env.CLOUD_PPTX_FONT_FACE,
    libreOfficePath: env.SOFFICE_BINARY,
    pdfToTextPath: env.PDFTOTEXT_BINARY,
    pdfInfoPath: env.PDFINFO_BINARY,
  };
  try {
    const report = await renderReport(sample.report.spec, options);
    if (
      !(
        await extractFile(report[1]!.body, "application/pdf", sample.report.fileName, options)
      ).text.includes(sample.report.expectedText)
    )
      throw new Error("Chinese report PDF text verification failed.");
    const spreadsheet = await renderTable(sample.spreadsheet.title, sample.spreadsheet.sheets);
    if (
      (
        await extractFile(
          spreadsheet[0]!.body,
          spreadsheet[0]!.mediaType,
          sample.spreadsheet.fileName,
        )
      ).tables[0]?.rows[0]?.[0] !== sample.spreadsheet.expectedFirstCell
    )
      throw new Error("Chinese spreadsheet verification failed.");
    const deck = await renderDeck(sample.deck.spec, options);
    if (
      !(
        await extractFile(deck[1]!.body, "application/pdf", sample.deck.fileName, options)
      ).text.includes(sample.deck.expectedText)
    )
      throw new Error("Chinese presentation PDF text verification failed.");
    process.stdout.write(
      `Raypx Chinese PDF, XLSX and actual ${sample.deck.spec.slides.length}-page PPTX/PDF conversion verified.\n`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
