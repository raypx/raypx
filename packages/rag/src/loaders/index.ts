/**
 * Document loaders for various file types using LangChain
 * Supports PDF, CSV, JSON, Text, Markdown, DOCX, PPTX, and more
 */

import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
import { Document } from "@langchain/core/documents";
import { logger } from "../utils";

// TextLoader is available in @langchain/classic or can be created manually
// For now, we'll create a simple text loader wrapper
class SimpleTextLoader {
  filePathOrBlob: string | Blob;

  constructor(filePathOrBlob: string | Blob) {
    this.filePathOrBlob = filePathOrBlob;
  }

  async load(): Promise<Document[]> {
    let text: string;
    if (this.filePathOrBlob instanceof Blob) {
      text = await this.filePathOrBlob.text();
    } else {
      // For file paths, we'd need fs, but in serverless we use Blob
      throw new Error("File path not supported in serverless environment, use Blob instead");
    }

    // Return as a single document (TextLoader behavior)
    // The text splitter will handle chunking later
    return [
      new Document({
        pageContent: text,
        metadata: {
          source: this.filePathOrBlob instanceof Blob ? "blob" : this.filePathOrBlob,
        },
      }),
    ];
  }
}

/**
 * Create appropriate document loader based on MIME type
 */
export async function createDocumentLoader(
  fileBuffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<{ load: () => Promise<Document[]> } | null> {
  try {
    // PDF files
    if (mimeType === "application/pdf") {
      const pdfBlob = new Blob([fileBuffer], { type: "application/pdf" });
      return new PDFLoader(pdfBlob);
    }

    // CSV files - parse manually since CSVLoader requires file path
    if (mimeType === "text/csv" || mimeType === "application/csv" || filename?.endsWith(".csv")) {
      // CSVLoader requires file path, so we'll parse CSV manually
      const text = fileBuffer.toString("utf-8");
      const csvBlob = new Blob([text], { type: "text/csv" });
      // Use SimpleTextLoader as fallback - CSV will be treated as text
      // In the future, we could add manual CSV parsing here
      return new SimpleTextLoader(csvBlob);
    }

    // JSON files - parse manually since JSONLoader requires file path
    if (
      mimeType === "application/json" ||
      mimeType === "text/json" ||
      filename?.endsWith(".json")
    ) {
      const text = fileBuffer.toString("utf-8");
      const jsonBlob = new Blob([text], { type: "application/json" });
      // Use SimpleTextLoader as fallback - JSON will be treated as text
      // In the future, we could add manual JSON parsing here
      return new SimpleTextLoader(jsonBlob);
    }

    // Text files (plain text, markdown, etc.)
    if (mimeType.startsWith("text/") || filename?.match(/\.(txt|md|markdown|log)$/i)) {
      const text = fileBuffer.toString("utf-8");
      const textBlob = new Blob([text], { type: mimeType || "text/plain" });
      return new SimpleTextLoader(textBlob);
    }

    // DOCX files (Microsoft Word)
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword" ||
      filename?.match(/\.(docx|doc)$/i)
    ) {
      const docxBlob = new Blob([fileBuffer], {
        type: mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const fileType = filename?.endsWith(".doc") ? "doc" : "docx";
      return new DocxLoader(docxBlob, { type: fileType });
    }

    // PPTX files (Microsoft PowerPoint)
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      mimeType === "application/vnd.ms-powerpoint" ||
      filename?.match(/\.(pptx|ppt)$/i)
    ) {
      const pptxBlob = new Blob([fileBuffer], {
        type:
          mimeType || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      return new PPTXLoader(pptxBlob);
    }

    // Excel files
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      filename?.match(/\.(xlsx|xls)$/i)
    ) {
      // Excel loaders might not be available in LangChain.js community
      // Fallback to text extraction if available
      logger.warn("Excel files are not fully supported, attempting text extraction");
      const text = fileBuffer.toString("utf-8");
      const textBlob = new Blob([text], { type: "text/plain" });
      return new SimpleTextLoader(textBlob);
    }

    // HTML files
    if (mimeType === "text/html" || filename?.endsWith(".html")) {
      const text = fileBuffer.toString("utf-8");
      const htmlBlob = new Blob([text], { type: "text/html" });
      return new SimpleTextLoader(htmlBlob);
    }

    // Default: try SimpleTextLoader as fallback
    logger.warn(`Unsupported MIME type: ${mimeType}, attempting text extraction`);
    try {
      const text = fileBuffer.toString("utf-8");
      const textBlob = new Blob([text], { type: "text/plain" });
      return new SimpleTextLoader(textBlob);
    } catch (error) {
      logger.error("Failed to create text loader", { error, mimeType, filename });
      return null;
    }
  } catch (error) {
    logger.error("Failed to create document loader", {
      error: error instanceof Error ? error.message : String(error),
      mimeType,
      filename,
    });
    return null;
  }
}

/**
 * Load documents using the appropriate loader
 */
export async function loadDocuments(
  fileBuffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<Array<{ pageContent: string; metadata: Record<string, unknown> }>> {
  const loader = await createDocumentLoader(fileBuffer, mimeType, filename);

  if (!loader) {
    throw new Error(`No loader available for MIME type: ${mimeType}`);
  }

  try {
    const docs = await loader.load();
    logger.debug("Documents loaded", {
      count: docs.length,
      mimeType,
      filename,
    });
    return docs.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata || {},
    }));
  } catch (error) {
    logger.error("Failed to load documents", {
      error: error instanceof Error ? error.message : String(error),
      mimeType,
      filename,
    });
    throw error;
  }
}
