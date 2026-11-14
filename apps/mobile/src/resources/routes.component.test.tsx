import { afterEach, describe, expect, it, vi } from "vitest";
import { PagesRoute, ResourcesRoute } from "./routes.js";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { Linking } from "../../tests/mocks/react-native.js";
import { agentId, membership, page, resourcePorts, spaceId } from "../../tests/resources.js";
import { useRouteSelection } from "../agents/route-selection.js";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => false),
}));
vi.mock("expo-router", () => ({ useRouter: () => navigation }));
vi.mock("../agents/route-selection.js", () => ({ useRouteSelection: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
});

function selection() {
  const ports = resourcePorts();
  const list = vi.fn(async () => [page]);
  return {
    ports,
    list,
    value: {
      workspace: {
        api: {
          pages: { list },
          skills: ports.skills,
          mcpServers: ports.mcpServers,
          openApiServers: ports.openApiServers,
          spaces: ports.directory.spaces,
          agents: ports.directory.agents,
        },
        owner: { origin: "https://raypx.test" },
      },
      view: { loading: false, refreshing: false, page: { spaces: [membership] } },
      selected: { spaceId, agentId },
      current: true,
      item: { agent: { id: agentId } },
    },
  };
}
function mockSelection(value: unknown) {
  vi.mocked(useRouteSelection).mockReturnValue(value as ReturnType<typeof useRouteSelection>);
}

describe("native resource routes", () => {
  it("opens only selected membership Pages and returns safely without route history", async () => {
    const { value, list } = selection();
    mockSelection(value);
    const view = await renderNative(<PagesRoute />);
    expect(list).toHaveBeenCalledWith({ spaceId, limit: 100 });
    await press(findByLabel(view.root, "Open Page: Notes"));
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://raypx.test/pages?spaceId=space-one&pageId=page-one",
    );
    await press(findByLabel(view.root, "Back"));
    expect(navigation.replace).toHaveBeenCalledWith("/");
    await view.unmount();
  });
  it("does not read a foreign Space selected by a route", async () => {
    const { value, list } = selection();
    mockSelection({ ...value, current: false });
    const view = await renderNative(<PagesRoute />);
    expect(list).not.toHaveBeenCalled();
    expect(textContent(view.root)).toContain("This Space or Agent is unavailable");
    await view.unmount();
  });
  it("opens full resource management with the selected Space and no credentials", async () => {
    const { value } = selection();
    mockSelection(value);
    const view = await renderNative(<ResourcesRoute />);
    await press(findByLabel(view.root, "Manage in Web"));
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://raypx.test/agents?spaceId=space-one#settings/tools",
    );
    await view.unmount();
  });
  it("waits for membership refresh and refuses missing Agents", async () => {
    const { value, ports } = selection();
    mockSelection({ ...value, current: false, view: { ...value.view, loading: true } });
    const loading = await renderNative(<ResourcesRoute />);
    expect(findByLabel(loading.root, "Loading…")).toBeDefined();
    expect(ports.skills.list).not.toHaveBeenCalled();
    await loading.unmount();
    mockSelection({ ...value, item: undefined });
    const unavailable = await renderNative(<ResourcesRoute />);
    expect(textContent(unavailable.root)).toContain("This Space or Agent is unavailable");
    expect(ports.skills.list).not.toHaveBeenCalled();
    await unavailable.unmount();
  });
});
