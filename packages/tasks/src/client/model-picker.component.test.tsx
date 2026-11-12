import { BrowserLanguageProvider } from "../../tests/i18n.js";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vite-plus/test";

import { useState } from "react";
import type { ModelCatalog, ModelSelection } from "@raypx/core/tasks";
import { ModelPicker } from "./model-picker.js";
import userEvent from "@testing-library/user-event";

const first: ModelSelection = { provider: "local", model: "first", connectionId: "a".repeat(64) };
const second: ModelSelection = { provider: "local", model: "second", connectionId: "a".repeat(64) };
const catalog: ModelCatalog = {
  default: first,
  models: [first, second].map((selection) => ({
    id: selection.model,
    name: selection.model,
    provider: selection.provider,
    selection,
    api: "openai-completions",
    input: ["text"],
    reasoning: false,
    contextWindow: 4096,
    maxTokens: 512,
    configured: true,
    origin: "http://localhost:1234",
  })),
};
beforeEach(() => localStorage.setItem("raypx_locale", "en"));
it("selects a device default, changes a run model and explicitly saves the default", async () => {
  const setDefault = vi.fn(async (input: { model: ModelSelection | null }) => ({
    default: input.model,
  }));
  const ready = vi.fn();
  const client = { list: async () => catalog, setDefault };
  function View() {
    const [value, setValue] = useState<ModelSelection>();
    return <ModelPicker client={client} value={value} onChange={setValue} onReady={ready} />;
  }
  render(
    <BrowserLanguageProvider>
      <View />
    </BrowserLanguageProvider>,
  );
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Model" }));
  await user.click(screen.getByRole("option", { name: "local · second · http://localhost:1234" }));
  fireEvent.click(screen.getByRole("button", { name: "Use as device default" }));
  await waitFor(() => expect(setDefault).toHaveBeenCalledWith({ model: second }));
});
it("does not apply a late catalog after the picker loses its owner", async () => {
  let resolve!: (value: ModelCatalog) => void;
  const changed = vi.fn();
  const client = {
    list: () =>
      new Promise<ModelCatalog>((done) => {
        resolve = done;
      }),
    setDefault: async () => ({ default: null }),
  };
  const view = render(
    <BrowserLanguageProvider>
      <ModelPicker client={client} value={undefined} onChange={changed} />
    </BrowserLanguageProvider>,
  );
  view.unmount();
  resolve(catalog);
  await Promise.resolve();
  expect(changed).not.toHaveBeenCalled();
});

it("searches providers and models with the keyboard, then restores focus", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  render(
    <BrowserLanguageProvider>
      <ModelPicker
        client={{ list: async () => catalog, setDefault: async () => ({ default: null }) }}
        value={first}
        onChange={changed}
      />
    </BrowserLanguageProvider>,
  );
  const trigger = screen.getByRole("combobox", { name: "Model" });
  await waitFor(() => expect(trigger).toBeEnabled());
  await user.click(trigger);
  const search = screen.getByRole("combobox", { name: "Search models…" });
  await user.type(search, "LOCAL");
  expect(screen.getAllByRole("option")).toHaveLength(2);
  await user.clear(search);
  await user.type(search, "second");
  expect(screen.queryByRole("option", { name: /local · first/ })).not.toBeInTheDocument();
  await user.keyboard("[ArrowDown][Enter]");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(changed).toHaveBeenLastCalledWith(second);
  expect(trigger).toHaveFocus();
});

it("keeps the current unavailable model visible and Escape cancels an empty search", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const unavailable = {
    ...catalog,
    models: catalog.models.map((model) => ({ ...model, configured: false })),
  };
  render(
    <BrowserLanguageProvider>
      <ModelPicker
        client={{ list: async () => unavailable, setDefault: async () => ({ default: null }) }}
        value={first}
        onChange={changed}
      />
    </BrowserLanguageProvider>,
  );
  const trigger = screen.getByRole("combobox", { name: "Model" });
  await waitFor(() => expect(trigger).toBeEnabled());
  await user.click(trigger);
  expect(screen.getByRole("option", { name: /local · first/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.queryByRole("option", { name: /local · second/ })).not.toBeInTheDocument();
  await user.type(screen.getByRole("combobox", { name: "Search models…" }), "absent");
  expect(screen.getByText("No matching models.")).toBeVisible();
  await user.keyboard("[Escape]");
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(changed).not.toHaveBeenCalled();
  expect(trigger).toHaveTextContent("local · first");
  expect(trigger).toHaveFocus();
});

it("distinguishes identically named models on separate connections", async () => {
  const user = userEvent.setup();
  const target = { ...first, connectionId: "b".repeat(64) };
  const duplicate = { ...catalog.models[0]!, selection: target, origin: "http://localhost:5678" };
  const changed = vi.fn();
  render(
    <BrowserLanguageProvider>
      <ModelPicker
        client={{
          list: async () => ({ models: [catalog.models[0]!, duplicate], default: first }),
          setDefault: async () => ({ default: null }),
        }}
        value={first}
        onChange={changed}
      />
    </BrowserLanguageProvider>,
  );
  const trigger = screen.getByRole("combobox", { name: "Model" });
  await waitFor(() => expect(trigger).toBeEnabled());
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: "local · first · http://localhost:5678" }));
  expect(changed).toHaveBeenLastCalledWith(target);
});
