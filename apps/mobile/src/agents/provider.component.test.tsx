import { afterEach, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { Alert } from "../../tests/mocks/react-native.js";
import { act, renderNative } from "../../tests/native.js";
import en from "@raypx/agents/messages/en";
import { useLocales } from "../../tests/mocks/localization.js";
import { MobileWorkspace } from "./workspace.js";

const ports = vi.hoisted(() => ({
  workspace: vi.fn(() => ({})),
  replace: vi.fn(),
  socket: vi.fn((_options: { forbidden(reason?: string): void }) => ({})),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: ports.replace }) }));
vi.mock("expo-secure-store", () => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device",
}));
vi.mock("../auth.js", () => ({ apiOrigin: "https://api.test", authClient: {} }));
vi.mock("./ports.js", () => ({
  mobileApi: vi.fn(() => ({})),
  mobileWorkspacePort: ports.workspace,
  mobileConversationSocket: ports.socket,
  deviceDrafts: vi.fn(() => ({})),
  messageKey: vi.fn(() => "key"),
}));
import { AgentsProvider } from "./provider.js";

afterEach(() => {
  useLocales.mockReset();
  vi.restoreAllMocks();
  ports.workspace.mockClear();
  ports.socket.mockClear();
  ports.replace.mockClear();
  vi.mocked(Alert.alert).mockClear();
});

it("routes an unknown forbidden close to the directory without displaying its private reason", async () => {
  const view = await renderNative(
    <AgentsProvider accountId="member" enabled={false}>
      <Text>Workspace</Text>
    </AgentsProvider>,
  );
  await act(async () => {
    ports.socket.mock.calls[0]![0].forbidden("PRIVATE_PROVIDER_DIAGNOSTIC");
  });
  expect(ports.replace).toHaveBeenCalledWith("/");
  expect(Alert.alert).toHaveBeenCalledWith(en.agents.spaceSettings.exitUnavailable);
  expect(JSON.stringify(vi.mocked(Alert.alert).mock.calls)).not.toContain(
    "PRIVATE_PROVIDER_DIAGNOSTIC",
  );
  await view.unmount();
});

it("preserves the workspace when language and router objects change", async () => {
  useLocales.mockReturnValue([{ languageTag: "en", languageCode: "en" }]);
  const dispose = vi.spyOn(MobileWorkspace.prototype, "dispose");
  const content = () => (
    <AgentsProvider accountId="member" enabled={false}>
      <Text>Workspace</Text>
    </AgentsProvider>
  );
  const view = await renderNative(content());
  try {
    expect(ports.workspace).toHaveBeenCalledTimes(1);
    useLocales.mockReturnValue([{ languageTag: "zh", languageCode: "zh" }]);
    await view.update(content());
    expect(ports.workspace).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
  } finally {
    await view.unmount();
  }
  expect(dispose).toHaveBeenCalledTimes(1);
});
