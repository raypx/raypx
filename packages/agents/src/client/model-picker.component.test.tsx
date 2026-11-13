import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { ModelPicker } from "./model-picker.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
beforeEach(() => localStorage.clear());
it.each(["en", "zh"] as const)(
  "groups member and server choices with offered labels in %s",
  async (language) => {
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <label htmlFor="model">Model</label>
        <ModelPicker
          id="model"
          models={[
            { modelId: "opaque", name: "Personal / model-one", source: "connection" },
            { modelId: "server", name: "Server model", source: "deployment" },
          ]}
          value="opaque"
          disabled={false}
          onValueChange={vi.fn()}
        />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent(
      "Personal / model-one",
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Model" }));
    expect(
      await screen.findByText(language === "en" ? "Your connections" : "你的连接"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(language === "en" ? "Server models" : "服务器模型"),
    ).toBeInTheDocument();
  },
);
it("links the empty catalog to model settings without inventing a choice", () => {
  const open = vi.fn();
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ModelPicker
        id="model"
        models={[]}
        value=""
        disabled={false}
        onValueChange={vi.fn()}
        onOpenModels={open}
      />
    </BrowserLanguageProvider>,
  );
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Manage model connections" }));
  expect(open).toHaveBeenCalledOnce();
});
