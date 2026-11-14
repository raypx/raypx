import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocales } from "../../tests/mocks/localization.js";
import {
  act,
  changeText,
  findByLabel,
  press,
  renderNative,
  textContent,
} from "../../tests/native.js";
import { agentId, routine, routinePort, spaceId } from "../../tests/capabilities.js";
import { MobileRoutinesController } from "./routines-controller.js";
import { MobileRoutinesScreen } from "./routines-screen.js";

afterEach(() => useLocales.mockReset());
describe("native routines screen", () => {
  it.each([
    {
      locale: "en",
      edit: "Edit: Morning",
      expression: "Cron expression",
      save: "Save",
      copy: "Copy address: Webhook",
      back: "Back to list",
      history: "History: Morning",
    },
    {
      locale: "zh",
      edit: "编辑: Morning",
      expression: "Cron 表达式",
      save: "保存",
      copy: "复制地址: Webhook",
      back: "返回列表",
      history: "历史记录: Morning",
    },
  ])(
    "edits schedules and copies deployment-provided ingress in $locale",
    async ({ locale, edit, expression, save, copy, back, history }) => {
      useLocales.mockReturnValue([{ languageTag: locale, languageCode: locale }]);
      const port = routinePort();
      const controller = new MobileRoutinesController(
        spaceId,
        agentId,
        port,
        () => "delivery",
        "UTC",
      );
      await controller.refresh();
      const onCopy = vi.fn(async () => {});
      const view = await renderNative(
        <MobileRoutinesScreen
          controller={controller}
          agentName="Ray"
          onBack={vi.fn()}
          onCopy={onCopy}
        />,
      );
      expect(view.root.findAll((node) => String(node.type) === "FlatList")).toHaveLength(1);
      await press(findByLabel(view.root, edit));
      await changeText(findByLabel(view.root, expression), "0 8 * * *");
      await press(findByLabel(view.root, save));
      expect(port.update).toHaveBeenCalledWith(
        expect.objectContaining({
          routine: expect.objectContaining({
            triggers: expect.objectContaining({
              schedule: { cron: "0 8 * * *", timezone: "Asia/Shanghai" },
            }),
          }),
        }),
      );
      await press(findByLabel(view.root, copy));
      expect(onCopy).toHaveBeenCalledWith(routine.ingress!.webhook.url);
      await press(findByLabel(view.root, back));
      await press(findByLabel(view.root, history));
      expect(port.history).toHaveBeenCalledWith({ spaceId, id: routine.id, limit: 100 });
      await view.unmount();
      controller.dispose();
    },
  );
  it("keeps loading failures visible and retryable", async () => {
    const port = routinePort();
    port.list.mockRejectedValueOnce(new Error("offline"));
    const controller = new MobileRoutinesController(
      spaceId,
      agentId,
      port,
      () => "delivery",
      "UTC",
    );
    await controller.refresh();
    const view = await renderNative(
      <MobileRoutinesScreen
        controller={controller}
        agentName="Ray"
        onBack={vi.fn()}
        onCopy={vi.fn()}
      />,
    );
    expect(textContent(view.root)).toContain("The request failed. Try again.");
    await press(findByLabel(view.root, "Refresh"));
    expect(textContent(view.root)).toContain("Morning");
    await act(async () => controller.dispose());
    await view.unmount();
  });
});
