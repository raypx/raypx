import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { openApiServerSchema } from "@raypx/core/openapi-servers";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { OpenApiServerForm, OpenApiServersEditor } from "./openapi-servers.js";
import { OpenApiServersController, type OpenApiServersPort } from "../model/openapi-servers.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const time = "2026-11-14T00:00:00Z";
const space = spaceSchema.parse({ id: "space", name: "Team", createdAt: time, updatedAt: time });
const membership = {
  space,
  member: spaceMemberSchema.parse({
    spaceId: space.id,
    accountId: "member",
    role: "owner",
    createdAt: time,
  }),
};
const server = openApiServerSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  spaceId: space.id,
  name: "Inventory",
  url: "https://api.example.test",
  operations: [
    {
      operationId: "listItems",
      label: "List items",
      method: "GET",
      path: "/items",
      readOnly: true,
    },
    {
      operationId: "createItem",
      label: "Create item",
      method: "POST",
      path: "/items",
      readOnly: false,
    },
  ],
  selectedOperationIds: ["listItems", "createItem"],
  availability: { mode: "all" },
  hasCredentials: true,
  createdAt: time,
  updatedAt: time,
});
function port(): OpenApiServersPort {
  return {
    list: async () => [server],
    create: async () => server,
    update: async () => server,
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({
      code: "SUCCEEDED" as const,
      operationIds: ["listItems", "createItem"],
    })),
  };
}
it.each(["en", "zh"] as const)(
  "shows operation methods, test results and owner scope in %s",
  async (language) => {
    const api = port();
    const controller = new OpenApiServersController(api, {
      spaces: { list: async () => [membership] },
      agents: { list: async () => [] },
    });
    await controller.load();
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <OpenApiServersEditor controller={controller} />
      </BrowserLanguageProvider>,
    );
    const strings = { en, zh }[language].agents.openapi;
    const operations = within(screen.getByRole("list", { name: strings.operations })).getAllByRole(
      "listitem",
    );
    expect(operations[0]).toHaveTextContent(`GET List items · ${strings.readOnly}`);
    expect(operations[1]).toHaveTextContent(`POST Create item · ${strings.mutating}`);
    fireEvent.click(screen.getByRole("button", { name: strings.test }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(strings.outcomes.SUCCEEDED),
    );
    expect(api.test).toHaveBeenCalledWith({ spaceId: space.id, id: server.id });
  },
);
it("selects only explicit operations and sends no unchanged credential", async () => {
  const save = vi.fn(async () => true);
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <OpenApiServerForm
        initial={{ ...server, selectedOperationIds: [] }}
        agents={[]}
        onClose={vi.fn()}
        onSave={save}
      />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /List items/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ selectedOperationIds: ["listItems"] }),
      undefined,
      undefined,
    ),
  );
  expect(screen.queryByLabelText("Secret value")).not.toBeInTheDocument();
});
it("imports a pasted source then opens the operation selector with no implicitly enabled operations", async () => {
  const api = port();
  api.create = vi.fn(async () => ({ ...server, selectedOperationIds: [] }));
  const controller = new OpenApiServersController(api, {
    spaces: { list: async () => [membership] },
    agents: { list: async () => [] },
  });
  await controller.load();
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <OpenApiServersEditor controller={controller} />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add API" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Inventory" } });
  fireEvent.change(screen.getByLabelText("API server URL"), {
    target: { value: "https://api.example.test" },
  });
  fireEvent.change(screen.getByLabelText("OpenAPI document (JSON or YAML)"), {
    target: { value: '{"openapi":"3.1.0"}' },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import API" }));
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: space.id,
        source: { document: '{"openapi":"3.1.0"}' },
        server: expect.objectContaining({ selectedOperationIds: [] }),
        credential: { type: "none" },
      }),
    ),
  );
  expect(await screen.findByRole("dialog", { name: "Edit Inventory" })).toBeVisible();
  expect(screen.getByRole("checkbox", { name: /List items/ })).not.toBeChecked();
});
it("consumes a secret on failed submit and clears it on close", async () => {
  const user = (await import("@testing-library/user-event")).default.setup();
  const save = vi.fn(async () => false);
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <OpenApiServerForm initial={server} agents={[]} onClose={vi.fn()} onSave={save} />
    </BrowserLanguageProvider>,
  );
  await user.click(screen.getByRole("combobox", { name: "Credentials" }));
  await user.click(screen.getByRole("option", { name: "Bearer token" }));
  const input = screen.getByLabelText("Secret value") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "private-key" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(expect.anything(), undefined, {
      type: "bearer",
      value: "private-key",
    }),
  );
  expect(input.value).toBe("");
  expect(await screen.findByRole("alert")).toHaveTextContent(en.agents.openapi.errors.save);
  fireEvent.change(input, { target: { value: "unsubmitted" } });
  view.unmount();
  expect(input.value).toBe("");
});

it("requires explicit delete confirmation and keeps the API after cancellation", async () => {
  const api = port();
  const controller = new OpenApiServersController(api, {
    spaces: { list: async () => [membership] },
    agents: { list: async () => [] },
  });
  await controller.load();
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <OpenApiServersEditor controller={controller} />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete API" }));
  const first = await screen.findByRole("alertdialog", { name: "Delete Inventory?" });
  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(within(first).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(controller.getSnapshot().servers).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Delete API" }));
  const next = await screen.findByRole("alertdialog", { name: "Delete Inventory?" });
  fireEvent.click(within(next).getByRole("button", { name: "Delete API" }));
  await waitFor(() =>
    expect(api.delete).toHaveBeenCalledWith({ spaceId: space.id, id: server.id }),
  );
});

it("limits availability to explicitly selected Agents in the current Space", async () => {
  const { agentIdSchema } = await import("@raypx/core/agents");
  const save = vi.fn(async () => true);
  const agentId = agentIdSchema.parse("reader");
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <OpenApiServerForm
        initial={server}
        agents={[
          { id: agentId, name: "Reader" },
          { id: agentIdSchema.parse("writer"), name: "Writer" },
        ]}
        onClose={vi.fn()}
        onSave={save}
      />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Selected Agents" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Reader" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ availability: { mode: "selected", agentIds: [agentId] } }),
      undefined,
      undefined,
    ),
  );
});
