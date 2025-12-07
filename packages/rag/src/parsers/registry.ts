import { DOCXParser } from "./docx";
import type { DocumentParser } from "./index";
import { PDFParser } from "./pdf";
import { TextParser } from "./text";

const parsers: DocumentParser[] = [new PDFParser(), new DOCXParser(), new TextParser()];

/**
 * Infer MIME type from file extension
 */
function inferMimeTypeFromExtension(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return null;

  const mimeTypeMap: Record<string, string> = {
    // PDF
    pdf: "application/pdf",
    // Word documents
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    // Text files
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    xml: "application/xml",
    csv: "text/csv",
    html: "text/html",
    htm: "text/html",
  };

  return mimeTypeMap[ext] || null;
}

export function getParser(mimeType: string, filename?: string): DocumentParser | null {
  // Try each parser with both MIME type and filename
  for (const parser of parsers) {
    if (parser.supports(mimeType, filename)) {
      return parser;
    }
  }

  return null;
}

export function parseDocument(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<{ text: string; metadata?: Record<string, unknown> }> {
  const parser = getParser(mimeType, filename);
  if (!parser) {
    const fileInfo = filename ? ` (${filename})` : "";
    throw new Error(`Unsupported file type: ${mimeType}${fileInfo}`);
  }

  // Use inferred MIME type if original was octet-stream
  const actualMimeType =
    mimeType === "application/octet-stream" && filename
      ? inferMimeTypeFromExtension(filename) || mimeType
      : mimeType;

  return parser.parse(buffer, actualMimeType);
}
