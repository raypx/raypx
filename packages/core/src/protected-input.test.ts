import { expect, it } from "vitest";
import { protectedInputSpecSchema, protectedHeaderSchema } from "./protected-input.js";

it.each(["file", "keyboard", "graphical", "mcp-argument"])(
  "refuses the unsupported %s destination without accepting a value field",
  (kind) => {
    expect(
      protectedInputSpecSchema.safeParse({
        name: "Credential",
        purpose: "Authenticate once",
        destination: { kind },
      }).success,
    ).toBe(false);
  },
);
it.each([
  "Host",
  "cookie",
  "content-length",
  "connection",
  "proxy-authorization",
  "sec-fetch-site",
  "mcp-session-id",
  "x-forwarded-host",
  "x-key\r\nInjected",
])("refuses routing and protocol header %s", (header) =>
  expect(protectedHeaderSchema.safeParse(header).success).toBe(false),
);
