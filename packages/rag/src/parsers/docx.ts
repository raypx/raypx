import mammoth from "mammoth";
import type { DocumentParser, ParseResult } from "./index";

export class DOCXParser implements DocumentParser {
  async parse(buffer: Buffer, _mimeType: string): Promise<ParseResult> {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      metadata: {
        messages: result.messages,
      },
    };
  }

  supports(mimeType: string, filename?: string): boolean {
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      return true;
    }
    // Also support by file extension
    if (filename) {
      const ext = filename.split(".").pop()?.toLowerCase();
      return ext === "docx" || ext === "doc";
    }
    return false;
  }
}
