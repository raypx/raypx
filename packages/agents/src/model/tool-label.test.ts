import { expect, it, vi } from "vitest";
import { computerToolNameSchema } from "@raypx/core/approvals";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
import {
  toolDisplayLabel,
  toolOperationLabel,
  openApiOperationKind,
  type ToolLabelKey,
} from "./tool-label.js";

const names = [
  ...computerToolNameSchema.options,
  "agent_send_message",
  "agent_delegate",
  "agent_wait",
];
it.each(["en", "zh"] as const)("resolves every built-in through the %s catalog", (language) => {
  const catalog = { en, zh }[language].agents.tools;
  const translate = vi.fn((key: ToolLabelKey) => catalog[key.slice(6) as keyof typeof catalog]);
  for (const name of names) {
    const key = toolDisplayLabel(name);
    expect(key).toMatch(/^tools\./);
    expect(Object.hasOwn(catalog, key.slice(6))).toBe(true);
    const result = toolDisplayLabel(name, translate);
    expect(result).toBe(catalog[key.slice(6) as keyof typeof catalog]);
    expect(translate).toHaveBeenLastCalledWith(key);
  }
});

it("shows the remote operation without exposing its server identity", () => {
  const translate = vi.fn();
  expect(toolDisplayLabel("mcp_0123456789abcdef0123456789abcdef__read_page", translate)).toBe(
    "MCP / read page",
  );
  expect(translate).not.toHaveBeenCalled();
  const long = toolDisplayLabel(`mcp_${"server".repeat(40)}__${"tool".repeat(40)}`);
  expect(long.length).toBeLessThanOrEqual(128);
  expect(long).toContain("MCP / ");
  expect(long).toContain(" / tool");
});

it.each(
  [
    "",
    "__proto__",
    "constructor",
    "mcp_",
    "mcp_server__",
    "<script>alert('x')</script>\u0000\u202e",
    "x".repeat(10_000),
  ].map((name) => ({ name, title: name.slice(0, 30) })),
)("handles empty or malformed names as bounded plain text ($title)", ({ name }) => {
  const label = toolDisplayLabel(name);
  expect(label.length).toBeGreaterThan(0);
  expect(label.length).toBeLessThanOrEqual(128);
  expect(label).not.toMatch(/[<>]/);
  expect(label).not.toContain("\u0000");
  expect(label).not.toContain("\u202e");
});

it("uses bounded server-produced operation labels and explicit HTTP classifications", () => {
  const toolName = "openapi_0123456789abcdef0123456789abcdef__createItem";
  expect(toolDisplayLabel(toolName)).toBe("API / createItem");
  expect(toolOperationLabel({ toolName, argumentSummary: "POST Create inventory item" })).toBe(
    "Create inventory item",
  );
  expect(
    toolOperationLabel({ toolName, argumentSummary: "POST \u202e" + "x".repeat(500) }),
  ).toHaveLength(160);
  expect(openApiOperationKind({ toolName, target: "GET https://api.example.test/items" })).toBe(
    "readOnly",
  );
  expect(openApiOperationKind({ toolName, target: "HEAD https://api.example.test/items" })).toBe(
    "readOnly",
  );
  expect(openApiOperationKind({ toolName, target: "POST https://api.example.test/items" })).toBe(
    "mutating",
  );
  expect(
    openApiOperationKind({ toolName: "computer_read_file", target: "GET notes.txt" }),
  ).toBeNull();
});
