/** @vitest-environment happy-dom */
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { mocks, mount } from "../tests/helpers/router-local.js";
import { getRouter } from "./router.js";

const routers: ReturnType<typeof getRouter>[] = [];
afterEach(() => {
  for (const router of routers.splice(0)) router.history.destroy();
});

async function openCurrentLocation() {
  const router = getRouter();
  routers.push(router);
  await router.load();
  let view!: ReturnType<typeof mount>;
  await act(async () => {
    view = mount(router);
  });
  return { router, view };
}

describe("Desktop browser routing", () => {
  it("restores deep paths and encoded search with browser back and forward", async () => {
    const path = "design & notes/设计";
    window.history.replaceState(
      {},
      "",
      `/files?${new URLSearchParams({ rootId: "work", path, offset: "100" })}`,
    );
    const { router } = await openCurrentLocation();
    expect(await screen.findByText("This folder is empty.")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/files");
    expect(router.state.location.search).toMatchObject({ rootId: "work", path, offset: 100 });
    expect(mocks.localRequest).toHaveBeenCalledWith("files.list", {
      rootId: "work",
      path,
      offset: 100,
      limit: 100,
    });

    await act(async () => {
      await router.navigate({
        to: "/automations",
        search: { scope: "local", project: "work", device: "computer & 设计" },
      });
    });
    expect(window.location.pathname).toBe("/automations");
    expect(new URLSearchParams(window.location.search).get("device")).toBe("computer & 设计");
    expect(window.location.hash).toBe("");

    await act(async () => window.history.back());
    await waitFor(() => expect(router.state.location.pathname).toBe("/files"));
    expect(router.state.location.search).toMatchObject({ rootId: "work", path, offset: 100 });
    expect(new URLSearchParams(window.location.search).get("path")).toBe(path);
    expect(new URLSearchParams(window.location.search).get("offset")).toBe("100");
    expect(await screen.findByText("This folder is empty.")).toBeTruthy();

    await act(async () => window.history.forward());
    await waitFor(() => expect(router.state.location.pathname).toBe("/automations"));
    expect(router.state.location.search).toMatchObject({
      scope: "local",
      project: "work",
      device: "computer & 设计",
    });
    expect(window.location.pathname).toBe("/automations");
    expect(new URLSearchParams(window.location.search).get("project")).toBe("work");
  });

  it("reopens the current deep URL after recreating the renderer router", async () => {
    window.history.replaceState({}, "", "/files");
    const first = await openCurrentLocation();
    await act(async () => {
      await first.router.navigate({
        to: "/files",
        search: { rootId: "work", path: "src/设计 & notes", offset: 200 },
      });
    });
    const href = window.location.href;
    first.view.unmount();
    first.router.history.destroy();
    mocks.localRequest.mockClear();

    const restored = await openCurrentLocation();
    expect(await screen.findByText("This folder is empty.")).toBeTruthy();
    expect(window.location.href).toBe(href);
    expect(restored.router.state.location.pathname).toBe("/files");
    expect(restored.router.state.location.search).toMatchObject({
      rootId: "work",
      path: "src/设计 & notes",
      offset: 200,
    });
    expect(mocks.localRequest).toHaveBeenCalledWith("files.list", {
      rootId: "work",
      path: "src/设计 & notes",
      offset: 200,
      limit: 100,
    });
  });
});
