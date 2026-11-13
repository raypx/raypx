import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import type { SpaceComputer } from "@raypx/core/computers";
import { CapabilitySheet } from "./capability-sheet.js";
import { ComputerController, type ComputerFilesPort, type ComputerPort } from "../model.js";
import { ComputerPanel } from "./computer.js";
import {
  computerEvent,
  computerRecord,
  computerResult,
  computerSpaceId,
  deferred,
} from "../../tests/support/computer-fixture.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const controllers: ComputerController[] = [];

function fixture(initial: SpaceComputer = computerResult(), files?: ComputerFilesPort) {
  const port: ComputerPort = {
    get: vi.fn(async () => initial),
    start: vi.fn(async () => computerResult("running")),
    stop: vi.fn(async () => computerResult("stopped")),
    ...files,
  };
  const controller = new ComputerController(computerSpaceId, port);
  controllers.push(controller);
  const onClose = vi.fn();
  function mount(language: "en" | "zh" = "en", sheet = false) {
    const panel = <ComputerPanel controller={controller} onClose={onClose} sheet={sheet} />;
    return render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        {sheet ? (
          <CapabilitySheet
            open
            title={{ en, zh }[language].agents.computerTitle}
            closeLabel={{ en, zh }[language].agents.computerClose}
            onClose={onClose}
            finalFocus={false}
          >
            {panel}
          </CapabilitySheet>
        ) : (
          panel
        )}
      </BrowserLanguageProvider>,
    );
  }
  return { controller, port, onClose, mount };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

const cases = [
  { result: computerResult("stopped"), status: "computerStopped", action: "computerStart" },
  { result: computerResult("destroyed"), status: "computerStopped", action: "computerStart" },
  { result: computerResult("starting"), status: "computerStarting", action: "computerStart" },
  { result: computerResult("running"), status: "computerRunning", action: "computerStop" },
  { result: computerResult("stopping"), status: "computerStopping", action: "computerStop" },
  { result: computerResult("failed"), status: "computerFailed", action: "computerRetry" },
  { result: { status: "not-configured" }, status: "computerNotConfigured", action: null },
] satisfies {
  result: SpaceComputer;
  status: keyof typeof en.agents;
  action: keyof typeof en.agents | null;
}[];

it.each(["en", "zh"] as const)(
  "shows truthful states with only the available lifecycle action in %s",
  async (language) => {
    const messages = { en, zh }[language].agents;
    for (const item of cases) {
      const test = fixture(item.result);
      await test.controller.refresh();
      const view = test.mount(language);
      const title = screen.getByRole("heading", { name: messages.computerTitle });
      expect(title).toHaveFocus();
      const status = screen.getByRole("region", { name: messages.computerStatus });
      expect(within(status).getByRole("status")).toHaveTextContent(messages[item.status]);
      const actions = within(status).queryAllByRole("button");
      expect(
        actions.map((action) => ({
          label: action.textContent,
          disabled: action.hasAttribute("disabled"),
        })),
      ).toEqual(
        item.action
          ? [
              {
                label: messages[item.action],
                disabled: item.status === "computerStarting" || item.status === "computerStopping",
              },
            ]
          : [],
      );
      const close = screen.getByRole("button", { name: messages.computerClose });
      fireEvent.click(close);
      expect(test.onClose).toHaveBeenCalledOnce();
      view.unmount();
    }
  },
);

it("shows loading without lifecycle controls and gives a narrow sheet an accessible title", () => {
  const test = fixture();
  test.mount("zh", true);
  const dialog = screen.getByRole("dialog", { name: "团队电脑" });
  expect(within(dialog).getByRole("status")).toHaveTextContent("正在加载…");
  expect(within(dialog).getAllByRole("button")).toHaveLength(1);
  expect(within(dialog).getByRole("button", { name: "关闭电脑面板" })).toBeInTheDocument();
});

it.each([false, true])(
  "bounds the padded scroll container and Files region with sheet=%s",
  async (sheet) => {
    const test = fixture(computerResult("running"), {
      listDirectory: async () => ({ status: "available", entries: [], truncated: false }),
      readFile: vi.fn(),
    });
    await test.controller.refresh();
    test.mount("en", sheet);
    const files = screen.getByRole("region", { name: "Files" });
    await within(files).findByRole("tree", { name: "Workspace" });
    const scroll = files.parentElement!;
    expect(scroll).toHaveClass(
      "box-border",
      "w-full",
      "min-w-0",
      "max-w-full",
      "overflow-x-hidden",
      "overflow-y-auto",
      "p-4",
    );
    expect(scroll).not.toHaveClass("overflow-x-clip");
    expect(files).toHaveClass("w-full", "min-w-0", "max-w-full");
    expect(Boolean(scroll.closest('[data-slot="sheet-content"]'))).toBe(sheet);
  },
);

it("disables start through the request and applies its live return state", async () => {
  const test = fixture();
  await test.controller.refresh();
  const result = deferred<SpaceComputer>();
  vi.mocked(test.port.start).mockReturnValueOnce(result.promise);
  test.mount();
  const start = screen.getByRole("button", { name: "Start computer" });
  fireEvent.click(start);
  fireEvent.click(start);
  expect(start).toBeDisabled();
  expect(test.port.start).toHaveBeenCalledTimes(1);
  await act(async () => result.resolve(computerResult("running")));
  expect(screen.getByRole("button", { name: "Stop computer" })).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent("Running");
});

it.each(["en", "zh"] as const)(
  "confirms shared stop, focuses Cancel, and prevents duplicate commands in %s",
  async (language) => {
    const messages = { en, zh }[language].agents;
    const test = fixture(computerResult("running"));
    await test.controller.refresh();
    test.mount(language);
    const stop = screen.getByRole("button", { name: messages.computerStop });
    fireEvent.click(stop);
    fireEvent.click(stop);
    const dialog = await screen.findByRole("alertdialog", { name: messages.computerStopTitle });
    expect(dialog).toHaveTextContent(messages.computerStopDescription);
    const cancel = within(dialog).getByRole("button", { name: messages.cancel });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(test.port.stop).not.toHaveBeenCalled();
    expect(stop).toBeDisabled();
    fireEvent.click(cancel);
    await waitFor(() => expect(stop).toBeEnabled());
    expect(test.port.stop).not.toHaveBeenCalled();
    const result = deferred<SpaceComputer>();
    vi.mocked(test.port.stop).mockReturnValueOnce(result.promise);
    fireEvent.click(stop);
    const second = await screen.findByRole("alertdialog", { name: messages.computerStopTitle });
    fireEvent.click(within(second).getByRole("button", { name: messages.computerStop }));
    await waitFor(() => expect(test.port.stop).toHaveBeenCalledTimes(1));
    expect(stop).toBeDisabled();
    await act(async () => result.resolve(computerResult("stopped")));
    expect(screen.getByRole("button", { name: messages.computerStart })).toBeEnabled();
  },
);

it.each(["en", "zh"] as const)(
  "shows failed start reasons and an explicit retry in %s",
  async (language) => {
    const messages = { en, zh }[language].agents;
    const test = fixture({
      status: "available",
      computer: { ...computerRecord("failed"), failureCode: "RESTORE_FAILED" },
    });
    await test.controller.refresh();
    test.mount(language);
    expect(screen.getByRole("status")).toHaveTextContent(messages.computerRestoreFailed);
    fireEvent.click(screen.getByRole("button", { name: messages.computerRetry }));
    await screen.findByRole("button", { name: messages.computerStop });
    expect(test.port.start).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).not.toHaveTextContent(messages.computerRestoreFailed);
  },
);

it("renders a live transition without stale controls, then refreshes failed-state details", async () => {
  const test = fixture(computerResult("running"));
  await test.controller.refresh();
  test.mount();
  const read = deferred<SpaceComputer>();
  vi.mocked(test.port.get).mockReturnValueOnce(read.promise);
  act(() => test.controller.applyEvent(computerEvent("stopping")));
  expect(screen.getByRole("status")).toHaveTextContent("Stopping…");
  expect(screen.getByRole("button", { name: "Stop computer" })).toBeDisabled();
  await act(async () => read.resolve(computerResult("stopped")));
  expect(screen.getByRole("button", { name: "Start computer" })).toBeEnabled();
  vi.mocked(test.port.get).mockResolvedValueOnce(computerResult("failed"));
  await act(async () => test.controller.applyEvent(computerEvent("failed", 2)));
  expect(screen.getByRole("status")).toHaveTextContent("The computer provider is unavailable.");
  expect(screen.getByRole("button", { name: "Retry start" })).toBeEnabled();
});

it("keeps read failures explicit with a named refresh and never renders provider diagnostics", async () => {
  const test = fixture();
  vi.mocked(test.port.get).mockRejectedValueOnce(new Error("private credential"));
  await test.controller.refresh();
  test.mount();
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load the computer. Try again.");
  expect(screen.queryByText("private credential")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("button", { name: "Start computer" });
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
