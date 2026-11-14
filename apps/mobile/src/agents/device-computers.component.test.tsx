import { afterEach, expect, it, vi } from "vitest";
import type { AlertButton } from "react-native";
import { DeviceComputersController, type DeviceComputersPort } from "@raypx/agents/model";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import type { DeviceComputerSelection } from "@raypx/core/computers";
import en from "@raypx/agents/messages/en";
import zh from "@raypx/agents/messages/zh";
import { useLocales } from "../../tests/mocks/localization.js";
import { Alert } from "../../tests/mocks/react-native.js";
import { act, findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { DeviceComputerSelector, DeviceSettings } from "./device-computers.js";
const english = en.agents;
const chinese = zh.agents;
const spaceId = spaceIdSchema.parse("device-space");
const conversationId = conversationIdSchema.parse("device-conversation");
const deviceId = "11111111-1111-4111-8111-111111111111";
const grantId = "22222222-2222-4222-8222-222222222222";
function fixture(connected = true) {
  let selection: DeviceComputerSelection | null = { deviceId, grantId };
  const port = {
    list: vi.fn(async () => ({
      devices: [
        {
          id: deviceId,
          name: "Work machine",
          platform: "darwin",
          connected,
          connectionState: connected ? ("connected" as const) : ("offline" as const),
          grants: [
            { id: grantId, spaceId, directory: "/work/project", revision: 1, revokedAt: null },
          ],
          createdAt: "2026-11-14T00:00:00.000Z",
        },
      ],
    })),
    createPairing: vi.fn(async () => ({
      code: "1234ABCDEF12",
      expiresAt: "2026-11-14T00:05:00.000Z",
    })),
    requestGrant: vi.fn(async () => ({ requestId: crypto.randomUUID() })),
    revokeGrant: vi.fn(async () => ({ ok: true as const })),
    revoke: vi.fn(async () => ({ ok: true as const })),
    getSelection: vi.fn(async () => ({ selection })),
    select: vi.fn(async (input: { selection: DeviceComputerSelection | null }) => {
      selection = input.selection;
      return { selection };
    }),
  } satisfies DeviceComputersPort;
  return { port, controller: new DeviceComputersController(spaceId, port, conversationId) };
}
afterEach(() => {
  useLocales.mockReturnValue([{ languageTag: "en-US", languageCode: "en" }]);
});
it.each([
  ["en-US", english],
  ["zh-CN", chinese],
] as const)(
  "shows device scope and native pairing instructions in %s",
  async (language, strings) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language.slice(0, 2) }]);
    const f = fixture();
    const view = await renderNative(<DeviceSettings controller={f.controller} />);
    expect(textContent(view.root)).toContain(strings.devices.warning);
    expect(textContent(view.root)).toContain(strings.devices.ownerOnly);
    await press(findByLabel(view.root, strings.devices.pair));
    expect(f.port.createPairing).toHaveBeenCalledWith({ spaceId });
    expect(textContent(view.root)).toContain("1234ABCDEF12");
    expect(textContent(view.root)).toContain(strings.devices.pairingInstructions);
    await view.unmount();
    f.controller.dispose();
  },
);
it("requests confirmation on the machine and confirms revocation before changing the grant", async () => {
  const f = fixture();
  const view = await renderNative(<DeviceSettings controller={f.controller} />);
  await press(findByLabel(view.root, `${english.devices.grantDirectory} · Work machine`));
  expect(f.port.requestGrant).toHaveBeenCalledWith({ spaceId, deviceId });
  expect(textContent(view.root)).toContain(english.devices.confirmOnDevice);
  await press(findByLabel(view.root, "Revoke /work/project"));
  expect(f.port.revokeGrant).not.toHaveBeenCalled();
  const rejected = Alert.alert.mock.calls.at(-1)?.[2] as AlertButton[];
  await act(async () => rejected[0]?.onPress?.());
  expect(f.port.revokeGrant).not.toHaveBeenCalled();
  await press(findByLabel(view.root, "Revoke /work/project"));
  const accepted = Alert.alert.mock.calls.at(-1)?.[2] as AlertButton[];
  await act(async () => accepted[1]?.onPress?.());
  expect(f.port.revokeGrant).toHaveBeenCalledWith({ spaceId, deviceId, grantId });
  await view.unmount();
  f.controller.dispose();
});
it("retains an unavailable selected device until the member explicitly selects the sandbox", async () => {
  const f = fixture(false);
  const view = await renderNative(<DeviceComputerSelector controller={f.controller} />);
  expect(textContent(view.root)).toContain(english.devices.unavailable);
  expect(textContent(view.root)).toContain(english.devices.warning);
  expect(f.controller.getSnapshot().selection).toEqual({ deviceId, grantId });
  const option = findByLabel(view.root, "Work machine · /work/project");
  expect(option.props.disabled).toBe(true);
  await press(option);
  expect(f.port.select).not.toHaveBeenCalled();
  await press(findByLabel(view.root, english.devices.teamSandbox));
  expect(f.port.select).toHaveBeenCalledWith({ spaceId, conversationId, selection: null });
  expect(f.controller.getSnapshot().selection).toBeNull();
  await view.unmount();
  f.controller.dispose();
});
