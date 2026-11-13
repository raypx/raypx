import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@raypx/ui/components/ui/tooltip";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import type { AgentsWorkspacePort } from "../model.js";
import { CapabilityPanels } from "./capability-panel.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

vi.mock("@raypx/jobs/client", () => ({
  RoutinesPanel: ({
    spaceId,
    agentId,
    onOpenRun,
  }: {
    spaceId: string;
    agentId: string;
    onOpenRun: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onOpenRun(`${spaceId}:${agentId}`)}>
      Open fixture Run
    </button>
  ),
}));
vi.mock("@raypx/memory/client", () => ({
  SpaceMemoryPanel: ({ spaceId, agentId }: { spaceId: string; agentId: string }) => (
    <p>{`${spaceId}:${agentId}`}</p>
  ),
}));
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const time = "2026-11-14T00:00:00Z";
const item = {
  agent: agentSchema.parse({
    id: "agent",
    spaceId: "space",
    name: "Agent",
    instructions: "",
    model: { modelId: "model" },
    createdAt: time,
    updatedAt: time,
  }),
  conversation: conversationSchema.parse({
    id: "conversation",
    agentId: "agent",
    spaceId: "space",
    kind: "direct",
    createdAt: time,
  }),
};
const unused = async () => {
  throw new Error("Unexpected port request");
};
const client: Pick<AgentsWorkspacePort, "routines" | "spaceMemory"> = {
  routines: {
    list: unused,
    get: unused,
    create: unused,
    update: unused,
    pause: unused,
    resume: unused,
    delete: unused,
    test: unused,
    rotateWebhookKey: unused,
    history: unused,
    events: unused,
  },
  spaceMemory: {
    list: unused,
    get: unused,
    create: unused,
    update: unused,
    remove: unused,
    history: unused,
    restore: unused,
  },
};
it.each([
  { locale: "en" as const, routine: "Routines", memory: "Memory", close: "Close panel" },
  { locale: "zh" as const, routine: "例行任务", memory: "记忆", close: "关闭面板" },
])(
  "mounts scoped panels only while open and returns focus in $locale",
  async ({ locale, routine, memory, close }) => {
    const onOpenRun = vi.fn();
    render(
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        <CapabilityPanels
          item={item}
          client={client}
          accountId="member"
          origin="https://api.example"
          onOpenRun={onOpenRun}
          onOpen={() => {}}
        />
      </BrowserLanguageProvider>,
    );
    const trigger = screen.getByRole("button", { name: memory });
    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: memory })).toBeVisible();
    expect(screen.getByText("space:agent")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: close }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: routine }));
    fireEvent.click(await screen.findByRole("button", { name: "Open fixture Run" }));
    expect(onOpenRun).toHaveBeenCalledExactlyOnceWith("space:agent");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
);

it.each(["en", "zh"] as const)(
  "opens named compact menu items and restores focus after a resize in %s",
  async (language) => {
    let wide = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: wide,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      })),
    );
    try {
      const strings = { en, zh }[language].agents;
      render(
        <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
          <CapabilityPanels
            item={item}
            client={client}
            accountId="member"
            origin="https://api.example"
            onOpenRun={() => {}}
            onOpen={() => {}}
          />
        </BrowserLanguageProvider>,
      );
      const menu = screen.getByRole("button", { name: strings.capabilityMenu });
      fireEvent.click(menu);
      fireEvent.click(await screen.findByRole("menuitem", { name: strings.spaceMemory }));
      expect(await screen.findByRole("dialog", { name: strings.spaceMemory })).toBeVisible();
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: strings.closePanel }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(menu).toHaveFocus());
      wide = true;
      fireEvent.click(screen.getByRole("button", { name: strings.routines }));
      expect(await screen.findByRole("dialog", { name: strings.routines })).toBeVisible();
      wide = false;
      fireEvent.click(screen.getByRole("button", { name: strings.closePanel }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(menu).toHaveFocus());
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it("closes Routines with one Escape while the close-button tooltip is open", async () => {
  const user = userEvent.setup();
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <TooltipProvider>
        <CapabilityPanels
          item={item}
          client={client}
          accountId="member"
          origin="https://api.example"
          onOpenRun={() => {}}
          onOpen={() => {}}
        />
      </TooltipProvider>
    </BrowserLanguageProvider>,
  );
  const opener = screen.getByRole("button", { name: "Routines" });
  await user.click(opener);
  const sheet = await screen.findByRole("dialog", { name: "Routines" });
  const close = within(sheet).getByRole("button", { name: "Close panel" });
  await act(async () => {
    close.focus();
  });
  await user.hover(close);
  expect(await screen.findByRole("tooltip", { name: "Close panel" })).toBeVisible();
  expect(close).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Routines" })).toBeNull(), {
    timeout: 3000,
  });
  await waitFor(() => expect(opener).toHaveFocus());
});
