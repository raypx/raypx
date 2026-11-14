import { expect, type Page } from "@playwright/test";
import { accessForRole } from "@raypx/account/access";
import { desktop, test } from "@raypx/e2e/testing";

const channelUrl = "ws://127.0.0.1:43219/desktop";
const accountId = "native-events-fixture";
const spaceId = "events-space";
const agentId = "events-agent";
const createdAt = "2026-11-13T00:00:00.000Z";
const space = { id: spaceId, name: "Event fixture Space", createdAt, updatedAt: createdAt };
const member = { spaceId, accountId, role: "member", createdAt };
const agent = {
  id: agentId,
  spaceId,
  name: "Event fixture Agent",
  instructions: "",
  model: { modelId: "fixture" },
  createdAt,
  updatedAt: createdAt,
};
const conversation = { id: "events-conversation", spaceId, agentId, kind: "direct", createdAt };

/** Simulate the private daemon channel, exercising the compiled native renderer adapter.
 * This does not launch Go, a daemon, PostgreSQL or a packaged WebView. */
async function nativeEventsFixture(page: Page) {
  await page.addInitScript((url) => {
    Object.assign(window, {
      __raypxDesktopHost: "mygo",
      __raypxConnection: { apiUrl: "https://api.example.test", webUrl: "https://web.example.test" },
      __raypxDevicePreferences: { status: "read", raw: { theme: "light", locale: "en" } },
      mygo: {
        async call(name: string, method: string) {
          if (name !== "Desktop.Request") throw new Error("Unexpected native fixture call");
          if (method === "get_channel")
            return {
              protocol: 1,
              url,
              capability: "fixture-only-".repeat(6),
              expiresAt: new Date(Date.now() + 30_000).toISOString(),
            };
          if (method === "get_runtime")
            return {
              appVersion: "fixture",
              platform: "darwin",
              trayEnabled: false,
              engine: { status: "ready" },
            };
          if (method === "get_analytics_preferences") return null;
          if (method === "save_preferences") return true;
          throw new Error(`Unexpected native fixture method: ${method}`);
        },
      },
    });
  }, channelUrl);
  let departed = false;
  let terminal: { type: "closed"; code: number; reason: string } | undefined;
  const subscriptions = new Set<string>();
  const unexpected: string[] = [];
  const streams = new Map<string, { ready: boolean; reader?: string }>();
  let finish!: (code: number, reason: string) => void;
  const availableModes = [
    { mode: "ask", available: true, reasonCode: null },
    { mode: "never", available: true, reasonCode: null },
    { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
  ];
  const user = {
    id: accountId,
    name: "Event fixture member",
    email: "events@example.test",
    emailVerified: true,
    createdAt,
    updatedAt: createdAt,
  };
  function api(path: string) {
    if (path.startsWith("/api/auth/get-session"))
      return {
        user,
        session: {
          id: "fixture-session",
          userId: accountId,
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdAt,
          updatedAt: createdAt,
        },
      };
    const reads: Record<string, unknown> = {
      "/rpc/account/access": accessForRole("member", accountId),
      "/rpc/account/get": { id: accountId, name: user.name, email: user.email },
      "/rpc/spaces/list": departed ? [] : [{ space, member }],
      "/rpc/spaces/get": space,
      "/rpc/spaces/members": [{ ...member, name: user.name, image: null }],
      "/rpc/agents/list": [{ agent, conversation }],
      "/rpc/agents/models": [{ modelId: "fixture", name: "Fixture model" }],
      "/rpc/conversations/listGroups": [],
      "/rpc/conversations/history": {
        conversation,
        messages: [],
        runs: [],
        segments: [],
        cursor: 0,
        olderCursor: null,
        runsTruncated: false,
        segmentsTruncated: false,
      },
      "/rpc/computers/get": { status: "not-configured" },
      "/rpc/deviceComputers/list": { devices: [] },
      "/rpc/deviceComputers/getSelection": { selection: null },
      "/rpc/approvals/pending": [],
      "/rpc/approvals/settings": { revision: 0, mode: "ask", rules: [], availableModes },
      "/rpc/approvals/effectiveMode": {
        spaceId,
        mode: "ask",
        source: "account_default",
        availableModes,
      },
    };
    if (!Object.hasOwn(reads, path)) {
      unexpected.push(path);
      throw new Error(`Unexpected API fixture read: ${path}`);
    }
    return { json: reads[path] };
  }
  await page.routeWebSocket("**/events", () => unexpected.push("browser /events"));
  await page.routeWebSocket(channelUrl, (socket) => {
    function reply(id: string, result: unknown) {
      socket.send(JSON.stringify({ type: "response", id, result }));
    }
    finish = (code, reason) => {
      departed = true;
      terminal = { type: "closed", code, reason };
      for (const stream of streams.values()) {
        if (stream.reader) {
          reply(stream.reader, terminal);
          delete stream.reader;
        }
      }
    };
    socket.onMessage((data) => {
      const packet = JSON.parse(String(data));
      if (packet.type === "authenticate") {
        socket.send(JSON.stringify({ type: "ready", protocol: 1, streamId: crypto.randomUUID() }));
        return;
      }
      if (packet.type !== "request") return;
      const { id, method, params } = packet;
      if (method === "api_fetch") {
        reply(id, {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(api(params.path.split("?")[0])),
        });
      } else if (
        method === "local_request" &&
        ["instance.status", "instance.refresh"].includes(params.method)
      ) {
        reply(id, { state: "registered" });
      } else if (method === "events_open") {
        streams.set(params.id, { ready: false });
        reply(id, true);
      } else if (method === "events_read") {
        const stream = streams.get(params.id)!;
        if (terminal) reply(id, terminal);
        else if (!stream.ready) {
          stream.ready = true;
          reply(id, { type: "ready", version: 1 });
        } else stream.reader = id;
      } else if (method === "events_send") {
        subscriptions.add(params.frame.type);
        reply(id, true);
      } else if (method === "events_close") {
        const reader = streams.get(params.id)?.reader;
        if (reader) reply(reader, null);
        streams.delete(params.id);
        reply(id, true);
      } else {
        unexpected.push(method);
        throw new Error(`Unexpected daemon fixture method: ${method}`);
      }
    });
  });
  return {
    subscriptions,
    unexpected,
    end: (code: number, reason: string) => finish(code, reason),
  };
}

for (const [code, reason, notice] of [
  [4003, "SPACE_MEMBER_REMOVED", "You were removed from this Space."],
  [4003, "SPACE_MEMBER_LEFT", "You left this Space."],
  [4003, "SPACE_DELETING", "This Space is being deleted."],
  [4001, "SESSION_ENDED", null],
  [4999, "", "Access to this Space has ended."],
] as const) {
  test(`Desktop native channel preserves ${reason || "unknown close"} @desktop`, async ({
    page,
  }) => {
    const fixture = await nativeEventsFixture(page);
    await page.goto(`${desktop}/#/agents?spaceId=${spaceId}&agentId=${agentId}`);
    await expect(page.locator("[data-conversation-header] h1")).toHaveText(agent.name);
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(composer).toBeVisible();
    await composer.fill("Unsent native fixture draft");
    await expect
      .poll(() => [...fixture.subscriptions])
      .toEqual(expect.arrayContaining(["subscribe", "space.subscribe"]));
    fixture.end(code, reason);
    if (notice)
      await expect(page.getByRole("status").filter({ hasText: notice })).toHaveText(notice);
    else await expect(page).toHaveURL(/#\/login\?/);
    await expect(composer).toBeHidden();
    expect(fixture.unexpected).toEqual([]);
  });
}
