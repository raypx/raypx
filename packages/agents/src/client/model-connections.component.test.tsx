import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { modelConnectionSchema } from "@raypx/core/model-connections";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import {
  ModelConnectionsController,
  type ModelConnectionsPort,
} from "../model/model-connections.js";
import { ModelConnectionsEditor, ModelConnectionForm } from "./model-connections.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const time = "2026-11-14T00:00:00Z";
const connection = modelConnectionSchema.parse({
  id: "d48dc15e-45ce-4d10-87bc-6ca6c45511a9",
  name: "Personal",
  kind: "openai",
  baseUrl: null,
  api: null,
  models: ["model-one"],
  availability: { mode: "all" },
  createdAt: time,
  updatedAt: time,
});
const spaces = ["one", "two"].map((id) => ({
  space: spaceSchema.parse({ id, name: id, createdAt: time, updatedAt: time }),
  member: spaceMemberSchema.parse({
    spaceId: id,
    accountId: "member",
    role: "owner",
    createdAt: time,
  }),
}));
beforeEach(() => localStorage.clear());
async function mount(language: "en" | "zh" = "en") {
  const port: ModelConnectionsPort = {
    list: vi.fn(async () => [connection]),
    create: vi.fn(async () => connection),
    update: vi.fn(async () => connection),
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({ code: "AUTHENTICATION_FAILED" as const })),
  };
  const controller = new ModelConnectionsController(port, { list: async () => spaces });
  await controller.load();
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <ModelConnectionsEditor controller={controller} />
    </BrowserLanguageProvider>,
  );
  return { controller, port };
}
it.each(["en", "zh"] as const)(
  "lists connections and reports plain test outcomes in %s",
  async (language) => {
    await mount(language);
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("model-one")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: language === "en" ? "Test Personal" : "测试 Personal" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      language === "en" ? "Authentication failed" : "身份验证失败",
    );
  },
);
it("requires named deletion confirmation with the Run consequence", async () => {
  const { port } = await mount();
  fireEvent.click(screen.getByRole("button", { name: "Delete Personal" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete Personal?" });
  expect(
    within(dialog).getByText("Runs pinned to this connection will fail to resume."),
  ).toBeInTheDocument();
  expect(port.delete).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete connection" }));
  await waitFor(() => expect(port.delete).toHaveBeenCalledWith({ id: connection.id }));
});
it("never prefills an edit key, clears on submit and unmount, and preserves explicit availability", async () => {
  const save = vi.fn(async () => true);
  const { unmount } = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ModelConnectionForm initial={connection} spaces={spaces} onClose={vi.fn()} onSave={save} />
    </BrowserLanguageProvider>,
  );
  const key = screen.getByLabelText("API key") as HTMLInputElement;
  expect(key.value).toBe("");
  expect(screen.getByText("Leave empty to keep the current key.")).toBeInTheDocument();
  fireEvent.change(key, { target: { value: "write-only-key" } });
  fireEvent.click(screen.getByRole("radio", { name: "Chosen Spaces" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "two" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        availability: { mode: "selected", spaceIds: [spaces[1]!.space.id] },
      }),
      "write-only-key",
    ),
  );
  expect(key.value).toBe("");
  fireEvent.change(key, { target: { value: "unsubmitted-key" } });
  unmount();
  expect(key.value).toBe("");
});
it("only shows endpoint and protocol for a compatible kind and hides availability for one Space", async () => {
  const user = userEvent.setup();
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ModelConnectionForm
        initial={connection}
        spaces={spaces.slice(0, 1)}
        onClose={vi.fn()}
        onSave={vi.fn(async () => true)}
      />
    </BrowserLanguageProvider>,
  );
  expect(screen.queryByLabelText("Endpoint URL")).not.toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
  await user.click(screen.getByRole("combobox", { name: "Kind" }));
  await user.click(await screen.findByRole("option", { name: "Compatible endpoint" }));
  expect(await screen.findByLabelText("Endpoint URL")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Protocol" })).toBeInTheDocument();
});
