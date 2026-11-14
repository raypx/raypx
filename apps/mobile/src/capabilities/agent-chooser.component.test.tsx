import { afterEach, expect, it, vi } from "vitest";
import { agentSchema, conversationIdSchema, directConversation } from "@raypx/core/agents";
import { useLocales } from "../../tests/mocks/localization.js";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { agentId, date, spaceId } from "../../tests/capabilities.js";
import { CapabilityAgentChooser } from "./agent-chooser.js";

afterEach(() => useLocales.mockReset());
it.each(["en", "zh"])("selects an Agent from a group capability entry in %s", async (locale) => {
  useLocales.mockReturnValue([{ languageTag: locale, languageCode: locale }]);
  const agent = agentSchema.parse({
    id: agentId,
    spaceId,
    name: "Reader",
    instructions: "Read",
    model: { modelId: "model-one" },
    createdAt: date,
    updatedAt: date,
  });
  const onChoose = vi.fn();
  const view = await renderNative(
    <CapabilityAgentChooser
      title="Capability"
      agents={[
        {
          agent,
          conversation: directConversation(agent, conversationIdSchema.parse("conversation-one")),
        },
      ]}
      loading={false}
      error={false}
      onChoose={onChoose}
      onRefresh={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  expect(textContent(view.root)).toContain(locale === "en" ? "Choose an Agent" : "选择智能体");
  await press(findByLabel(view.root, "Reader"));
  expect(onChoose).toHaveBeenCalledWith(agentId);
  await view.unmount();
});
