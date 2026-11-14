import { afterEach, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { renderNative } from "../../tests/native.js";
import { useLocales } from "../../tests/mocks/localization.js";
import { MobileWorkspace } from "./workspace.js";

const ports = vi.hoisted(() => ({ workspace: vi.fn(() => ({})), replace: vi.fn() }));
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
  mobileConversationSocket: vi.fn(() => ({})),
  deviceDrafts: vi.fn(() => ({})),
  messageKey: vi.fn(() => "key"),
}));
import { AgentsProvider } from "./provider.js";

afterEach(() => {
  useLocales.mockReset();
  vi.restoreAllMocks();
  ports.workspace.mockClear();
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
