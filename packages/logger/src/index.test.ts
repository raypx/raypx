import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, logger } from "./index";

describe("Logger", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Reset NODE_ENV before each test
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("createLogger", () => {
    it("should create a logger instance", () => {
      const log = createLogger();
      expect(log).toBeDefined();
      expect(log.debug).toBeTypeOf("function");
      expect(log.info).toBeTypeOf("function");
      expect(log.warn).toBeTypeOf("function");
      expect(log.error).toBeTypeOf("function");
      expect(log.fatal).toBeTypeOf("function");
      expect(log.child).toBeTypeOf("function");
    });

    it("should use consola in development", () => {
      process.env.NODE_ENV = "development";
      const log = createLogger();
      expect(log).toBeDefined();
      // Just verify it doesn't throw
      log.info("test message");
    });

    it("should use pino in production", () => {
      process.env.NODE_ENV = "production";
      const log = createLogger();
      expect(log).toBeDefined();
      // Just verify it doesn't throw
      log.info("test message");
    });

    it("should force consola type", () => {
      process.env.NODE_ENV = "production";
      const log = createLogger({ forceType: "consola" });
      expect(log).toBeDefined();
      log.info("forced consola");
    });

    it("should force pino type", () => {
      process.env.NODE_ENV = "development";
      const log = createLogger({ forceType: "pino" });
      expect(log).toBeDefined();
      log.info("forced pino");
    });

    it("should create logger with name", () => {
      const log = createLogger({ name: "test-logger" });
      expect(log).toBeDefined();
      log.info("named logger");
    });

    it("should create logger with custom level", () => {
      const log = createLogger({ level: "warn" });
      expect(log).toBeDefined();
      log.warn("warn level");
    });
  });

  describe("Logger methods", () => {
    it("should call debug method", () => {
      const log = createLogger();
      expect(() => log.debug("debug message")).not.toThrow();
    });

    it("should call info method", () => {
      const log = createLogger();
      expect(() => log.info("info message")).not.toThrow();
    });

    it("should call warn method", () => {
      const log = createLogger();
      expect(() => log.warn("warn message")).not.toThrow();
    });

    it("should call error method", () => {
      const log = createLogger();
      expect(() => log.error("error message")).not.toThrow();
    });

    it("should call fatal method", () => {
      const log = createLogger();
      expect(() => log.fatal("fatal message")).not.toThrow();
    });

    it("should pass additional arguments", () => {
      const log = createLogger();
      expect(() => log.info("message", { key: "value" }, 123)).not.toThrow();
    });
  });

  describe("child logger", () => {
    it("should create a child logger", () => {
      const parent = createLogger({ name: "parent" });
      const child = parent.child({ name: "child" });
      expect(child).toBeDefined();
      expect(child.debug).toBeTypeOf("function");
      expect(child.info).toBeTypeOf("function");
    });

    it("should log from child logger", () => {
      const parent = createLogger({ name: "parent" });
      const child = parent.child({ name: "child" });
      expect(() => child.info("child message")).not.toThrow();
    });

    it("should create nested child loggers", () => {
      const parent = createLogger({ name: "parent" });
      const child = parent.child({ name: "child" });
      const grandchild = child.child({ name: "grandchild" });
      expect(grandchild).toBeDefined();
      expect(() => grandchild.info("nested message")).not.toThrow();
    });
  });

  describe("default logger", () => {
    it("should export default logger instance", () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeTypeOf("function");
    });

    it("should use default logger without errors", () => {
      expect(() => {
        logger.debug("default debug");
        logger.info("default info");
        logger.warn("default warn");
        logger.error("default error");
      }).not.toThrow();
    });
  });

  describe("log levels", () => {
    const levels = ["debug", "info", "warn", "error", "fatal"] as const;

    levels.forEach((level) => {
      it(`should support ${level} level`, () => {
        const log = createLogger({ level });
        expect(() => log[level](`${level} message`)).not.toThrow();
      });
    });
  });
});
