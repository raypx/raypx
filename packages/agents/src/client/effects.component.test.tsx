import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { effectSchema, type Effect } from "@raypx/core/approvals";
import { conversationIdSchema } from "@raypx/core/agents";
import { runIdSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { ApprovalPort } from "../model.js";
import { EffectRecords } from "./effects.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const selection = {
  spaceId: spaceIdSchema.parse("space-one"),
  conversationId: conversationIdSchema.parse("conversation-one"),
};
const runId = runIdSchema.parse("run-one");
const effect = effectSchema.parse({
  ...selection,
  runId,
  key: "a".repeat(64),
  argumentHash: "b".repeat(64),
  toolCallId: "call-one",
  toolName: "computer_write_file",
  state: "unknown",
  result: "PRIVATE OUTPUT",
  createdAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
});

function fixture(language: "en" | "zh" = "en") {
  const port: ApprovalPort = {
    pending: vi.fn(async () => []),
    answer: vi.fn(async () => {
      throw new Error("Inspection must not answer requests");
    }),
    effects: vi.fn(async () => [effect]),
  };
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <EffectRecords port={port} selection={selection} runId={runId} />
    </BrowserLanguageProvider>,
  );
  return port;
}

it.each(["en", "zh"] as const)(
  "reads unknown effects only when opened and offers inspection without execution in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    const port = fixture(language);
    expect(port.effects).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: strings.effects.open }));
    const dialog = await screen.findByRole("dialog", { name: strings.effects.title });
    expect(await within(dialog).findByText(strings.effects.states.unknown)).toBeVisible();
    expect(port.effects).toHaveBeenCalledExactlyOnceWith({ spaceId: selection.spaceId, runId });
    expect(within(dialog).getByText(strings.tools.writeFile)).toBeVisible();
    const date = within(dialog).getByText(
      new Date(effect.createdAt).toLocaleString(language, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
    expect(date).toHaveAttribute("datetime", effect.createdAt);
    expect(date).toHaveAttribute("title", new Date(effect.createdAt).toLocaleString(language));
    expect(within(dialog).queryByText("PRIVATE OUTPUT")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /retry|continue|重试|继续/i }),
    ).not.toBeInTheDocument();
    expect(port.answer).not.toHaveBeenCalled();
    expect(port.pending).not.toHaveBeenCalled();
  },
);

it("keeps a failed inspection explicit and retries only the read on Refresh", async () => {
  const port = fixture();
  vi.mocked(port.effects).mockRejectedValueOnce(new Error("private provider diagnostics"));
  fireEvent.click(screen.getByRole("button", { name: en.agents.effects.open }));
  const dialog = await screen.findByRole("dialog", { name: en.agents.effects.title });
  expect(await within(dialog).findByText(en.agents.effects.error)).toBeVisible();
  expect(screen.queryByText("private provider diagnostics")).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: en.agents.refresh }));
  await within(dialog).findByText(en.agents.effects.states.unknown);
  expect(port.effects).toHaveBeenCalledTimes(2);
  expect(port.answer).not.toHaveBeenCalled();
});

it("ignores an inspection response after the dialog unmounts", async () => {
  let finish: ((effects: Effect[]) => void) | undefined;
  const port: ApprovalPort = {
    pending: async () => [],
    answer: async () => {
      throw new Error("Unused");
    },
    effects: vi.fn(
      () =>
        new Promise<Effect[]>((resolve) => {
          finish = resolve;
        }),
    ),
  };
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <EffectRecords port={port} selection={selection} runId={runId} />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: en.agents.effects.open }));
  view.unmount();
  await act(async () => finish?.([effect]));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(port.effects).toHaveBeenCalledOnce();
});

it.each(["en", "zh"] as const)(
  "uses exact lifecycle identities for readable API effect labels in %s",
  async (language) => {
    const read = effectSchema.parse({
      ...effect,
      key: "c".repeat(64),
      toolCallId: "read-item",
      toolName: "openapi_0123456789abcdef0123456789abcdef__getItem",
      state: "succeeded",
      completedAt: "2026-01-01T00:00:01.000Z",
    });
    const write = effectSchema.parse({
      ...read,
      key: "d".repeat(64),
      toolCallId: "create-item",
      toolName: "openapi_0123456789abcdef0123456789abcdef__createItem",
    });
    const port: ApprovalPort = {
      pending: async () => [],
      answer: async () => {
        throw new Error("Unused");
      },
      effects: vi.fn(async () => [read, write]),
    };
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <EffectRecords
          port={port}
          selection={selection}
          runId={runId}
          activity={[
            {
              runId,
              toolCallId: read.toolCallId,
              toolName: read.toolName,
              argumentSummary: "GET Read inventory item",
            },
            {
              runId,
              toolCallId: write.toolCallId,
              toolName: write.toolName,
              argumentSummary: "POST Create inventory item",
            },
            {
              runId: runIdSchema.parse("unrelated-run"),
              toolCallId: read.toolCallId,
              toolName: read.toolName,
              argumentSummary: "GET Wrong label",
            },
          ]}
        />
      </BrowserLanguageProvider>,
    );
    const strings = { en, zh }[language].agents.effects;
    fireEvent.click(screen.getByRole("button", { name: strings.open }));
    const dialog = await screen.findByRole("dialog", { name: strings.title });
    expect(await within(dialog).findByText("Read inventory item")).toBeVisible();
    expect(within(dialog).getByText("Create inventory item")).toBeVisible();
    expect(within(dialog).queryByText("Wrong label")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("PRIVATE OUTPUT")).not.toBeInTheDocument();
  },
);
