import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { mcpServerSchema } from "@raypx/core/mcp-servers";
import { McpServerForm, McpServersEditor } from "./mcp-servers.js";
import { McpServersController, type McpServersPort } from "../model/mcp-servers.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const server = mcpServerSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Research",
  url: "https://example.com/mcp",
  transport: "http",
  availability: { mode: "all" },
  hasCredentials: true,
  createdAt: "2026-11-14T00:00:00Z",
  updatedAt: "2026-11-14T00:00:00Z",
});
it.each(["en", "zh"] as const)(
  "shows discovered tools and plain test outcomes in %s",
  async (language) => {
    const port: McpServersPort = {
      list: async () => [server],
      create: async () => server,
      update: async () => server,
      delete: async () => ({ deleted: true }),
      test: vi.fn(async () => ({ code: "SUCCEEDED" as const, toolNames: ["read_page"] })),
      setAvailability: async () => server,
    };
    const controller = new McpServersController(port, { list: async () => [] });
    await controller.load();
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <McpServersEditor controller={controller} />
      </BrowserLanguageProvider>,
    );
    const strings = { en, zh }[language].agents.mcp;
    fireEvent.click(screen.getByRole("button", { name: strings.test }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(strings.outcomes.SUCCEEDED),
    );
    expect(screen.getByRole("list", { name: strings.tools })).toHaveTextContent("read_page");
  },
);
it("never prefills headers, clears on failed submit and unmount, and preserves source fields", async () => {
  const save = vi.fn(async () => false);
  const { unmount } = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <McpServerForm initial={server} spaces={[]} onClose={vi.fn()} onSave={save} />
    </BrowserLanguageProvider>,
  );
  const headers = screen.getByLabelText("Credential headers (optional)") as HTMLTextAreaElement;
  expect(headers.value).toBe("");
  fireEvent.change(headers, { target: { value: "Authorization: private" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "Research" }), {
      Authorization: "private",
    }),
  );
  expect(headers.value).toBe("");
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the server.");
  expect(screen.getByLabelText("Server URL")).toHaveValue(server.url);
  fireEvent.change(headers, { target: { value: "X-Key: unsubmitted" } });
  unmount();
  expect(headers.value).toBe("");
});
it("explains local command refusal without sending a configuration", async () => {
  const save = vi.fn(async () => true);
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <McpServerForm initial={server} spaces={[]} onClose={vi.fn()} onSave={save} />
    </BrowserLanguageProvider>,
  );
  fireEvent.change(screen.getByLabelText("Server URL"), { target: { value: "stdio:tool" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Local command servers are not supported.",
  );
  expect(save).not.toHaveBeenCalled();
});

it("closes the server dialog with one Escape and returns focus to its opener", async () => {
  const user = (await import("@testing-library/user-event")).default.setup();
  const port: McpServersPort = {
    list: async () => [server],
    create: async () => server,
    update: async () => server,
    delete: async () => ({ deleted: true }),
    test: async () => ({ code: "SUCCEEDED", toolNames: [] }),
    setAvailability: async () => server,
  };
  const controller = new McpServersController(port, { list: async () => [] });
  await controller.load();
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <McpServersEditor controller={controller} />
    </BrowserLanguageProvider>,
  );
  const opener = screen.getByRole("button", { name: "Add server" });
  await user.click(opener);
  expect(await screen.findByRole("dialog", { name: "Add server" })).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});
