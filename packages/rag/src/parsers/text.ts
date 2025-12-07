import type { DocumentParser, ParseResult } from "./index";

export class TextParser implements DocumentParser {
  async parse(buffer: Buffer, _mimeType: string): Promise<ParseResult> {
    const text = buffer.toString("utf-8");
    return {
      text,
      metadata: {},
    };
  }

  supports(mimeType: string, filename?: string): boolean {
    if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/xml" ||
      mimeType === "text/markdown" ||
      mimeType === "application/octet-stream" // Fallback for unknown text files
    ) {
      return true;
    }
    // Also support by file extension
    if (filename) {
      const ext = filename.split(".").pop()?.toLowerCase();
      const textExtensions = ["txt", "md", "markdown", "json", "xml", "csv", "html", "htm"];
      return textExtensions.includes(ext || "");
    }
    return false;
  }
}
