import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { AgentForm } from "./agent-form.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
it.each(["en", "zh"] as const)(
  "preserves the shared-memory setting and allows an explicit change in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    const onSave = vi.fn(async () => {});
    const initial = {
      name: "Agent",
      instructions: "",
      model: { modelId: "model" },
      allowSharedMemory: true,
    };
    const mount = render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <AgentForm
          initial={initial}
          models={[{ modelId: "model", name: "Model", source: "deployment" }]}
          onSave={onSave}
          onClose={() => {}}
        />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByRole("checkbox", { name: strings.allowSharedMemory })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: strings.save }));
    await waitFor(() => expect(onSave).toHaveBeenCalledExactlyOnceWith(initial));
    mount.unmount();
    const disabledSave = vi.fn(async () => {});
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <AgentForm
          initial={initial}
          models={[{ modelId: "model", name: "Model", source: "deployment" }]}
          onSave={disabledSave}
          onClose={() => {}}
        />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: strings.allowSharedMemory }));
    fireEvent.click(screen.getByRole("button", { name: strings.save }));
    await waitFor(() =>
      expect(disabledSave).toHaveBeenCalledExactlyOnceWith({
        ...initial,
        allowSharedMemory: false,
      }),
    );
  },
);

it("loads available capabilities before saving exact checked selections", async () => {
  const { spaceIdSchema } = await import("@raypx/core/spaces");
  const { skillSchema } = await import("@raypx/core/skills");
  const { mcpServerSchema } = await import("@raypx/core/mcp-servers");
  const spaceId = spaceIdSchema.parse("space");
  const time = "2026-11-14T00:00:00Z";
  const skill = skillSchema.parse({
    id: "notes",
    name: "Notes skill",
    description: "Notes",
    body: "Notes",
    ownership: "space",
    spaceId,
    agentId: "agent",
    availability: { mode: "all" },
    createdAt: time,
    updatedAt: time,
  });
  const server = mcpServerSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Research server",
    url: "https://example.com/mcp",
    transport: "http",
    availability: { mode: "all" },
    hasCredentials: false,
    createdAt: time,
    updatedAt: time,
  });
  const onSave = vi.fn(async () => {});
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <AgentForm
        initial={{ name: "Agent", instructions: "", model: { modelId: "model" } }}
        models={[{ modelId: "model", name: "Model", source: "deployment" }]}
        spaceId={spaceId}
        capabilities={{
          skills: {
            list: async () => [skill],
            agentSkills: async () => [],
            setAgentSkills: async () => [],
          },
          mcpServers: {
            list: async () => [server],
            enabled: async () => [],
            setEnabled: async () => [],
          },
        }}
        onSave={onSave}
        onClose={() => {}}
      />
    </BrowserLanguageProvider>,
  );
  const checkbox = await screen.findByRole("checkbox", { name: /Notes skill/ });
  expect(screen.getByText(/Created by an Agent/)).toBeVisible();
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("checkbox", { name: "Research server" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Agent" }), {
      skillIds: [skill.id],
      serverIds: [server.id],
    }),
  );
});
