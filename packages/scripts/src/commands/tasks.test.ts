import { describe, expect, it } from "vite-plus/test";
import { cachePlatform, taskInvocation } from "./tasks.js";

const credentials = {
  TURBO_TOKEN: "test-token",
  TURBO_TEAM: "test-team",
  TURBO_REMOTE_CACHE_SIGNATURE_KEY: "test-signature",
};
describe("task cache trust", () => {
  it("uses only local cache without a complete signed remote configuration", () => {
    const invocation = taskInvocation(
      ["build"],
      { TURBO_TOKEN: "partial" },
      "linux:x64:bun-1.4.0:revision:glibc-2.41",
    );
    expect(invocation.command).toContain("--cache=local:rw");
    expect(invocation.env.TURBO_TOKEN).toBeUndefined();
    expect(invocation.env.RPX_CACHE_PLATFORM).toBe("linux:x64:bun-1.4.0:revision:glibc-2.41");
    expect(invocation.command.slice(0, 3)).toEqual(["bun", "--bun", "turbo"]);
  });
  it("strips inherited remote credentials from an untrusted CI run", () => {
    const invocation = taskInvocation(["test:unit"], { ...credentials, CI: "true" }, "linux:x64");
    expect(invocation.command).toContain("--cache=local:rw");
    for (const key of Object.keys(credentials)) expect(invocation.env[key]).toBeUndefined();
  });
  it("enables signed remote caching for an explicitly trusted CI run", () => {
    const invocation = taskInvocation(
      ["build"],
      { ...credentials, CI: "true", RPX_REMOTE_CACHE_TRUSTED: "true" },
      "linux:arm64",
    );
    expect(invocation.command).toContain("--cache=local:rw,remote:rw");
    expect(invocation.env.TURBO_TOKEN).toBe(credentials.TURBO_TOKEN);
  });
  it("keeps orchestration policy before forwarded leaf arguments", () => {
    const invocation = taskInvocation(
      ["e2e", "--filter", "@raypx/e2e", "--", "--workers=2"],
      { ...credentials, CI: "true", RPX_REMOTE_CACHE_TRUSTED: "true" },
      "linux:x64",
    );
    const separator = invocation.command.indexOf("--");
    expect(invocation.command.slice(separator + 1)).toEqual(["--workers=2"]);
    expect(invocation.command.slice(0, separator)).toContain("--env-mode=strict");
    expect(invocation.command.slice(0, separator)).toContain("--cache=local:rw,remote:rw");
  });

  it("forwards an unscoped application filter unchanged", () => {
    const invocation = taskInvocation(["build", "--filter", "desktop"], {}, "darwin:arm64");
    expect(invocation.command.slice(-3)).toEqual(["build", "--filter", "desktop"]);
  });
  it("rejects flags that could bypass strict environment or cache policy", () => {
    expect(() => taskInvocation(["build", "--cache=remote:rw"], {}, "darwin")).toThrow("policy");
    expect(() => taskInvocation(["build", "--env-mode=loose"], {}, "darwin")).toThrow("policy");
  });
  it("fingerprints the actual Bun executor rather than its compatibility process.version", () => {
    const fingerprint = cachePlatform();
    expect(fingerprint).toContain(
      `${process.platform}:${process.arch}:bun-${process.versions.bun}:`,
    );
    expect(fingerprint).not.toContain(`:${process.version}:`);
  });
});
