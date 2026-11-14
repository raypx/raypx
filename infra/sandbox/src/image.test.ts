import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
it("declares digest inputs globally before FROM and keeps the computer runtime pinned to the repository", async () => {
  const image = await readFile(new URL("../Computer.Dockerfile", import.meta.url), "utf8");
  const manifest = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { packageManager: string };
  const version = manifest.packageManager.split("@")[1];
  const globals = image.slice(0, image.indexOf("FROM "));
  expect(globals).toContain("ARG BUN_IMAGE_DIGEST");
  expect(globals).toContain("ARG COMPUTER_BASE_DIGEST");
  expect(image).toContain(`FROM oven/bun:${version}@sha256:`);
  expect(image).toContain("FROM python:3.13-slim-bookworm@sha256:");
  expect(image).toContain("USER 1000:1000");
  expect(image).toContain(
    "FROM runtime AS default\nARG RAYPX_VALIDATION_ID\nLABEL raypx.validation=$RAYPX_VALIDATION_ID",
  );
  expect(image).toContain("FROM runtime AS graphical");
  expect(image.slice(0, image.indexOf("FROM runtime AS graphical"))).not.toContain("xvfb");
});
