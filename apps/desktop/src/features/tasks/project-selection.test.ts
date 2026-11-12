import { expect, it } from "vitest";
import { desktopFixture } from "../../../tests/helpers/desktop.js";
import { selectLocalProject } from "./project-selection.js";

it("restores the newest authorized project and ignores forgotten recent IDs", () => {
  const { device } = desktopFixture();
  device.projects = [
    { id: "first", name: "First", providers: ["codex"], dirty: false },
    { id: "recent", name: "Recent", providers: ["codex"], dirty: false },
  ];
  const selected = selectLocalProject([device], {
    project: null,
    device: null,
    recent: ["forgotten", "recent"],
  });
  expect(selected.project?.id).toBe("recent");
  expect(selected.selectionInvalid).toBe(false);
});

it("never substitutes another directory or device for an explicit invalid target", () => {
  const { device } = desktopFixture();
  device.projects = [{ id: "available", name: "Available", providers: ["codex"], dirty: false }];
  for (const input of [
    { project: "missing", device: null },
    { project: "available", device: "another-device" },
  ]) {
    const selected = selectLocalProject([device], { ...input, recent: ["available"] });
    expect(selected.selectionInvalid).toBe(true);
    expect(selected.project).toBeUndefined();
    expect(selected.projectId).toBe(input.project);
  }
  expect(
    selectLocalProject(undefined, { project: "missing", device: null, recent: [] })
      .selectionInvalid,
  ).toBe(false);
});
