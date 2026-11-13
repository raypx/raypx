import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import type { ComputerView } from "../model.js";
import { ComputerIndicator } from "./computer.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const statusKeys = {
  loading: "loading",
  "not-configured": "computerNotConfigured",
  stopped: "computerStopped",
  destroyed: "computerStopped",
  starting: "computerStarting",
  running: "computerRunning",
  stopping: "computerStopping",
  failed: "computerFailed",
} as const;
const statuses = Object.keys(statusKeys) as ComputerView["status"][];

it.each(["en", "zh"] as const)(
  "names every computer state and opens the panel in %s",
  (language) => {
    const messages = { en, zh }[language].agents;
    const onOpen = vi.fn();
    for (const status of statuses) {
      const view = render(
        <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
          <ComputerIndicator
            state={{ status, failureCode: null, pending: null, refreshing: false, error: null }}
            open={false}
            onOpen={onOpen}
            panelId="computer-panel"
          />
        </BrowserLanguageProvider>,
      );
      const text = messages[statusKeys[status]];
      const label = messages.computerIndicator.replace("{state}", text);
      const button = screen.getByRole("button", { name: label });
      expect(button).toHaveAttribute("title", label);
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).not.toHaveAttribute("aria-controls");
      expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(button).toHaveTextContent(text);
      fireEvent.click(button);
      view.unmount();
    }
    expect(onOpen).toHaveBeenCalledTimes(statuses.length);
  },
);

it("links an expanded indicator to its panel and exposes load failure as unavailable", () => {
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ComputerIndicator
        state={{
          status: "stopped",
          failureCode: null,
          pending: null,
          refreshing: false,
          error: "load",
        }}
        open
        onOpen={() => {}}
        panelId="computer-panel"
      />
    </BrowserLanguageProvider>,
  );
  const button = screen.getByRole("button", { name: "Computer: Unavailable" });
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(button).toHaveAttribute("aria-controls", "computer-panel");
});
