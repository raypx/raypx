import { describe, expect, it, vi } from "vitest";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  MobilePagesController,
  MobileResourcesController,
  pagesWebDestination,
} from "./controllers.js";
import { agentId, page, resourcePorts, server, skill, spaceId } from "../../tests/resources.js";

describe("native Pages controller", () => {
  it("builds a Web workspace destination without authenticated content frames", () => {
    const destination = new URL(pagesWebDestination("https://raypx.test", spaceId, page));
    expect(destination.pathname).toBe("/pages");
    expect(destination.searchParams.get("pageId")).toBe(page.id);
    expect(destination.searchParams.get("spaceId")).toBe(spaceId);
    expect(
      pagesWebDestination("https://raypx.test", spaceId, {
        ...page,
        spaceId: spaceIdSchema.parse("other"),
      }),
    ).not.toContain("pageId");
  });
  it("lists within the contract bound and opens only current-Space Page identities", async () => {
    const list = vi.fn(async () => [page]);
    const open = vi.fn(async () => {});
    const controller = new MobilePagesController({ list }, spaceId, "https://raypx.test", open);
    await controller.load();
    expect(list).toHaveBeenCalledWith({ spaceId, limit: 100 });
    expect(controller.getSnapshot().pages).toEqual([page]);
    await controller.open({ ...page, spaceId: spaceIdSchema.parse("other") });
    expect(open).not.toHaveBeenCalled();
    await controller.open(page);
    expect(open).toHaveBeenCalledWith("https://raypx.test/pages?spaceId=space-one&pageId=page-one");
    controller.dispose();
  });
  it("exposes list/open failures and explicit retries", async () => {
    const list = vi.fn(async () => [page]).mockRejectedValueOnce(new Error("offline"));
    const open = vi.fn(async () => {}).mockRejectedValueOnce(new Error("unavailable"));
    const controller = new MobilePagesController({ list }, spaceId, "https://raypx.test", open);
    await controller.load();
    expect(controller.getSnapshot().error).toBe(true);
    await controller.load();
    expect(controller.getSnapshot().error).toBe(false);
    await controller.open(page);
    expect(controller.getSnapshot().error).toBe(true);
    await controller.open(page);
    expect(controller.getSnapshot().error).toBe(false);
    expect(open).toHaveBeenCalledTimes(2);
    controller.dispose();
  });
  it("fences late loads and guards duplicate handoffs", async () => {
    let finish!: (value: (typeof page)[]) => void;
    const list = vi.fn(
      () =>
        new Promise<(typeof page)[]>((resolve) => {
          finish = resolve;
        }),
    );
    let opened!: () => void;
    const open = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          opened = resolve;
        }),
    );
    const controller = new MobilePagesController({ list }, spaceId, "https://raypx.test", open);
    const loading = controller.load();
    const first = controller.open(page);
    await controller.open(page);
    expect(open).toHaveBeenCalledOnce();
    opened();
    await first;
    controller.dispose();
    finish([page]);
    await loading;
    expect(controller.getSnapshot().pages).toEqual([]);
  });
});

describe("native resource controller", () => {
  it("loads shared feature catalogs and scopes API reads to the selected owned Space", async () => {
    const ports = resourcePorts();
    const controller = new MobileResourcesController(ports, spaceId, agentId, true);
    await controller.load();
    expect(controller.getSnapshot()).toMatchObject({ loading: false, error: false });
    expect(controller.skills.getSnapshot().skills).toEqual([skill]);
    expect(ports.openApiServers.list).toHaveBeenCalledWith({ spaceId });
    expect(ports.openApiServers.create).not.toHaveBeenCalled();
    controller.dispose();
  });
  it("does not issue owner-only API requests for members", async () => {
    const ports = resourcePorts();
    const controller = new MobileResourcesController(ports, spaceId, undefined, false);
    await controller.load();
    expect(ports.openApiServers.list).not.toHaveBeenCalled();
    await controller.toggle("skill", skill.id, true);
    expect(ports.skills.setAgentSkills).not.toHaveBeenCalled();
    controller.dispose();
  });
  it("uses shared member-Agent enablement and authoritative readback", async () => {
    const ports = resourcePorts();
    const controller = new MobileResourcesController(ports, spaceId, agentId, true);
    await controller.load();
    await controller.toggle("skill", skill.id, true);
    expect(ports.skills.setAgentSkills).toHaveBeenLastCalledWith({
      spaceId,
      agentId,
      ids: [skill.id],
    });
    await controller.toggle("server", server.id, true);
    expect(ports.mcpServers.setEnabled).toHaveBeenLastCalledWith({
      spaceId,
      agentId,
      serverIds: [server.id],
    });
    expect(controller.getSnapshot().selection).toEqual({
      skillIds: [skill.id],
      serverIds: [server.id],
    });
    expect(ports.skills.update).not.toHaveBeenCalled();
    expect(ports.mcpServers.update).not.toHaveBeenCalled();
    controller.dispose();
  });
  it("refuses unavailable resources and arbitrary identifiers", async () => {
    const ports = resourcePorts();
    ports.skills.list.mockResolvedValue([
      { ...skill, availability: { mode: "selected", spaceIds: [] } },
    ]);
    const controller = new MobileResourcesController(ports, spaceId, agentId, true);
    await controller.load();
    await controller.toggle("skill", skill.id, true);
    await controller.toggle("server", "missing", true);
    expect(ports.skills.setAgentSkills).not.toHaveBeenCalled();
    controller.dispose();
  });
  it("reports failed enablement and re-reads independently settled writes", async () => {
    const ports = resourcePorts();
    ports.mcpServers.setEnabled.mockRejectedValueOnce(new Error("offline"));
    const controller = new MobileResourcesController(ports, spaceId, agentId, true);
    await controller.load();
    await controller.toggle("skill", skill.id, true);
    expect(controller.getSnapshot()).toMatchObject({
      error: true,
      busy: false,
      selection: { skillIds: [skill.id], serverIds: [] },
    });
    await controller.load();
    expect(controller.getSnapshot().error).toBe(false);
    controller.dispose();
  });
  it("reports catalog failures and ignores operations after disposal", async () => {
    const ports = resourcePorts();
    ports.skills.list.mockRejectedValue(new Error("offline"));
    const controller = new MobileResourcesController(ports, spaceId, agentId, true);
    await controller.load();
    expect(controller.getSnapshot().error).toBe(true);
    controller.dispose();
    const count = ports.skills.list.mock.calls.length;
    await controller.load();
    await controller.toggle("skill", skill.id, true);
    expect(ports.skills.list).toHaveBeenCalledTimes(count);
    expect(ports.skills.setAgentSkills).not.toHaveBeenCalled();
  });
  it("switches all-Space availability explicitly to the current Space without definition writes", async () => {
    const ports = resourcePorts();
    const controller = new MobileResourcesController(ports, spaceId, undefined, false);
    await controller.load();
    await controller.setAllSpaces("skill", skill.id, false);
    expect(ports.skills.setAvailability).toHaveBeenLastCalledWith({
      spaceId,
      id: skill.id,
      availability: { mode: "selected", spaceIds: [spaceId] },
    });
    await controller.setAllSpaces("server", server.id, false);
    expect(ports.mcpServers.setAvailability).toHaveBeenLastCalledWith({
      id: server.id,
      availability: { mode: "selected", spaceIds: [spaceId] },
    });
    await controller.setAllSpaces("server", server.id, true);
    expect(controller.servers.getSnapshot().servers[0]?.availability).toEqual({ mode: "all" });
    expect(ports.skills.update).not.toHaveBeenCalled();
    expect(ports.mcpServers.update).not.toHaveBeenCalled();
    controller.dispose();
  });
  it("preserves other selected Space IDs when toggling the current Space", async () => {
    const ports = resourcePorts();
    const other = spaceIdSchema.parse("space-other");
    ports.skills.list.mockResolvedValue([
      { ...skill, availability: { mode: "selected", spaceIds: [spaceId, other] } },
    ]);
    ports.mcpServers.list.mockResolvedValue([
      { ...server, availability: { mode: "selected", spaceIds: [other] } },
    ]);
    const controller = new MobileResourcesController(ports, spaceId, undefined, false);
    await controller.load();
    await controller.setCurrentSpace("skill", skill.id, false);
    expect(ports.skills.setAvailability).toHaveBeenLastCalledWith({
      spaceId,
      id: skill.id,
      availability: { mode: "selected", spaceIds: [other] },
    });
    await controller.setCurrentSpace("server", server.id, true);
    expect(ports.mcpServers.setAvailability).toHaveBeenLastCalledWith({
      id: server.id,
      availability: { mode: "selected", spaceIds: [other, spaceId] },
    });
    controller.dispose();
  });
  it("does not expose availability writes for Space-created skills or unknown resources", async () => {
    const ports = resourcePorts();
    ports.skills.list.mockResolvedValue([{ ...skill, ownership: "space", spaceId }]);
    const controller = new MobileResourcesController(ports, spaceId, undefined, false);
    await controller.load();
    await controller.setAllSpaces("skill", skill.id, true);
    await controller.setAllSpaces("server", "missing", true);
    await controller.setCurrentSpace("server", server.id, false);
    expect(ports.skills.setAvailability).not.toHaveBeenCalled();
    expect(ports.mcpServers.setAvailability).not.toHaveBeenCalled();
    controller.dispose();
  });
  it("retains availability and shows failed updates for explicit retry", async () => {
    const ports = resourcePorts();
    ports.skills.setAvailability.mockRejectedValueOnce(new Error("offline"));
    const controller = new MobileResourcesController(ports, spaceId, undefined, false);
    await controller.load();
    await controller.setAllSpaces("skill", skill.id, false);
    expect(controller.getSnapshot()).toMatchObject({ busy: false, error: true });
    expect(controller.skills.getSnapshot().skills[0]?.availability).toEqual({ mode: "all" });
    await controller.setAllSpaces("skill", skill.id, false);
    expect(controller.getSnapshot().error).toBe(false);
    controller.dispose();
  });
});
