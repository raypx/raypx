import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { useState } from "react";
import type { ModelCatalog, ModelSelection } from "@raypx/core/tasks";
import { ModelPicker } from "./model-picker.js";
import { selectOption } from "../../tests/helpers/select.js";

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
  await selectOption("Model", JSON.stringify([second.provider, second.model, second.connectionId]));
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
