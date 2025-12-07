import type { DocumentParser, ParseResult } from "./index";

export class PDFParser implements DocumentParser {
  async parse(buffer: Buffer, _mimeType: string): Promise<ParseResult> {
    // pdf-parse uses CommonJS, need to handle both default and named exports
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      metadata: {
        pages: data.numpages,
        info: data.info,
      },
    };
  }

  supports(mimeType: string, filename?: string): boolean {
    if (mimeType === "application/pdf") {
      return true;
    }
    // Also support by file extension
    if (filename) {
      const ext = filename.split(".").pop()?.toLowerCase();
      return ext === "pdf";
    }
    return false;
  }
}
