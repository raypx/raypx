/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@voidmix/i18n/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { messages } from "../../../tests/fixtures/messages";
import { LanguageSwitcher } from "../language-switcher";

afterEach(() => cleanup());

function renderLanguageSwitcher() {
  const write = vi.fn();
  render(
    <I18nProvider locale="en" messages={messages} storage={{ read: () => "en", write }}>
      <LanguageSwitcher />
    </I18nProvider>,
  );
  return { user: userEvent.setup(), write };
}

describe("language switcher", () => {
  it("keeps the menu out of the initial render and loads it on open", async () => {
    const { user } = renderLanguageSwitcher();
    const trigger = screen.getByRole("button", { name: "Language: English" });

    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).not.toHaveTextContent("English");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(await screen.findByRole("menu", {}, { timeout: 5000 })).toBeVisible();
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "English",
      "简体中文",
    ]);
  });

  it("switches locale from the lazy menu", async () => {
    const { user, write } = renderLanguageSwitcher();

    await user.click(screen.getByRole("button", { name: "Language: English" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "简体中文" }, { timeout: 5000 }),
    );

    const trigger = screen.getByRole("button", { name: "语言: 简体中文" });
    expect(trigger).toBeVisible();
    expect(trigger).not.toHaveTextContent("简体中文");
    expect(write).toHaveBeenCalledWith("zh");
  });
});
