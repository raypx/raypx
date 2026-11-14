import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import type { DeviceComputer } from "@raypx/core/computers";
import { DeviceComputersController, type DeviceComputersPort } from "../model/device-computers.js";
import { DevicesSettings, DeviceComputerSelector } from "./device-computers.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const spaceId = spaceIdSchema.parse("space");
const device: DeviceComputer = {
  id: "018e2c42-08e0-4000-8000-000000000001",
  name: "My machine",
  platform: "darwin",
  connected: true,
  connectionState: "connected",
  createdAt: "2026-01-01T00:00:00Z",
  grants: [
    {
      id: "018e2c42-08e0-4000-8000-000000000002",
      spaceId,
      directory: "/my/project",
      revision: 1,
      revokedAt: null,
    },
  ],
};
const controllers: DeviceComputersController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});
function fixture(language: "en" | "zh", selector = false, connected = true) {
  let devices = [
    {
      ...device,
      connected,
      connectionState: connected ? ("connected" as const) : ("offline" as const),
    },
  ];
  const port: DeviceComputersPort = {
    list: vi.fn(async () => ({ devices })),
    createPairing: vi.fn(async () => ({
      code: "pair-code",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    requestGrant: vi.fn(async () => ({ requestId: "request" })),
    revoke: vi.fn(async () => {
      devices = [];
      return { ok: true as const };
    }),
    revokeGrant: vi.fn(async () => ({ ok: true as const })),
    getSelection: vi.fn(async () => ({
      selection: { deviceId: device.id, grantId: device.grants[0]!.id },
    })),
    select: vi.fn(async (input) => ({ selection: input.selection })),
  };
  const controller = new DeviceComputersController(
    spaceId,
    port,
    selector ? conversationIdSchema.parse("conversation") : undefined,
  );
  controllers.push(controller);
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      {selector ? (
        <DeviceComputerSelector controller={controller} />
      ) : (
        <DevicesSettings controller={controller} />
      )}
    </BrowserLanguageProvider>,
  );
  return { port, controller, strings: { en, zh }[language].agents };
}

it.each(["en", "zh"] as const)(
  "shows owned directories, confirmation intent and explicit revocation in %s",
  async (language) => {
    const { port, strings } = fixture(language);
    await screen.findByText("My machine");
    expect(screen.getByText(strings.devices.warning)).toBeInTheDocument();
    expect(screen.getByText("/my/project")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: strings.devices.grantDirectory }));
    await screen.findByRole("status");
    expect(port.requestGrant).toHaveBeenCalledExactlyOnceWith({ spaceId, deviceId: device.id });
    fireEvent.click(screen.getAllByRole("button", { name: strings.devices.revoke })[0]!);
    const dialog = await screen.findByRole("alertdialog", { name: strings.devices.revokeTitle });
    const cancel = within(dialog).getByRole("button", { name: strings.cancel });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(port.revoke).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: strings.devices.revoke }));
    await screen.findByText(strings.devices.empty);
    expect(port.revoke).toHaveBeenCalledExactlyOnceWith({ spaceId, deviceId: device.id });
  },
);

it("keeps an offline device selected and disables it without selecting the sandbox automatically", async () => {
  const { port, strings } = fixture("en", true, false);
  const trigger = await screen.findByRole("combobox", { name: strings.devices.computer });
  await waitFor(() => expect(trigger).toBeEnabled());
  expect(trigger).toHaveTextContent("My machine");
  expect(screen.getByText(strings.devices.warning)).toBeInTheDocument();
  expect(port.select).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  const offline = await screen.findByRole("option", { name: /My machine.*Offline/ });
  expect(offline).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("option", { name: strings.devices.teamSandbox })).toBeInTheDocument();
});
