import { describe, expect, it } from "vitest";
import { formatDate, formatFileSize } from "../dashboard-utils";

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
});
