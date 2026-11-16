import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";
import {
  authResponse,
  signedInAccount,
  webShellFixture,
  accountAccessFixture,
} from "../helpers/account-fixture.js";

const directory = fileURLToPath(new URL("../../../.artifacts/sidebar/", import.meta.url));
const spaceId = "11111111-1111-4111-8111-111111111111";
const at = "2026-11-15T08:00:00.000Z";
const agent = {
  id: "sidebar-agent",
  spaceId,
  name: "Sidebar partner",
  instructions: "",
  model: { modelId: "fixture" },
  createdAt: at,
  updatedAt: at,
  lastActivityAt: at,
};
const conversation = {
  id: "sidebar-conversation",
  spaceId,
  agentId: agent.id,
  kind: "direct",
  createdAt: at,
  lastActivityAt: at,
};

export function registerTests() {
  test("keeps the workspace sidebar through member navigation", async ({ page, base }, info) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const phase = process.env.RAYPX_SIDEBAR_PHASE ?? "after";
    await mkdir(directory, { recursive: true });
    await page.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      return ["localhost", "127.0.0.1", "[::1]"].includes(host) ? route.fallback() : route.abort();
    });
    await page.addInitScript(() => {
      const fetch = window.fetch.bind(window);
      Object.assign(window, {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          const url = new URL(
            input instanceof Request ? input.url : String(input),
            location.origin,
          );
          if (url.pathname !== "/api/events") return fetch(input, init);
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(
                    new TextEncoder().encode('data: {"type":"ready","version":1}\n\n'),
                  );
                },
              }),
              { headers: { "content-type": "text/event-stream" } },
            ),
          );
        },
      });
    });
    await webShellFixture(page);
    const account = await signedInAccount(page);
    await accountAccessFixture(page, account.id, "admin");
    const requests: Record<string, number> = {};
    let showGroup = false;
    const secondAgent = { ...agent, id: "sidebar-agent-two", name: "Sidebar assistant" };
    const group = {
      ...conversation,
      id: "sidebar-group",
      kind: "group",
      name: "Sidebar circle",
      agentIds: [agent.id, secondAgent.id],
    };
    await page.routeWebSocket("**/api/events", (socket) => {
      socket.send(JSON.stringify({ type: "ready", version: 1 }));
      socket.onMessage(() => {});
    });
    await page.route("**/api/rpc/**", async (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const method = new URL(route.request().url()).pathname.split("/api/rpc/")[1]!;
      requests[method] = (requests[method] ?? 0) + 1;
      const modes = ["ask", "never", "auto"].map((mode) => ({
        mode,
        available: true,
        reasonCode: null,
      }));
      const values: Record<string, unknown> = {
        "configuration/public": {
          siteName: "Raypx",
          registrationEnabled: true,
          bootstrap: false,
          setupTokenRequired: false,
          mailConfigured: true,
        },
        "configuration/access": { allowed: true },
        "configuration/setupStatus": { model: true, sandbox: true, mail: true },
        "spaces/list": [
          {
            space: { id: spaceId, name: "Personal", createdAt: at, updatedAt: at },
            member: { spaceId, accountId: account.id, role: "owner", createdAt: at },
          },
        ],
        "spaces/get": { id: spaceId, name: "Personal", createdAt: at, updatedAt: at },
        "spaces/members": [
          {
            spaceId,
            accountId: account.id,
            name: account.name,
            image: null,
            role: "owner",
            createdAt: at,
          },
        ],
        "spaces/invitations": [],
        "spaces/settings": { spaceId, approvalMode: null },
        "agents/list": [
          { agent, conversation },
          ...(showGroup
            ? [
                {
                  agent: secondAgent,
                  conversation: {
                    ...conversation,
                    id: "sidebar-conversation-two",
                    agentId: secondAgent.id,
                  },
                },
              ]
            : []),
        ],
        "agents/models": [{ modelId: "fixture", name: "Fixture", source: "deployment" }],
        "conversations/listGroups": showGroup ? [group] : [],
        "conversations/history": {
          conversation:
            route.request().postDataJSON()?.json?.conversationId === group.id
              ? group
              : conversation,
          messages: [],
          runs: [],
          segments: [],
          cursor: 0,
          olderCursor: null,
          participants: [],
          activeRuns: [],
        },
        "computers/get": { status: "not-configured" },
        "deviceComputers/getSelection": { selection: null },
        "deviceComputers/list": { devices: [] },
        "approvals/effectiveMode": {
          spaceId,
          mode: "ask",
          source: "account_default",
          availableModes: modes,
        },
        "approvals/settings": { mode: "ask", rules: [], revision: 0, availableModes: modes },
        "approvals/pending": [],
        "protectedInputs/pending": [],
        "notifications/list": { items: [], truncated: false },
        "notifications/viewed": { ok: true },
        "pages/list": [],
        "skills/list": [],
        "mcpServers/list": [],
        "openApiServers/list": [],
        "routines/list": [],
      };
      if (!Object.hasOwn(values, method)) return route.fallback();
      const delay = method === "spaces/list" ? 350 : method === "agents/list" ? 500 : 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return authResponse(route, { json: values[method] });
    });
    await page.addInitScript(() => {
      const report = {
        states: [] as { at: number; text: string; geometry: string }[],
        shifts: [] as { value: number; sources: string[] }[],
        activeCounts: [] as number[],
      };
      Object.assign(window, { sidebarReport: report });
      new PerformanceObserver((list) => {
        for (const raw of list.getEntries()) {
          const entry = raw as PerformanceEntry & { value: number; sources: { node?: Node }[] };
          const sources = entry.sources.flatMap(({ node }) =>
            node instanceof Element && node.closest("[data-slot=sidebar]")
              ? [node.outerHTML.slice(0, 220)]
              : [],
          );
          if (sources.length) report.shifts.push({ value: entry.value, sources });
        }
      }).observe({ type: "layout-shift", buffered: true });
      function sample() {
        const sidebar = document.querySelector("[data-slot=sidebar]");
        if (sidebar) {
          const active = sidebar.querySelectorAll("[aria-current=page]").length;
          if (report.activeCounts.at(-1) !== active) report.activeCounts.push(active);
          const text = sidebar.textContent.replace(/\s+/g, " ").trim();
          const geometry = JSON.stringify(
            [
              ...sidebar.querySelectorAll(
                "nav, [data-slot=sidebar-footer], [aria-label=Notifications]",
              ),
            ].map((node) => {
              const r = node.getBoundingClientRect();
              return [r.x, r.y, r.width, r.height];
            }),
          );
          const last = report.states.at(-1);
          if (last?.text !== text || last.geometry !== geometry)
            report.states.push({ at: Math.round(performance.now()), text, geometry });
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const measurements: unknown[] = [];
    async function record(name: string, action: () => Promise<unknown>) {
      if (name !== "cold")
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
      await page.evaluate(() => {
        const report = (
          window as unknown as {
            sidebarReport: { states: unknown[]; shifts: unknown[]; activeCounts: number[] };
          }
        ).sidebarReport;
        report.states = [];
        report.shifts = [];
        report.activeCounts = [];
      });
      const before = { ...requests };
      await action();
      await page.waitForTimeout(2100);
      const report = await page.evaluate(
        () =>
          (
            window as unknown as {
              sidebarReport: {
                states: { text: string }[];
                shifts: { value: number }[];
                activeCounts: number[];
              };
            }
          ).sidebarReport,
      );
      measurements.push({
        name,
        ...report,
        distinctStates: report.states.length,
        sidebarLayoutShift: report.shifts.reduce((sum, entry) => sum + entry.value, 0),
        requests: Object.fromEntries(
          Object.entries(requests)
            .map(([key, value]) => [key, value - (before[key] ?? 0)])
            .filter(([, value]) => value),
        ),
        url: page.url(),
      });
      await writeFile(
        `${directory}/${phase}-${info.project.name}.json`,
        JSON.stringify(measurements, null, 2),
      );
      await page.screenshot({ path: `${directory}/${phase}-${info.project.name}-${name}.png` });
      if (phase !== "before") {
        expect(report.shifts).toEqual([]);
        expect(report.activeCounts.every((count) => count <= 1)).toBe(true);
        if (["pages", "back", "group", "group-pages"].includes(name))
          expect(report.activeCounts.every((count) => count === 1)).toBe(true);
        for (const state of report.states) expect(state.text).not.toMatch(/Loading|正在加载/);
        if (name !== "cold")
          for (const state of report.states) {
            expect(state.text).toContain("Personal");
            expect(state.text).toContain("Sidebar partner");
            expect(state.text).toContain("Recent");
          }
        expect(new URL(page.url()).searchParams.get("spaceId")).toBe(spaceId);
        if (
          [
            "conversation",
            "pages",
            "back",
            "pages-folded",
            "new-folded",
            "settings",
            "settings-pages",
          ].includes(name)
        ) {
          expect((requests["agents/list"] ?? 0) - (before["agents/list"] ?? 0)).toBe(0);
          expect(
            (requests["conversations/listGroups"] ?? 0) - (before["conversations/listGroups"] ?? 0),
          ).toBe(0);
        }
      }
    }
    await page.goto(`${base}/agents?spaceId=${spaceId}`);
    await record("cold", async () => {});
    await expect(page.getByRole("button", { name: agent.name, exact: true })).toBeVisible();
    await record("conversation", () =>
      page.getByRole("button", { name: agent.name, exact: true }).click(),
    );
    await record("pages", () => page.getByRole("link", { name: "Pages", exact: true }).click());
    await record("back", () => page.goBack());
    if (phase !== "before") {
      const sidebar = page.getByRole("complementary");
      await sidebar.getByRole("button", { name: "Collapse Groups", exact: true }).click();
      await expect(
        sidebar.getByRole("button", { name: "Expand Groups", exact: true }),
      ).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 600 });
      const scroll = sidebar.locator("[data-slot=sidebar-content]");
      await scroll.evaluate((node) => {
        node.scrollTop = 12;
      });
      await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBe(12);
      await record("pages-folded", () =>
        sidebar.getByRole("link", { name: "Pages", exact: true }).click(),
      );
      await expect(scroll).toHaveJSProperty("scrollTop", 12);
      await expect(
        sidebar.getByRole("button", { name: "Expand Groups", exact: true }),
      ).toBeVisible();
      await record("new-folded", () =>
        sidebar.getByRole("button", { name: "New", exact: true }).click(),
      );
      await expect(scroll).toHaveJSProperty("scrollTop", 12);
      await record("tools", () =>
        sidebar.getByRole("button", { name: "Tools", exact: true }).click(),
      );
      await page.keyboard.press("Escape");
      await record("routines", () =>
        sidebar.getByRole("button", { name: "Routines", exact: true }).click(),
      );
      await page.keyboard.press("Escape");
      await record("notifications", () =>
        page.getByRole("button", { name: "Notifications", exact: true }).click(),
      );
      await page.keyboard.press("Escape");
      if (info.project.name === "web") {
        await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
        await record("settings", () =>
          page
            .getByRole("dialog", { name: "Settings", exact: true })
            .getByRole("button", { name: "Settings", exact: true })
            .click(),
        );
        await record("settings-pages", () =>
          sidebar.getByRole("link", { name: "Pages", exact: true }).click(),
        );
      }
      await page.reload();
      await expect(
        sidebar.getByRole("button", { name: "Expand Groups", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      await sidebar.getByRole("link", { name: "Pages", exact: true }).click();
      await expect(page.locator("[data-slot=sidebar]")).toHaveAttribute("data-state", "collapsed");
      await page.reload();
      await expect(page.locator("[data-slot=sidebar]")).toHaveAttribute("data-state", "collapsed");
      const pointer = await page.context().newCDPSession(page);
      await pointer.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 1,
      });
      await page.setViewportSize({ width: 375, height: 812 });
      await expect
        .poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches))
        .toBe(true);
      const spaceButton = sidebar.getByRole("button", { name: "Space", exact: true });
      expect(
        await spaceButton.evaluate(
          (node) =>
            node.closest("[data-slot=collapsible-content]")!.getBoundingClientRect().height >=
            node.getBoundingClientRect().height,
        ),
      ).toBe(true);
      await expect(sidebar.getByRole("link", { name: "Pages", exact: true })).toBeVisible();
      await sidebar.getByRole("button", { name: "New", exact: true }).click();
      await expect(page.locator("[data-workspace-home]")).toBeVisible();
      expect(new URL(page.url()).searchParams.get("spaceId")).toBe(spaceId);
      await page.goto(`${base}/agents`);
      await expect(page).toHaveURL((url) => url.searchParams.get("spaceId") === spaceId);
      await sidebar.getByRole("link", { name: "Pages", exact: true }).click();
      await expect(page).toHaveURL(
        (url) => url.pathname === "/pages" && url.searchParams.get("spaceId") === spaceId,
      );
      showGroup = true;
      await page.reload();
      await pointer.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
      await sidebar.getByRole("button", { name: "Expand Groups", exact: true }).click();
      await expect(sidebar.getByRole("button", { name: group.name, exact: true })).toBeVisible();
      await expect(sidebar.getByRole("button", { name: agent.name, exact: true })).toBeVisible();
      await record("group", () =>
        sidebar.getByRole("button", { name: group.name, exact: true }).click(),
      );
      await expect(page).toHaveURL((url) => url.searchParams.get("groupId") === group.id);
      await record("group-pages", () =>
        sidebar.getByRole("link", { name: "Pages", exact: true }).click(),
      );
    }
    expect(pageErrors).toEqual([]);
    await writeFile(
      `${directory}/${phase}-${info.project.name}.json`,
      JSON.stringify(measurements, null, 2),
    );
  });
}
