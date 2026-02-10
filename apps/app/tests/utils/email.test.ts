import { describe, expect, it } from "vitest";
import { isValidEmail } from "../../src/utils/email";

describe("email utils", () => {
  describe("isValidEmail", () => {
    it("should validate correct email addresses", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("test.email@domain.co.uk")).toBe(true);
      expect(isValidEmail("user+tag@example.com")).toBe(true);
      expect(isValidEmail("user_name@example-domain.com")).toBe(true);
    });

    it("should reject invalid email addresses", () => {
      expect(isValidEmail("invalid")).toBe(false);
      expect(isValidEmail("invalid@")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
      expect(isValidEmail("user@")).toBe(false);
      expect(isValidEmail("user@domain")).toBe(false);
      expect(isValidEmail("user space@example.com")).toBe(false);
      expect(isValidEmail("")).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(isValidEmail("a@b.c")).toBe(true); // Minimal valid email
      expect(isValidEmail("user@sub.domain.com")).toBe(true);
      expect(isValidEmail("123@456.789")).toBe(true);
    });
  });
});
