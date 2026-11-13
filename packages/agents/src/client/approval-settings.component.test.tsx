import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import {
  computerToolNameSchema,
  mcpToolNameSchema,
  type ApprovalRule,
} from "@raypx/core/approvals";
import {
  ApprovalSettingsController,
  type ApprovalSettingsPort,
} from "../model/approval-settings.js";
import { ApprovalSettingsEditor } from "./approval-settings.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const availableModes = [
  { mode: "ask", available: true, reasonCode: null },
  { mode: "never", available: true, reasonCode: null },
  { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
] satisfies import("@raypx/core/approvals").ApprovalSettingsState["availableModes"];

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
beforeEach(() => {
  localStorage.clear();
});

async function mount(language: "en" | "zh" = "en", rules: ApprovalRule[] = []) {
  const settings = vi.fn<ApprovalSettingsPort["settings"]>(async () => ({
    mode: "ask",
    rules,
    revision: 0,
    availableModes,
  }));
  const updateSettings = vi.fn<ApprovalSettingsPort["updateSettings"]>(
    async ({ expectedRevision, ...saved }) => ({
      ...saved,
      revision: expectedRevision + 1,
      availableModes,
    }),
  );
  const controller = new ApprovalSettingsController({ settings, updateSettings });
  await controller.load();
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <ApprovalSettingsEditor controller={controller} />
    </BrowserLanguageProvider>,
  );
  return { controller, settings, updateSettings };
}

it.each(["en", "zh"] as const)(
  "preserves exact remote rules as read-only rows with removal in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    const rule: ApprovalRule = {
      toolName: mcpToolNameSchema.parse("mcp_server__read_page"),
      executable: null,
      decision: "block",
    };
    const { controller, updateSettings } = await mount(language, [rule]);
    const label = "MCP server / read page";
    expect(screen.getByText(label)).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: strings.approvalSettings.tool }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: strings.approvalSettings.addRule }));
    expect(controller.getSnapshot().draft?.rules).toEqual([
      rule,
      { toolName: "computer_write_file", executable: null, decision: "allow" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: strings.save }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        mode: "ask",
        rules: [rule, { toolName: "computer_write_file", executable: null, decision: "allow" }],
        expectedRevision: 0,
      }),
    );
    const select = screen.getByRole("combobox", { name: strings.approvalSettings.tool });
    fireEvent.click(select);
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(computerToolNameSchema.options.length);
    expect(options.some((option) => option.textContent?.includes(label))).toBe(false);
    fireEvent.keyDown(select, { key: "Escape" });
    const remove = screen.getByRole("button", {
      name: strings.approvalSettings.removeRule
        .replace("{tool}", label)
        .replace("{executable}", "")
        .trim(),
    });
    fireEvent.click(remove);
    expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(controller.getSnapshot().draft?.rules).toEqual([
      { toolName: "computer_write_file", executable: null, decision: "allow" },
    ]);
  },
);

it.each(["en", "zh"] as const)(
  "shows translated modes and bounded editable rules in %s",
  async (language) => {
    const { updateSettings } = await mount(language);
    const english = language === "en";
    expect(
      screen.getByRole("radio", { name: english ? "Ask before changes" : "更改前询问" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: english ? "Auto" : "自动" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: english ? "Add rule" : "添加规则" }));
    expect(
      screen.getByRole("button", { name: english ? "Remove Write a file" : "移除写入文件" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: english ? "Save" : "保存" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        mode: "ask",
        rules: [{ toolName: "computer_write_file", executable: null, decision: "allow" }],
        expectedRevision: 0,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      english ? "Approval settings saved." : "审批设置已保存。",
    );
  },
);

it("confirms Never ask with Cancel focused and preserves selection after cancelling", async () => {
  const { updateSettings } = await mount();
  fireEvent.click(screen.getByRole("radio", { name: "Never ask" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByRole("alertdialog", { name: "Never ask before changes?" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  expect(updateSettings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
  expect(screen.getByRole("radio", { name: "Never ask" })).toHaveAttribute("aria-checked", "true");
});

it("keeps local input on conflict and reloads only after explicit discard", async () => {
  const { settings, updateSettings } = await mount();
  fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
  settings.mockResolvedValue({ mode: "never", rules: [], revision: 1, availableModes });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const reload = await screen.findByRole("button", { name: "Discard changes and reload" });
  expect(screen.getByRole("button", { name: "Remove Write a file" })).toBeInTheDocument();
  expect(updateSettings).not.toHaveBeenCalled();
  expect(screen.getByText("Mode: Ask before changes → Never ask")).toBeVisible();
  expect(screen.getByRole("button", { name: "Reapply my changes" })).toBeEnabled();
  fireEvent.click(reload);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Remove Write a file" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("radio", { name: "Never ask" })).toHaveAttribute("aria-checked", "true");
});

it.each(["en", "zh"] as const)(
  "shows server rule changes and reapplies in %s",
  async (language) => {
    const { settings, updateSettings } = await mount(language);
    const english = language === "en";
    fireEvent.click(screen.getByRole("button", { name: english ? "Add rule" : "添加规则" }));
    const rules = [
      { toolName: "computer_read_file", executable: null, decision: "block" },
    ] as const;
    settings.mockResolvedValue({ mode: "ask", rules: [...rules], revision: 2, availableModes });
    fireEvent.click(screen.getByRole("button", { name: english ? "Save" : "保存" }));
    expect(
      await screen.findByText(
        english ? "Added to Block list: Read a file" : "已添加到阻止列表：读取文件",
      ),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: english ? "Reapply my changes" : "重新应用我的更改" }),
    );
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        mode: "ask",
        rules: [{ toolName: "computer_write_file", executable: null, decision: "allow" }],
        expectedRevision: 2,
      }),
    );
  },
);
