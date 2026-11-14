import { afterEach, expect, it, vi } from "vitest";
import { ApprovalSettingsController, type ApprovalSettingsPort } from "@raypx/agents/model";
import { act, findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { useLocales } from "../../tests/mocks/localization.js";
import en from "@raypx/agents/messages/en";
import zh from "@raypx/agents/messages/zh";
import { ApprovalModeSettings } from "./approval-settings.js";

afterEach(() => useLocales.mockReset());
it.each(["en", "zh"] as const)(
  "saves available Auto while preserving exact rules in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const strings = { en, zh }[language].agents;
    const availableModes = (["ask", "never", "auto"] as const).map((mode) => ({
      mode,
      available: true as const,
      reasonCode: null,
    }));
    const rules = [
      { toolName: "computer_run_command" as const, executable: "echo", decision: "block" as const },
    ];
    const settings = vi.fn<ApprovalSettingsPort["settings"]>(async () => ({
      mode: "ask",
      rules,
      revision: 4,
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
    const view = await renderNative(<ApprovalModeSettings controller={controller} />);
    const auto = findByLabel(view.root, strings.approvalSettings.auto);
    expect(auto.props.disabled).toBe(false);
    await press(auto);
    expect(controller.getSnapshot().draft?.mode).toBe("auto");
    await press(findByLabel(view.root, strings.save));
    expect(updateSettings).toHaveBeenCalledWith({ mode: "auto", rules, expectedRevision: 4 });
    expect(textContent(view.root)).toContain(strings.approvalSettings.saved);
    await view.unmount();
    controller.dispose();
  },
);
it("disables unavailable Auto and shows its server reason", async () => {
  const availableModes = [
    { mode: "ask", available: true, reasonCode: null },
    { mode: "never", available: true, reasonCode: null },
    { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
  ] as const;
  const port: ApprovalSettingsPort = {
    settings: async () => ({
      mode: "ask",
      rules: [],
      revision: 0,
      availableModes: [...availableModes],
    }),
    updateSettings: vi.fn(),
  };
  const controller = new ApprovalSettingsController(port);
  await controller.load();
  const view = await renderNative(<ApprovalModeSettings controller={controller} />);
  const auto = findByLabel(view.root, "Auto");
  expect(auto.props.disabled).toBe(true);
  await press(auto);
  expect(controller.getSnapshot().draft?.mode).toBe("ask");
  expect(textContent(view.root)).toContain(
    en.agents.approvalSettings.reasons.REVIEW_MODEL_NOT_CONFIGURED,
  );
  await act(async () => controller.dispose());
  await view.unmount();
});
