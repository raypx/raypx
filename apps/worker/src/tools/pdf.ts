import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { CloudExecutionError } from "../errors.js";

const execute = promisify(execFile);
export interface PdfParserOptions {
  pdfToTextPath?: string;
  pdfInfoPath?: string;
  signal?: AbortSignal;
}
const commands = (options: PdfParserOptions) => {
  const text = options.pdfToTextPath ?? "/usr/bin/pdftotext";
  return { text, info: options.pdfInfoPath ?? join(dirname(text), "pdfinfo") };
};
export async function countPdfPages(path: string, options: PdfParserOptions = {}): Promise<number> {
  try {
    const result = await execute(commands(options).info, [path], {
      timeout: 30_000,
      maxBuffer: 64 * 1024,
      env: { ...process.env, LC_ALL: "C" },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const pages = Number(result.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (!Number.isSafeInteger(pages) || pages < 1 || pages > 100)
      throw new Error("PDF exceeds page limit.");
    return pages;
  } catch (error) {
    if (error instanceof Error && error.message === "PDF exceeds page limit.") throw error;
    throw new CloudExecutionError(
      "DOCUMENT_RENDERER_UNAVAILABLE",
      "PDF parsing is unavailable or failed: configure the trusted Poppler binaries.",
    );
  }
}
export async function extractPdfText(
  bytes: Uint8Array,
  options: PdfParserOptions = {},
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "voidmix-pdf-extract-"));
  const input = join(directory, "input.pdf");
  try {
    await writeFile(input, bytes, { mode: 0o600 });
    await countPdfPages(input, options);
    let content: string;
    try {
      content = (
        await execute(
          commands(options).text,
          ["-enc", "UTF-8", "-layout", "-nopgbrk", "-f", "1", "-l", "100", input, "-"],
          {
            timeout: 30_000,
            maxBuffer: 400_000,
            ...(options.signal ? { signal: options.signal } : {}),
          },
        )
      ).stdout;
    } catch (error) {
      const result = error as { code?: string; stdout?: unknown };
      if (result.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" && typeof result.stdout === "string")
        content = result.stdout;
      else throw new Error("PDF text extraction failed.");
    }
    const text = content.slice(0, 100_000);
    if (!text.trim()) throw new Error("PDF has no text layer; OCR is unavailable.");
    return text;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
