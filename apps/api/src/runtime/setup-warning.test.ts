import { expect, it, vi } from "vitest";
import { createSetupWarning } from "./setup-warning.js";

it("warns once that the first visitor can claim an unprotected production deployment", async () => {
  const warn = vi.fn();
  const start = createSetupWarning(
    { NODE_ENV: "production" },
    { status: async () => ({ bootstrap: true }) },
    warn,
  );
  await start();
  await start();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain(
    "first visitor to sign up becomes deployment administrator",
  );
});
it("does not warn or expose a setup token after bootstrap, with protection, or outside production", async () => {
  const warn = vi.fn();
  for (const environment of [
    { NODE_ENV: "test" },
    { NODE_ENV: "production", SETUP_TOKEN: "fixture-token-that-must-never-be-logged" },
  ]) {
    const status = vi.fn(async () => ({ bootstrap: true }));
    await createSetupWarning(environment, { status }, warn)();
    expect(status).not.toHaveBeenCalled();
  }
  await createSetupWarning(
    { NODE_ENV: "production" },
    { status: async () => ({ bootstrap: false }) },
    warn,
  )();
  expect(warn).not.toHaveBeenCalled();
});
