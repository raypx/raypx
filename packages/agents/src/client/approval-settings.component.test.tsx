import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import {
  ApprovalSettingsController,
  type ApprovalSettingsPort,
} from "../model/approval-settings.js";
import { ApprovalSettingsEditor } from "./approval-settings.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
beforeEach(() => {
  localStorage.clear();
});

async function mount(language: "en" | "zh" = "en") {
  const settings = vi.fn<ApprovalSettingsPort["settings"]>(async () => ({
    mode: "ask",
    rules: [],
    revision: 0,
  }));
  const updateSettings = vi.fn<ApprovalSettingsPort["updateSettings"]>(
    async ({ expectedRevision, ...saved }) => ({ ...saved, revision: expectedRevision + 1 }),
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
  "shows translated modes and bounded editable rules in %s",
  async (language) => {
    const { updateSettings } = await mount(language);
    const english = language === "en";
    expect(
      screen.getByRole("radio", { name: english ? "Ask before changes" : "更改前询问" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: english ? "Auto (unavailable)" : "自动（不可用）" }),
    ).toHaveAttribute("aria-disabled", "true");
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
  settings.mockResolvedValue({ mode: "never", rules: [], revision: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const reload = await screen.findByRole("button", { name: "Discard changes and reload" });
  expect(screen.getByRole("button", { name: "Remove Write a file" })).toBeInTheDocument();
  expect(updateSettings).not.toHaveBeenCalled();
  fireEvent.click(reload);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Remove Write a file" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("radio", { name: "Never ask" })).toHaveAttribute("aria-checked", "true");
});
