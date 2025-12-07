/**
 * Document parsers for extracting text from various file formats
 */

export interface ParseResult {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentParser {
  parse(buffer: Buffer, mimeType: string): Promise<ParseResult>;
  supports(mimeType: string, filename?: string): boolean;
}
