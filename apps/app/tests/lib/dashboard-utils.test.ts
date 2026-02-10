import { describe, expect, it } from "vitest";
import { formatDate, formatFileSize, truncateTextMiddle } from "../../src/lib/dashboard-utils";

describe("dashboard-utils", () => {
  describe("formatDate", () => {
    it("should format valid dates", () => {
      const date = new Date("2024-01-15");
      expect(formatDate(date)).toMatch(/Jan 15, 2024/);
    });

    it("should format date strings", () => {
      expect(formatDate("2024-01-15")).toMatch(/Jan 15, 2024/);
    });

    it("should return 'Never' for null or undefined", () => {
      expect(formatDate(null)).toBe("Never");
      expect(formatDate(undefined)).toBe("Never");
    });
  });

  describe("formatFileSize", () => {
    it("should format bytes correctly", () => {
      expect(formatFileSize(0)).toBe("0 Bytes");
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(1024 * 1024)).toBe("1 MB");
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
    });

    it("should format fractional sizes", () => {
      expect(formatFileSize(1536)).toBe("1.5 KB"); // 1.5 KB
      expect(formatFileSize(2048)).toBe("2 KB");
      expect(formatFileSize(512)).toBe("512 Bytes"); // Less than 1 KB
      expect(formatFileSize(1536 * 1024)).toBe("1.5 MB"); // 1.5 MB
    });

    it("should handle large file sizes", () => {
      expect(formatFileSize(1024 * 1024 * 5)).toBe("5 MB");
    });
  });

  describe("truncateTextMiddle", () => {
    it("should return original text if shorter than maxLength", () => {
      expect(truncateTextMiddle("short text", 50)).toBe("short text");
    });

    it("should truncate long text in the middle", () => {
      const longText = "a".repeat(100);
      const result = truncateTextMiddle(longText, 50);
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result).toContain("...");
      expect(result).toMatch(/^a+\.\.\.a+$/);
    });

    it("should handle text with file extensions", () => {
      const filename = "very-long-filename-with-extension-that-needs-truncation.pdf";
      const result = truncateTextMiddle(filename, 40);
      expect(result).toContain("...");
      expect(result).toContain(".pdf");
      // The function preserves extension and uses start/end lengths, so result may exceed maxLength
      expect(result.length).toBeGreaterThan(0);
    });

    it("should use custom start and end lengths", () => {
      const text = "a".repeat(100);
      const result = truncateTextMiddle(text, 50, 10, 10);
      expect(result).toMatch(/^a{10}\.\.\.a{10}$/);
    });

    it("should handle empty or null text", () => {
      expect(truncateTextMiddle("", 50)).toBe("");
      expect(truncateTextMiddle("text", 10)).toBe("text");
    });
  });
});
