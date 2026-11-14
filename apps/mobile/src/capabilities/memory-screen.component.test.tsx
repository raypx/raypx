import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert } from "react-native";
import { useLocales } from "../../tests/mocks/localization.js";
import {
  act,
  changeText,
  findByLabel,
  press,
  renderNative,
  textContent,
} from "../../tests/native.js";
import { agentId, memory, memoryPort, spaceId } from "../../tests/capabilities.js";
import { MobileMemoryController } from "./memory-controller.js";
import { MobileMemoryScreen } from "./memory-screen.js";

const alerts = vi.spyOn(Alert, "alert");

afterEach(() => {
  useLocales.mockReset();
  alerts.mockClear();
});
describe("native memory screen", () => {
  it.each([
    {
      locale: "en",
      edit: "Edit Notes",
      source: "Markdown source",
      save: "Save",
      restore: "Restore revision 1",
      remove: "Remove document",
    },
    {
      locale: "zh",
      edit: "编辑 Notes",
      source: "Markdown 源码",
      save: "保存",
      restore: "恢复修订 1",
      remove: "移除文档",
    },
  ])(
    "edits Markdown and confirms revision restore in $locale",
    async ({ locale, edit, source, save, restore }) => {
      useLocales.mockReturnValue([{ languageTag: locale, languageCode: locale }]);
      const port = memoryPort();
      const controller = new MobileMemoryController(spaceId, agentId, port);
      await controller.refresh();
      const view = await renderNative(
        <MobileMemoryScreen controller={controller} agentName="Ray" onBack={vi.fn()} />,
      );
      await press(findByLabel(view.root, edit));
      await changeText(findByLabel(view.root, source), "# Edited");
      await press(findByLabel(view.root, save));
      expect(port.update).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedRevision: 1,
          document: expect.objectContaining({ text: "# Edited" }),
        }),
      );
      await press(findByLabel(view.root, restore));
      expect(port.restore).not.toHaveBeenCalled();
      const buttons = alerts.mock.calls.at(-1)?.[2];
      await act(async () => {
        buttons?.[1]?.onPress?.();
      });
      expect(port.restore).toHaveBeenCalledWith({
        spaceId,
        id: memory.id,
        expectedRevision: 2,
        revision: 1,
      });
      await view.unmount();
      controller.dispose();
    },
  );
  it("retains source on conflict and uses explicit reload", async () => {
    const port = memoryPort();
    const controller = new MobileMemoryController(spaceId, agentId, port);
    await controller.edit(memory);
    const view = await renderNative(
      <MobileMemoryScreen controller={controller} agentName="Ray" onBack={vi.fn()} />,
    );
    await changeText(findByLabel(view.root, "Markdown source"), "Unsaved");
    port.update.mockRejectedValueOnce({ code: "MEMORY_CONFLICT" });
    await press(findByLabel(view.root, "Save"));
    expect(textContent(view.root)).toContain("This document changed while you were editing.");
    expect(findByLabel(view.root, "Save").props.isDisabled).toBe(true);
    await press(findByLabel(view.root, "Reload current revision"));
    expect(findByLabel(view.root, "Markdown source").props.value).toBe("Unsaved");
    expect(findByLabel(view.root, "Save").props.isDisabled).toBe(false);
    await view.unmount();
    controller.dispose();
  });
});
