import { describe, expect, it } from "vite-plus/test";

import { createLoggerConfig, logger } from "./index.js";

describe("logger", () => {
  it("creates structured logger config with sensitive field redaction", () => {
    const config = createLoggerConfig({
      service: "logger-test",
      environment: "test",
      pretty: false,
    });

    expect(config.service).toBe("logger-test");
    expect(config.environment).toBe("test");
    expect(config.redact).toMatchObject({
      paths: expect.arrayContaining([
        "authorization",
        "cookie",
        "set-cookie",
        "password",
        "passwordHash",
        "secret",
        "token",
        "accessToken",
        "refreshToken",
        "sessionToken",
        "apiKey",
        "**.authorization",
        "**.cookie",
        "**.set-cookie",
        "**.password",
        "**.passwordHash",
        "**.secret",
        "**.token",
        "**.accessToken",
        "**.refreshToken",
        "**.sessionToken",
        "**.apiKey",
        "prompt",
        "fileContent",
        "signedUrl",
        "downloadUrl",
        "uploadUrl",
        "**.prompt",
        "**.fileContent",
        "**.signedUrl",
        "**.downloadUrl",
        "**.uploadUrl",
      ]),
    });
  });

  it("creates a scoped logger for one operation", () => {
    const operationLogger = logger({ operation: "logger.test" });

    expect(operationLogger.getContext()).toMatchObject({ operation: "logger.test" });
  });

  it("uses explicitly supplied runtime environment values", () => {
    const config = createLoggerConfig({
      service: "logger-runtime-test",
      runtimeEnv: {
        NODE_ENV: "production",
        LOG_LEVEL: "error",
        LOG_PRETTY: "false",
      },
    });

    expect(config.environment).toBe("production");
    expect(config.minLevel).toBe("error");
    expect(config.pretty).toBe(false);
  });
});
