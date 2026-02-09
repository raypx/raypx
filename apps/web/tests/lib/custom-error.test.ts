import { describe, expect, it } from "vitest";
import { CustomError, customErrorAdapter } from "../../src/lib/custom-error";

describe("CustomError", () => {
  describe("CustomError class", () => {
    it("should create a CustomError instance with message and options", () => {
      const error = new CustomError("Test error", {
        foo: "bar",
        bar: BigInt(123),
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CustomError);
      expect(error.message).toBe("Test error");
      expect(error.foo).toBe("bar");
      expect(error.bar).toBe(BigInt(123));
      expect(error.name).toBe("CustomError");
    });

    it("should maintain prototype chain", () => {
      const error = new CustomError("Test", {
        foo: "test",
        bar: BigInt(1),
      });

      expect(error instanceof Error).toBe(true);
      expect(error instanceof CustomError).toBe(true);
    });
  });

  describe("customErrorAdapter", () => {
    it("should identify CustomError instances", () => {
      const error = new CustomError("Test", {
        foo: "test",
        bar: BigInt(1),
      });

      expect(customErrorAdapter.test(error)).toBe(true);
      expect(customErrorAdapter.test(new Error("Not custom"))).toBe(false);
      expect(customErrorAdapter.test({})).toBe(false);
    });

    it("should serialize CustomError to plain object", () => {
      const error = new CustomError("Test error", {
        foo: "test-value",
        bar: BigInt(456),
      });

      const serialized = customErrorAdapter.toSerializable(error);

      expect(serialized).toEqual({
        message: "Test error",
        foo: "test-value",
        bar: BigInt(456),
      });
    });

    it("should deserialize plain object to CustomError", () => {
      const serialized = {
        message: "Deserialized error",
        foo: "deserialized-foo",
        bar: BigInt(789),
      };

      const error = customErrorAdapter.fromSerializable(serialized);

      expect(error).toBeInstanceOf(CustomError);
      expect(error.message).toBe("Deserialized error");
      expect(error.foo).toBe("deserialized-foo");
      expect(error.bar).toBe(BigInt(789));
    });
  });
});
