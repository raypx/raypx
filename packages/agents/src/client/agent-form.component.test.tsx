import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { AgentForm } from "./agent-form.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
it.each(["en", "zh"] as const)(
  "preserves the shared-memory setting and allows an explicit change in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    const onSave = vi.fn(async () => {});
    const initial = {
      name: "Agent",
      instructions: "",
      model: { modelId: "model" },
      allowSharedMemory: true,
    };
    const mount = render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <AgentForm
          initial={initial}
          models={[{ modelId: "model", name: "Model", source: "deployment" }]}
          onSave={onSave}
          onClose={() => {}}
        />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByRole("checkbox", { name: strings.allowSharedMemory })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: strings.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalledExactlyOnceWith(initial));
    mount.unmount();
    const disabledSave = vi.fn(async () => {});
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <AgentForm
          initial={initial}
          models={[{ modelId: "model", name: "Model", source: "deployment" }]}
          onSave={disabledSave}
          onClose={() => {}}
        />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: strings.allowSharedMemory }));
    fireEvent.click(screen.getByRole("button", { name: strings.save }));
    await waitFor(() =>
      expect(disabledSave).toHaveBeenCalledExactlyOnceWith({
        ...initial,
        allowSharedMemory: false,
      }),
    );
  },
);
