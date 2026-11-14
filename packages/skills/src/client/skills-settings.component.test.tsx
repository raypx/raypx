import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { skillSchema } from "@raypx/core/skills";
import { spaceIdSchema } from "@raypx/core/spaces";
import { SkillsController, type SkillsPort } from "../model/skills.js";
import { SkillsSettingsEditor } from "./skills-settings.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const spaceId = spaceIdSchema.parse("space-one");
const spaces = [
  { id: spaceId, name: "First Space" },
  { id: spaceIdSchema.parse("space-two"), name: "Second Space" },
];
const skill = skillSchema.parse({
  id: "skill-one",
  name: "Research",
  description: "Compare sources",
  body: "# Research",
  ownership: "account",
  spaceId: null,
  agentId: null,
  availability: { mode: "all" },
  createdAt: "2026-11-14T00:00:00Z",
  updatedAt: "2026-11-14T00:00:00Z",
});
beforeEach(() => localStorage.clear());
async function mount(language: "en" | "zh" = "en", allSpaces = spaces) {
  const port: SkillsPort = {
    list: vi.fn(async () => [
      skill,
      { ...skill, id: "agent-skill", name: "Space research", ownership: "space" as const, spaceId },
    ]),
    get: vi.fn(async () => skill),
    create: vi.fn(async ({ skill: content, availability }) => ({
      ...skill,
      id: "new-skill",
      ...content,
      availability,
    })),
    update: vi.fn(async ({ skill: content }) => ({ ...skill, ...content })),
    delete: vi.fn(async () => ({ deleted: true as const })),
    setAvailability: vi.fn(async ({ availability }) => ({ ...skill, availability })),
    import: vi.fn(async () => ({
      skill,
      omitted: [{ name: "scripts/collect.sh", reason: "EXECUTABLE_OR_UNSUPPORTED" as const }],
    })),
  };
  const controller = new SkillsController(port, spaceId);
  await controller.load();
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <SkillsSettingsEditor controller={controller} spaces={allSpaces} />
    </BrowserLanguageProvider>,
  );
  return { port, controller };
}
it.each(["en", "zh"] as const)(
  "lists skills, availability and Agent provenance in %s",
  async (language) => {
    await mount(language);
    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getAllByText("Compare sources", { exact: true })[0]).toBeInTheDocument();
    expect(
      screen.getByText(
        language === "en"
          ? "Available in: Created by an Agent · this Space"
          : "可用于: 由 Agent 创建 · 当前 Space",
      ),
    ).toBeInTheDocument();
  },
);
it("edits with Markdown preview, saves selected availability, closes on Escape and returns focus", async () => {
  const user = userEvent.setup();
  const { port } = await mount();
  const opener = screen.getByRole("button", { name: "Edit Research" });
  await user.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Edit skill" });
  await waitFor(() => expect(within(dialog).getByLabelText("Name")).toHaveFocus());
  const body = within(dialog).getByLabelText("Markdown source");
  await user.click(body);
  await user.clear(body);
  await user.type(body, "# Updated research");
  expect(within(dialog).getByRole("heading", { name: "Updated research" })).toBeInTheDocument();
  await user.click(within(dialog).getByRole("radio", { name: "Chosen Spaces" }));
  await user.click(within(dialog).getByRole("checkbox", { name: "Second Space" }));
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(port.update).toHaveBeenCalledWith(
      expect.objectContaining({ skill: expect.objectContaining({ body: "# Updated research" }) }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(port.setAvailability).toHaveBeenCalledWith({
    spaceId,
    id: skill.id,
    availability: { mode: "selected", spaceIds: [spaces[1]!.id] },
  });
  await user.click(opener);
  await screen.findByRole("dialog", { name: "Edit skill" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});
it("hides availability with one Space and confirms deletion", async () => {
  const user = userEvent.setup();
  const { port } = await mount("en", spaces.slice(0, 1));
  await user.click(screen.getByRole("button", { name: "Edit Research" }));
  await screen.findByRole("dialog", { name: "Edit skill" });
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Delete Research" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Delete Research?" });
  expect(port.delete).not.toHaveBeenCalled();
  await user.click(within(confirm).getByRole("button", { name: "Delete skill" }));
  await waitFor(() => expect(port.delete).toHaveBeenCalledWith({ spaceId, id: skill.id }));
});
it("shows the installed name and every omitted executable part from the import report", async () => {
  const { controller } = await mount();
  const bytes = new TextEncoder().encode(
    "---\nname: Research\ndescription: Compare sources\n---\n# Research",
  );
  await controller.importFile({
    name: "SKILL.md",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  });
  const dialog = await screen.findByRole("dialog", { name: "Package imported" });
  expect(within(dialog).getByText("Installed: Research")).toBeInTheDocument();
  expect(within(dialog).getByText("scripts/collect.sh")).toBeInTheDocument();
  fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" })[1]!);
  await waitFor(() => expect(controller.getSnapshot().report).toBeNull());
});
