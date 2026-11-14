import { afterEach, expect, it, vi } from "vitest";
import { effectSchema } from "@raypx/core/approvals";
import { conversationIdSchema } from "@raypx/core/agents";
import { runIdSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { EffectRecords } from "./effects.js";
import en from "@raypx/agents/messages/en";
import zh from "@raypx/agents/messages/zh";
import { useLocales } from "../../tests/mocks/localization.js";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
const runId = runIdSchema.parse("run");
const effect = effectSchema.parse({
  ...selection,
  runId,
  toolCallId: "call",
  toolName: "computer_write_file",
  key: "a".repeat(64),
  argumentHash: "b".repeat(64),
  result: "PRIVATE OUTPUT",
  state: "unknown",
  createdAt: "2026-11-14T00:00:00.000Z",
  completedAt: null,
});
afterEach(() => useLocales.mockReset());
it.each(["en", "zh"] as const)(
  "inspects uncertain effects without replay in %s",
  async (locale) => {
    useLocales.mockReturnValue([{ languageTag: locale, languageCode: locale }]);
    const copy = { en, zh }[locale].agents;
    const effects = vi.fn(async () => [effect]);
    const port = { pending: vi.fn(), answer: vi.fn(), effects };
    const view = await renderNative(
      <EffectRecords port={port} selection={selection} runId={runId} activity={[]} />,
    );
    expect(effects).not.toHaveBeenCalled();
    await press(findByLabel(view.root, copy.effects.open));
    expect(textContent(view.root)).toContain(copy.effects.states.unknown);
    expect(textContent(view.root)).toContain(copy.tools.writeFile);
    expect(port.answer).not.toHaveBeenCalled();
    await press(findByLabel(view.root, copy.close));
    expect(textContent(view.root)).not.toContain(copy.effects.states.unknown);
    await view.unmount();
  },
);
it("retries an inspection failure explicitly", async () => {
  const effects = vi.fn().mockRejectedValueOnce(new Error("PRIVATE")).mockResolvedValue([]);
  const view = await renderNative(
    <EffectRecords
      port={{ pending: vi.fn(), answer: vi.fn(), effects }}
      selection={selection}
      runId={runId}
      activity={[]}
    />,
  );
  await press(findByLabel(view.root, en.agents.effects.open));
  expect(textContent(view.root)).toContain(en.agents.effects.error);
  expect(textContent(view.root)).not.toContain("PRIVATE");
  await press(findByLabel(view.root, en.agents.refresh));
  expect(textContent(view.root)).toContain(en.agents.effects.empty);
  await view.unmount();
});
