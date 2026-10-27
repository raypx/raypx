import { expect, it } from "vite-plus/test";
import { shouldInstallWindowsSmoke } from "../../native/smoke/launch";

const hosted = {
  GITHUB_ACTIONS: "true",
  RUNNER_OS: "Windows",
  RUNNER_ENVIRONMENT: "github-hosted",
};

it("requires NSIS installation on the actual GitHub-hosted Windows matrix runner", () => {
  expect(shouldInstallWindowsSmoke("win32", hosted)).toBe(true);
});

it.each([
  {},
  { CI: "true" },
  { ...hosted, GITHUB_ACTIONS: undefined },
  { ...hosted, RUNNER_OS: "macOS" },
  { ...hosted, RUNNER_ENVIRONMENT: undefined },
  { ...hosted, RUNNER_ENVIRONMENT: "self-hosted" },
])(
  "keeps local and self-hosted Windows smoke available without installing into the user registry",
  (env) => {
    expect(shouldInstallWindowsSmoke("win32", env)).toBe(false);
  },
);

it("does not change the macOS packaged-app launch path", () => {
  expect(shouldInstallWindowsSmoke("darwin", hosted)).toBe(false);
});
