import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobilePagesController, MobileResourcesController } from "./controllers.js";
import { PagesDirectory, ResourcesDirectory } from "./screens.js";
import { act, findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { useLocales } from "../../tests/mocks/localization.js";
import { emitAppState } from "../../tests/mocks/react-native.js";
import { agentId, page, resourcePorts, skill, spaceId } from "../../tests/resources.js";

afterEach(() => {
  useLocales.mockReset();
});

describe("native Pages directory", () => {
  it.each([
    { language: "en", title: "Pages", open: "Open Page: Notes", back: "Back" },
    { language: "zh", title: "页面", open: "打开页面：Notes", back: "返回" },
  ])(
    "lists and hands off Pages in $language without document embedding",
    async ({ language, title, open, back }) => {
      useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
      const list = vi.fn(async () => [page]);
      const openWeb = vi.fn(async () => {});
      const onBack = vi.fn();
      const controller = new MobilePagesController(
        { list },
        spaceId,
        "https://raypx.test",
        openWeb,
      );
      const view = await renderNative(
        <StrictMode>
          <PagesDirectory controller={controller} onBack={onBack} />
        </StrictMode>,
      );
      expect(textContent(view.root)).toContain(title);
      expect(view.root.findAll((node) => node.type.toString() === "FlatList")).toHaveLength(1);
      expect(view.root.findAll((node) => /webview|iframe/i.test(String(node.type)))).toHaveLength(
        0,
      );
      await press(findByLabel(view.root, open));
      expect(openWeb).toHaveBeenCalledWith(
        "https://raypx.test/pages?spaceId=space-one&pageId=page-one",
      );
      await press(findByLabel(view.root, back));
      expect(onBack).toHaveBeenCalledOnce();
      await act(async () => {
        emitAppState("active");
      });
      expect(list).toHaveBeenCalledTimes(2);
      await view.unmount();
    },
  );
  it("shows offline failures and keeps refresh reachable", async () => {
    const list = vi.fn(async () => [page]).mockRejectedValueOnce(new Error("offline"));
    const controller = new MobilePagesController(
      { list },
      spaceId,
      "https://raypx.test",
      vi.fn(async () => {}),
    );
    const view = await renderNative(<PagesDirectory controller={controller} onBack={vi.fn()} />);
    expect(textContent(view.root)).toContain("Could not refresh or open this resource");
    await press(findByLabel(view.root, "Refresh"));
    expect(textContent(view.root)).toContain("Notes");
    expect(textContent(view.root)).not.toContain("Could not refresh");
    await view.unmount();
  });
});

describe("native resources directory", () => {
  it.each([
    {
      language: "en",
      title: "Skills and tools",
      enable: "Enable Read carefully for this Agent",
      read: "Read document · GET · Read",
      write: "Save document · POST · Change",
    },
    {
      language: "zh",
      title: "技能与工具",
      enable: "为此智能体启用Read carefully",
      read: "Read document · GET · 读取",
      write: "Save document · POST · 修改",
    },
  ])(
    "shows read-only definitions and Agent enablement in $language",
    async ({ language, title, enable, read, write }) => {
      useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
      const ports = resourcePorts();
      const controller = new MobileResourcesController(ports, spaceId, agentId, true);
      const view = await renderNative(
        <ResourcesDirectory
          controller={controller}
          onBack={vi.fn()}
          onManageWeb={vi.fn(async () => {})}
        />,
      );
      const content = textContent(view.root);
      expect(content).toContain(title);
      expect(content).toContain(read);
      expect(content).toContain(write);
      expect(content).not.toContain(skill.body);
      const toggle = findByLabel(view.root, enable);
      expect(toggle.props.accessibilityRole).toBe("switch");
      expect(toggle.props.isSelected).toBe(false);
      await act(async () => {
        toggle.props.onSelectedChange(true);
      });
      expect(findByLabel(view.root, enable).props.isSelected).toBe(true);
      expect(ports.skills.setAgentSkills).toHaveBeenCalledWith({
        spaceId,
        agentId,
        ids: [skill.id],
      });
      expect(ports.openApiServers.update).not.toHaveBeenCalled();
      await view.unmount();
    },
  );
  it("keeps catalog-only resources read-only and exposes failed Web handoff", async () => {
    const ports = resourcePorts();
    const controller = new MobileResourcesController(ports, spaceId, undefined, false);
    const open = vi.fn(async () => {
      throw new Error("no browser");
    });
    const view = await renderNative(
      <ResourcesDirectory controller={controller} onBack={vi.fn()} onManageWeb={open} />,
    );
    expect(
      view.root.findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.accessibilityRole === "switch" &&
          node.props.accessibilityLabel.startsWith("Enable "),
      ),
    ).toHaveLength(0);
    expect(textContent(view.root)).toContain("Space owners can view HTTP API definitions");
    await press(findByLabel(view.root, "Manage in Web"));
    expect(open).toHaveBeenCalledOnce();
    expect(textContent(view.root)).toContain("Could not refresh or open this resource");
    await view.unmount();
  });
  it("offers explicit all-Space and current-Space availability without rewriting definitions", async () => {
    const ports = resourcePorts();
    const controller = new MobileResourcesController(ports, spaceId, undefined, false);
    const view = await renderNative(
      <ResourcesDirectory
        controller={controller}
        onBack={vi.fn()}
        onManageWeb={vi.fn(async () => {})}
      />,
    );
    await act(async () => {
      findByLabel(
        view.root,
        "All Spaces for Read carefully; turn off to keep only this Space",
      ).props.onSelectedChange(false);
    });
    expect(ports.skills.setAvailability).toHaveBeenLastCalledWith({
      spaceId,
      id: skill.id,
      availability: { mode: "selected", spaceIds: [spaceId] },
    });
    const currentSpace = findByLabel(view.root, "Available in this Space: Read carefully");
    expect(currentSpace.props.isSelected).toBe(true);
    await act(async () => {
      currentSpace.props.onSelectedChange(false);
    });
    expect(ports.skills.setAvailability).toHaveBeenLastCalledWith({
      spaceId,
      id: skill.id,
      availability: { mode: "selected", spaceIds: [] },
    });
    expect(textContent(view.root)).toContain("Unavailable in this Space");
    expect(ports.skills.update).not.toHaveBeenCalled();
    await view.unmount();
  });
});
