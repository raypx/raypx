import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { ComputerScreen, computerScreenPoint } from "./computer-screen.js";
import { screenFixture } from "../../tests/support/screen-fixture.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const fixtures: ReturnType<typeof screenFixture>[] = [];
function mount(language: "en" | "zh" = "en") {
  const f = screenFixture();
  fixtures.push(f);
  const rendered = render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <ComputerScreen controller={f.controller} status="running" />
    </BrowserLanguageProvider>,
  );
  return { ...f, ...rendered };
}
afterEach(() => {
  for (const f of fixtures) f.controller.dispose();
  fixtures.length = 0;
});
it.each(["en", "zh"] as const)("renders graphical availability reasons in %s", async (language) => {
  const f = mount(language);
  await waitFor(() => expect(f.sockets.connect).toHaveBeenCalled());
  for (const reason of [
    "GRAPHICAL_IMAGE_NOT_CONFIGURED",
    "GRAPHICAL_RUNTIME_UNAVAILABLE",
  ] as const) {
    vi.mocked(f.port.screenAvailability).mockResolvedValueOnce({
      status: "unavailable",
      code: "SCREEN_UNAVAILABLE",
      reason,
    });
    await act(() => f.controller.refresh());
    expect(await screen.findByText({ en, zh }[language].agents.screen[reason])).toBeVisible();
    expect(f.container).not.toHaveTextContent(reason);
  }
});
it("maps pointer coordinates to contained pixels rather than letterboxing", () => {
  expect(
    computerScreenPoint({ left: 0, top: 0, width: 400, height: 200 }, 100, 100, 200, 100),
  ).toEqual({ x: 50, y: 50, inside: true });
  expect(
    computerScreenPoint({ left: 0, top: 0, width: 400, height: 200 }, 100, 100, 10, 100),
  ).toEqual({ x: 0, y: 50, inside: false });
  expect(computerScreenPoint({ left: 0, top: 0, width: 0, height: 0 }, 100, 100, 0, 0)).toBeNull();
});
it("focuses input after takeover, sends text and Escape releases without dismissing the panel", async () => {
  const f = mount();
  await waitFor(() => expect(f.sockets.connect).toHaveBeenCalled());
  act(() => {
    f.ready();
    f.emit({ kind: "frame", frame: f.frame });
  });
  fireEvent.click(screen.getByRole("button", { name: "Take control" }));
  const input = await screen.findByRole("textbox", { name: "Computer screen input" });
  expect(input).toHaveFocus();
  expect(screen.getByText("Agent input paused")).toBeVisible();
  fireEvent.keyDown(input, { key: "a" });
  await waitFor(() =>
    expect(f.port.screenInput).toHaveBeenCalledWith(
      expect.objectContaining({ input: { kind: "text", text: "a" } }),
    ),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Text to type into the computer" }), {
    target: { value: "你好" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Type" }));
  await waitFor(() =>
    expect(f.port.screenInput).toHaveBeenCalledWith(
      expect.objectContaining({ input: { kind: "text", text: "你好" } }),
    ),
  );
  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() => expect(f.port.releaseControl).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByRole("button", { name: "Take control" })).toHaveFocus());
  expect(screen.getByRole("region", { name: "Screen" })).toBeVisible();
});
it("shows another member and owner release in Chinese, with view-only keyboard", async () => {
  const f = mount("zh");
  await waitFor(() => expect(f.sockets.connect).toHaveBeenCalled());
  act(() => {
    f.ready();
    f.emit({ kind: "frame", frame: f.frame });
    f.emit({
      kind: "state",
      state: {
        status: "available",
        running: true,
        width: 640,
        height: 480,
        control: {
          id: f.grantId,
          accountId: "other",
          displayName: "小林",
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        },
        agentInputPaused: true,
        canForceRelease: true,
      },
    });
  });
  expect(screen.getByText("由 小林 控制")).toBeVisible();
  expect(screen.getByRole("button", { name: "接管控制" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "电脑屏幕查看" }), { key: "x" });
  expect(f.port.screenInput).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "释放成员控制权" }));
  await waitFor(() => expect(f.port.forceReleaseControl).toHaveBeenCalledOnce());
});
it("drops private pixels when the surface unmounts and reports the precise access ending", async () => {
  const f = mount();
  await waitFor(() => expect(f.sockets.connect).toHaveBeenCalled());
  act(() => {
    f.ready();
    f.emit({ kind: "frame", frame: f.frame });
    f.close();
  });
  expect(screen.queryByRole("img", { name: "Computer screen" })).toBeNull();
  expect(screen.getByText("Your Space membership was removed.")).toBeVisible();
  f.unmount();
  expect(f.controller.getSnapshot().state).toBeNull();
});

it("expands the same controlled session, preserves text and releases before Escape closes", async () => {
  const f = mount();
  const user = userEvent.setup();
  await waitFor(() => expect(f.sockets.connect).toHaveBeenCalledOnce());
  act(() => {
    f.ready();
    f.emit({ kind: "frame", frame: f.frame });
  });
  await user.click(screen.getByRole("button", { name: "Take control" }));
  const draft = "Continue typing";
  fireEvent.change(screen.getByRole("textbox", { name: "Text to type into the computer" }), {
    target: { value: draft },
  });
  const expand = screen.getByRole("button", { name: "Expand screen" });
  await user.click(expand);
  const dialog = await screen.findByRole("dialog", { name: "Computer screen" });
  await waitFor(() =>
    expect(within(dialog).getByRole("textbox", { name: "Computer screen input" })).toHaveFocus(),
  );
  expect(within(dialog).getByRole("img", { name: "Computer screen" })).toBeVisible();
  expect(
    within(dialog).getByRole("textbox", { name: "Text to type into the computer" }),
  ).toHaveValue(draft);
  expect(f.socket.close).not.toHaveBeenCalled();
  expect(f.port.releaseControl).not.toHaveBeenCalled();
  expect(f.sockets.connect).toHaveBeenCalledOnce();
  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(expand).toHaveFocus());
  expect(f.controller.controlling).toBe(true);
  expect(f.port.releaseControl).not.toHaveBeenCalled();
  await user.click(expand);
  const reopened = await screen.findByRole("dialog", { name: "Computer screen" });
  // Escape from any focused control releases the grant and keeps this dialog open.
  within(reopened).getByRole("button", { name: "Release control" }).focus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(f.port.releaseControl).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(within(reopened).getByRole("button", { name: "Take control" })).toHaveFocus(),
  );
  expect(reopened).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Computer screen" })).toBeNull());
  expect(expand).toHaveFocus();
  expect(f.sockets.connect).toHaveBeenCalledOnce();
  expect(f.socket.close).not.toHaveBeenCalled();
});
it("traps expanded view focus and returns it to its bilingual opener", async () => {
  const f = mount("zh");
  const user = userEvent.setup();
  await waitFor(() => expect(f.sockets.connect).toHaveBeenCalledOnce());
  act(() => {
    f.ready();
    f.emit({ kind: "frame", frame: f.frame });
  });
  const expand = screen.getByRole("button", { name: "放大屏幕" });
  await user.click(expand);
  const dialog = await screen.findByRole("dialog", { name: "电脑屏幕" });
  await waitFor(() =>
    expect(within(dialog).getByRole("heading", { name: "电脑屏幕" })).toHaveFocus(),
  );
  const close = within(dialog).getByRole("button", { name: "关闭" });
  close.focus();
  await user.tab();
  expect(within(dialog).getByRole("textbox", { name: "电脑屏幕查看" })).toHaveFocus();
  await user.tab({ shift: true });
  expect(close).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(expand).toHaveFocus());
  expect(f.port.releaseControl).not.toHaveBeenCalled();
  expect(f.socket.close).not.toHaveBeenCalled();
});
