/**
 * Text chunking utilities for splitting documents into smaller pieces
 */

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface TextChunk {
  text: string;
  index: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Split text into chunks with overlap
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const { chunkSize = 1000, chunkOverlap = 200 } = options;

  if (text.length <= chunkSize) {
    return [
      {
        text,
        index: 0,
        startIndex: 0,
        endIndex: text.length,
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let startIndex = 0;
  let index = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunkText = text.slice(startIndex, endIndex);

    chunks.push({
      text: chunkText,
      index,
      startIndex,
      endIndex,
    });

    // Move start index forward by chunkSize - overlap
    startIndex += chunkSize - chunkOverlap;
    index += 1;
  }

  return chunks;
}
